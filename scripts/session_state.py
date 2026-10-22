#!/usr/bin/env python3
"""Publish website session lifecycle to runtime/session.json."""
import os
import sys
import time
import session_store as store

def utc_now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def main():
    action = sys.argv[1] if len(sys.argv) > 1 else ""
    session_id = os.environ.get("SESSION_ID", "")
    if not session_id:
        print("Manual run has no website session; registry update skipped.")
        return 0
    if action == "start":
        extra = {
            "run_id": os.environ.get("GITHUB_RUN_ID", ""),
            "run_number": os.environ.get("GITHUB_RUN_NUMBER", ""),
            "run_url": "https://github.com/" + os.environ.get("GITHUB_REPOSITORY", "unisocsu/ai-runs") + "/actions/runs/" + os.environ.get("GITHUB_RUN_ID", ""),
            "startedAt": utc_now(),
            "expiresAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 6 * 60 * 60))
        }
        store.update_session(session_id, "running", extra)
        print("Registered active website session " + session_id)
        return 0
    if action == "finish":
        store.update_session(session_id, "finished", {"finishedAt": utc_now()})
        print("Marked website session as finished.")
        return 0
    raise RuntimeError("Expected action: start or finish")

if __name__ == "__main__":
    raise SystemExit(main())
