#!/usr/bin/env python3
"""Test the installed curl against a disposable localhost Retry-After fixture.

Python 3.9+ standard library and curl are the only dependencies. The script
listens on 127.0.0.1, makes no external network requests, writes no files,
and prints a JSON report. Review the source before running downloaded code.
"""

import argparse
import datetime
import json
import os
import shutil
import subprocess
import sys
import threading
import time
from email.utils import format_datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def make_server(status, delay):
    attempts = {}
    lock = threading.Lock()

    class Fixture(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_GET(self):
            if self.path not in (
                "/seconds-default", "/seconds-retry",
                "/date-default", "/date-retry",
            ):
                self.send_error(404)
                return
            with lock:
                number = len(attempts.setdefault(self.path, []))
                code = status if number == 0 else 200
                attempts[self.path].append({"status": code, "arrived_at": time.monotonic()})
            self.send_response(code)
            if code == status:
                if self.path.startswith("/seconds"):
                    value = str(delay)
                else:
                    future = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=delay)
                    value = format_datetime(future, usegmt=True)
                self.send_header("Retry-After", value)
            self.send_header("Content-Length", "0")
            self.end_headers()

    server = ThreadingHTTPServer(("127.0.0.1", 0), Fixture)
    server.daemon_threads = True
    return server, attempts


def run_case(curl, server, attempts, label, retry):
    path = "/" + label
    command = [
        curl, "-q", "--silent", "--show-error", "--output", os.devnull,
        "--write-out", "%{http_code}", "--connect-timeout", "3",
        "--max-time", "5", "--retry-max-time", "12",
    ]
    if retry:
        command.extend(("--retry", "1"))
    command.append("http://127.0.0.1:{0}{1}".format(server.server_port, path))
    start = time.monotonic()
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=18)
        exit_code = result.returncode
        final_status = result.stdout.strip()
        error = result.stderr.strip()[:300] or None
    except subprocess.TimeoutExpired:
        exit_code, final_status, error = None, "timeout", "curl exceeded the test time limit"
    observations = list(attempts.get(path, []))
    gaps = [round(observations[i]["arrived_at"] - observations[i - 1]["arrived_at"], 3)
            for i in range(1, len(observations))]
    return {
        "case": label,
        "mode": "retry_enabled" if retry else "default",
        "header_format": "http-date" if label.startswith("date") else "seconds",
        "curl_exit_code": exit_code,
        "final_http_status": final_status,
        "wall_seconds": round(time.monotonic() - start, 3),
        "server_observed_statuses": [event["status"] for event in observations],
        "server_arrival_gaps_seconds": gaps,
        "error": error,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--status", type=int, choices=(429, 503), default=429)
    parser.add_argument("--delay-seconds", type=int, choices=(1, 2, 3, 4, 5), default=2)
    args = parser.parse_args()
    curl = shutil.which("curl")
    if not curl:
        parser.error("curl is required")
    try:
        version = subprocess.run([curl, "-q", "--version"], capture_output=True,
                                 text=True, check=True, timeout=5).stdout.splitlines()[0]
    except (subprocess.SubprocessError, IndexError) as exc:
        parser.error("could not read curl version: {0}".format(type(exc).__name__))
    server, attempts = make_server(args.status, args.delay_seconds)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        cases = [
            run_case(curl, server, attempts, "seconds-default", False),
            run_case(curl, server, attempts, "seconds-retry", True),
            run_case(curl, server, attempts, "date-default", False),
            run_case(curl, server, attempts, "date-retry", True),
        ]
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
    report = {
        "kind": "local-curl-retry-after-diagnostic",
        "curl_version": version,
        "fixture": "127.0.0.1 only; each case starts with a fresh response sequence",
        "status": args.status,
        "delay_seconds": args.delay_seconds,
        "cases": cases,
        "limitations": [
            "This tests the installed curl command, not an application's retry wrapper.",
            "HTTP-date has whole-second precision; arrival gaps need not equal the configured delay exactly.",
            "The local server records attempts, but this is self-run evidence rather than a remote independent trace.",
            "A final 200 does not establish that retrying an arbitrary real operation is safe.",
        ],
    }
    print(json.dumps(report, indent=2))
    return 0 if all(case["error"] is None for case in cases) else 1


if __name__ == "__main__":
    sys.exit(main())
