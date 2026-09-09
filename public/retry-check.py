#!/usr/bin/env python3
"""Compare actual curl GET retries using two isolated Retry Trace runs.

Python 3.9+ standard library and curl. No install, account, or publication.
Read the source before running. Output omits private run capabilities.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ORIGIN = "https://retry.agentlife.app"


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
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def checked_url(url, origin, prefix):
    parsed = urllib.parse.urlsplit(url)
    if (f"{parsed.scheme}://{parsed.netloc}" != origin
            or not parsed.path.startswith(prefix) or parsed.query or parsed.fragment):
        raise ValueError("Service returned an unexpected capability URL")
    return url


def diagnose(origin, status, header_format, operator=None):
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--status", type=int, choices=[429, 503], default=429)
    parser.add_argument("--header-format", choices=["seconds", "http-date"], default="seconds")
    args = parser.parse_args()
    try:
        result = diagnose(ORIGIN, args.status, args.header_format)
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        # Avoid printing an exception URL containing a private capability.
        detail = f"HTTP {error.code}" if isinstance(error, urllib.error.HTTPError) else type(error).__name__
        print(f"Diagnostic incomplete ({detail}). No result was published. Existing runs expire after one hour.", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
