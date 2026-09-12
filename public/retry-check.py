#!/usr/bin/env python3
"""Compare actual curl GET retries using two isolated Retry Trace runs.

Python 3.9+ standard library and curl. Diagnostics never publish.
Optionally retain a private session for a separate, deliberate publication.
Read the source before running. Output omits private run capabilities.
"""
import argparse
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ORIGIN = "https://retry.agentlife.app"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def request_json(url, payload=None, operator=None):
    headers = {"User-Agent": "RetryTraceDiagnostic/1.0", "Accept": "application/json"}
    if operator:
        headers["x-retry-trace-operator"] = operator
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode()
    # No automatic retries: repeating a create can allocate an extra run.
    request = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.build_opener(NoRedirect).open(request, timeout=20) as response:
        body = response.read(1_048_577)
        if len(body) > 1_048_576:
            raise ValueError("Service response too large")
        return json.loads(body)


def checked_url(url, origin, prefix):
    parsed = urllib.parse.urlsplit(url)
    if (f"{parsed.scheme}://{parsed.netloc}" != origin
            or not parsed.path.startswith(prefix) or parsed.query or parsed.fragment):
        raise ValueError("Service returned an unexpected capability URL")
    return url


def diagnose(origin, status, header_format, operator=None, retain=None):
    curl = shutil.which("curl")
    if not curl:
        raise ValueError("curl is required; no dependency is installed automatically")
    version = subprocess.run([curl, "-q", "--version"], capture_output=True,
                             text=True, check=True, timeout=5).stdout.splitlines()[0]
    config = {"status": status, "failures": 2, "delay_seconds": 2,
              "header_format": header_format}
    results = []
    participant = None
    for label, options in [("default", []), ("retry_enabled", ["--retry", "2"])]:
        payload = dict(config)
        if participant:
            payload["participant_token"] = participant
        run = request_json(origin + "/api/runs", payload, operator)
        participant = run["participant_token"]
        probe = checked_url(run["probe_url"], origin, "/probe/")
        trace_url = checked_url(run["trace_url"], origin, "/api/trace/")
        if retain:
            retain({"mode": label, "run_id": str(uuid.UUID(trace_url.rsplit('/', 1)[-1])),
                    "participant_token": participant, "publication_key": uuid.uuid4().hex})
        # -q must be first: exclude local curlrc settings from this comparison.
        # No --location: a probe must never redirect this diagnostic elsewhere.
        command = [curl, "-q", "--silent", "--show-error", "--output", os.devnull,
                   "--write-out", "%{http_code}", "--connect-timeout", "5",
                   "--max-time", "10", "--retry-max-time", "20", *options, probe]
        start = time.monotonic()
        try:
            completed = subprocess.run(command, capture_output=True, text=True, timeout=35)
            code, final = completed.returncode, completed.stdout.strip()
        except subprocess.TimeoutExpired:
            code, final = None, "timeout"
        elapsed = round(time.monotonic() - start, 3)
        trace = request_json(trace_url, operator=operator)
        # Allowlist output; neither tokens nor run IDs/URLs enter the report.
        results.append({"mode": label, "curl_exit_code": code,
                        "final_http_status": final, "wall_seconds": elapsed,
                        "attempts": trace["attempts"],
                        "reached_success": trace["reached_success"]})
    return {"format": "retry-trace-curl-comparison-v1", "client": version,
            "scenario": config, "observations": results,
            "published": False,
            "limitations": ["This compares curl with curlrc disabled, not your application's client.",
                            "Server arrival gaps include network and processing time.",
                            "A final 200 does not prove the whole retry policy is correct.",
                            "HTTP-date has whole-second precision; do not assert exact delay equality."]}


def save_session(file, session):
    file.seek(0)
    json.dump(session, file, indent=2)
    file.write("\n")
    file.truncate()
    file.flush()
    os.fsync(file.fileno())


def load_session(path):
    # Refuse symlinks and broadly readable files containing write capabilities.
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(fd) as file:
        info = os.fstat(file.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077:
            raise ValueError("Session must be a private regular file (mode 600)")
        if hasattr(os, "getuid") and info.st_uid != os.getuid():
            raise ValueError("Session must belong to the current user")
        body = file.read(65_537)
        if len(body) > 65_536:
            raise ValueError("Session too large")
        session = json.loads(body)
    if session.get("format") != "retry-trace-private-session-v1" or session.get("origin") != ORIGIN:
        raise ValueError("Unexpected session format or service origin")
    return session


def publish_session(session, mode, title, summary, public, parent=None, operator=None):
    if public is not True:
        raise ValueError("Publication requires an explicit --public decision")
    if session.get("origin") != ORIGIN:
        raise ValueError("Unexpected session origin")
    title, summary = title.strip(), summary.strip()
    if not 3 <= len(title) <= 100 or not 10 <= len(summary) <= 1200:
        raise ValueError("Title must have 3–100 characters; summary 10–1200")
    matches = [r for r in session["runs"] if r["mode"] == mode]
    if len(matches) != 1:
        raise ValueError("Selected diagnostic mode is unavailable")
    run = matches[0]
    if not re.fullmatch(r"[a-f0-9]{64}", run["participant_token"]):
        raise ValueError("Invalid participant capability")
    if not re.fullmatch(r"[a-zA-Z0-9_-]{8,80}", run["publication_key"]):
        raise ValueError("Invalid publication key")
    # Prevent accidental pasting of this session's capabilities into public text.
    for private in session["runs"]:
        if any(value in title + summary for value in
               [private["participant_token"], private["run_id"]]):
            raise ValueError("Public text contains a private session capability")
    payload = {"run_id": str(uuid.UUID(run["run_id"])),
               "participant_token": run["participant_token"],
               "idempotency_key": run["publication_key"],
               "public": True, "title": title, "summary": summary}
    if parent:
        payload["parent_id"] = str(uuid.UUID(parent))
    response = request_json(ORIGIN + "/api/findings", payload, operator)
    # Do not echo service response fields that could contain private capabilities.
    finding = str(uuid.UUID(response["finding_id"]))
    return {"published": True, "finding_id": finding,
            "public": response.get("public", True),
            "operator_test": response.get("operator_test", False),
            "replayed": response.get("replayed", False),
            "url": checked_url(response["url"], ORIGIN, "/findings/")
            if response.get("url") else None}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--status", type=int, choices=[429, 503], default=429)
    parser.add_argument("--header-format", choices=["seconds", "http-date"], default="seconds")
    files = parser.add_mutually_exclusive_group()
    files.add_argument("--save-session", metavar="PRIVATE_FILE", help="Retain run credentials in a new mode-600 file; never publish it")
    files.add_argument("--publish-session", metavar="PRIVATE_FILE", help="Publish one existing run; makes no new runs or probes")
    parser.add_argument("--mode", choices=["default", "retry_enabled"])
    parser.add_argument("--title")
    parser.add_argument("--summary")
    parser.add_argument("--parent-id", help="Optional finding ID whose result you reproduced")
    parser.add_argument("--public", action="store_true", help="Explicitly choose publication of synthetic evidence and your title/summary")
    args = parser.parse_args()
    publication_options = args.public or args.mode or args.title or args.summary or args.parent_id
    if args.publish_session:
        if not (args.public and args.mode and args.title and args.summary):
            parser.error("Publication requires --public, --mode, --title and --summary")
    elif publication_options:
        parser.error("Publication options require --publish-session")
    try:
        if args.publish_session:
            result = publish_session(load_session(args.publish_session), args.mode,
                                     args.title, args.summary, args.public, args.parent_id)
        elif args.save_session:
            # Exclusive creation prevents replacing an earlier session or following a symlink.
            fd = os.open(args.save_session, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w") as file:
                session = {"format": "retry-trace-private-session-v1", "origin": ORIGIN, "runs": []}
                save_session(file, session)
                def retain(run):
                    session["runs"].append(run)
                    save_session(file, session)
                result = diagnose(ORIGIN, args.status, args.header_format, retain=retain)
                result["private_session_saved"] = True
        else:
            result = diagnose(ORIGIN, args.status, args.header_format)
    except (OSError, ValueError, KeyError, TypeError, AttributeError, subprocess.SubprocessError) as error:
        # Avoid printing an exception URL containing a private capability.
        detail = f"HTTP {error.code}" if isinstance(error, urllib.error.HTTPError) else type(error).__name__
        message = ("Publication unconfirmed. Retry only the identical command; its saved key prevents duplicates."
                   if args.publish_session else "Diagnostic incomplete. No result was published; a saved session may contain partial runs.")
        print(f"{message} ({detail})", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
