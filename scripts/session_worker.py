#!/usr/bin/env python3
"""Run one model instance and poll the repository-backed JSON queue."""
import os
import sys
import time
import infer
import session_store as store

SESSION_ID = os.environ.get("SESSION_ID", "")
MESSAGE_ID = os.environ.get("MESSAGE_ID", "")
POLL_SECONDS = 8

def publish(message_id, payload):
    payload.update({"messageId": message_id, "sessionId": SESSION_ID})
    store.write_json("runtime/results/" + message_id + ".json", payload)

def process(message_id, prompt, max_tokens, reset_history=False):
    os.environ["PROMPT"] = prompt
    os.environ["MAX_TOKENS"] = str(max_tokens)
    os.environ["RESET_HISTORY"] = "true" if reset_history else "false"
    try:
        code = infer.main()
        answer_path = infer.ANSWER_PATH
        answer = answer_path.read_text(encoding="utf-8").strip() if answer_path.exists() else ""
        if code != 0 or not answer:
            raise RuntimeError("infer.py did not produce an answer (exit code %s)." % code)
        publish(message_id, {"status":"completed","conclusion":"success","answer":answer,
          "updatedAt":time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
        print("Published response for message " + message_id)
    except Exception as exc:
        print("Message failed: %s" % exc, file=sys.stderr)
        try:
            publish(message_id, {"status":"completed","conclusion":"failure","error":str(exc),
              "updatedAt":time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
        except Exception as report_exc:
            print("Could not publish failure: %s" % report_exc, file=sys.stderr)

def main():
    if not (SESSION_ID and MESSAGE_ID and os.environ.get("GH_API_TOKEN")):
        return infer.main()
    initial_prompt = os.environ.get("PROMPT", "").strip()
    if not initial_prompt:
        raise RuntimeError("Initial prompt is empty.")
    max_tokens = int(os.environ.get("MAX_TOKENS", "512"))
    reset_history = os.environ.get("RESET_HISTORY", "false").lower() == "true"
    process(MESSAGE_ID, initial_prompt, max_tokens, reset_history)
    deadline = time.monotonic() + 5 * 60 * 60
    seen_ids = {MESSAGE_ID}
    queue_dir = "runtime/queue/" + SESSION_ID
    while time.monotonic() < deadline:
        try:
            waiting = []
            for path in store.list_json_paths(queue_dir):
                queued_id = path.rsplit("/", 1)[-1][:-5]
                if not queued_id or queued_id in seen_ids:
                    continue
                seen_ids.add(queued_id)
                item, _ = store.read_json(path)
                if not isinstance(item, dict):
                    continue
                prompt = item.get("prompt")
                if isinstance(prompt, str) and prompt.strip():
                    waiting.append((item.get("createdAt", ""), queued_id, item))
            waiting.sort(key=lambda entry: entry[0])
            if waiting:
                for _, queued_id, item in waiting:
                    process(queued_id, item["prompt"], int(item.get("max_tokens",512)), bool(item.get("reset_history",False)))
                continue
            time.sleep(POLL_SECONDS)
        except Exception as exc:
            print("Repository queue poll failed; retrying: %s" % exc, file=sys.stderr)
            time.sleep(10)
    store.update_session(SESSION_ID, "finished", {"finishedAt":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())})
    print("Session worker reached its planned time limit.")
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print("SESSION ERROR: %s" % exc, file=sys.stderr)
        raise SystemExit(1)
