#!/usr/bin/env python3
"""Keep one GitHub Actions runner/model alive for multiple messages in a chat session."""
import json
import os
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import infer

BASE = os.environ.get("CHAT_QUEUE_URL", "https://ai-runs-chat.pages.dev/api/worker").rstrip("/")
KEY = os.environ.get("CHAT_QUEUE_KEY", "")
SESSION_ID = os.environ.get("SESSION_ID", "")
MESSAGE_ID = os.environ.get("MESSAGE_ID", "")

def call(method, payload=None, query=""):
    url = BASE + query
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(url, data=data, method=method, headers={
        "Content-Type": "application/json",
        "X-Worker-Key": KEY,
        "User-Agent": "ai-runs-session-worker/1.0",
    })
    with urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))

def process(message_id, prompt, max_tokens):
    os.environ["PROMPT"] = prompt
    os.environ["MAX_TOKENS"] = str(max_tokens)
    os.environ["RESET_HISTORY"] = "false"
    try:
        code = infer.main()
        answer_path = infer.ANSWER_PATH
        answer = answer_path.read_text(encoding="utf-8").strip() if answer_path.exists() else ""
        if code != 0 or not answer:
            raise RuntimeError("infer.py did not produce an answer (exit code %s)." % code)
        call("POST", {"action": "result", "sessionId": SESSION_ID,
                      "messageId": message_id, "answer": answer})
        print("Published response for message " + message_id)
    except Exception as exc:
        print("Message failed: %s" % exc, file=sys.stderr)
        try:
            call("POST", {"action": "failure", "sessionId": SESSION_ID,
                          "messageId": message_id, "error": str(exc)})
        except Exception as report_exc:
            print("Could not report failure: %s" % report_exc, file=sys.stderr)

def main():
    # Preserve manual workflow runs that do not originate from the website.
    if not (KEY and SESSION_ID and MESSAGE_ID):
        return infer.main()
    initial_prompt = os.environ.get("PROMPT", "").strip()
    if not initial_prompt:
        raise RuntimeError("Initial prompt is empty.")
    max_tokens = int(os.environ.get("MAX_TOKENS", "512"))
    process(MESSAGE_ID, initial_prompt, max_tokens)

    # The model server remains running while this loop waits for messages.
    # Stop before the workflow's 350-minute hard timeout to allow cleanup/commit.
    deadline = time.monotonic() + 5 * 60 * 60
    idle_seconds = 0
    while time.monotonic() < deadline:
        try:
            result = call("GET", query="?sessionId=" + SESSION_ID)
            if result.get("action") == "message":
                item = result.get("item") or {}
                message_id = item.get("messageId")
                prompt = item.get("prompt")
                if isinstance(message_id, str) and isinstance(prompt, str) and prompt.strip():
                    process(message_id, prompt, item.get("max_tokens", 512))
                    idle_seconds = 0
                    continue
            time.sleep(8)
            idle_seconds += 8
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            print("Queue poll failed; retrying: %s" % exc, file=sys.stderr)
            time.sleep(10)
    try:
        call("POST", {"action": "finish", "sessionId": SESSION_ID})
    except Exception as exc:
        print("Could not mark session finished: %s" % exc, file=sys.stderr)
    print("Session worker reached its planned time limit.")
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print("SESSION ERROR: %s" % exc, file=sys.stderr)
        raise SystemExit(1)
