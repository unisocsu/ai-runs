#!/usr/bin/env python3
"""Call a local llama-server endpoint and persist a short conversation history."""

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
STATE_PATH = ROOT / "state" / "conversation.json"
RESULT_PATH = ROOT / "latest-result.md"
SYSTEM_PROMPT = (
    "You are a helpful, careful assistant. Answer in the language used by the user. "
    "For coding tasks, give practical, correct solutions and mention uncertainty rather than "
    "inventing facts. You are a local open-weight model, not Claude or another hosted service."
)
BASE_URL = os.environ.get("LLAMA_SERVER_URL", "http://127.0.0.1:8080")


def read_state(reset: bool) -> list[dict[str, str]]:
    if reset or not STATE_PATH.exists():
        return [{"role": "system", "content": SYSTEM_PROMPT}]
    try:
        data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        messages = data.get("messages", [])
        if not messages or messages[0].get("role") != "system":
            return [{"role": "system", "content": SYSTEM_PROMPT}]
        # Keep recent turns so old conversations don't consume the entire context.
        return [messages[0], *messages[1:][-10:]]
    except (OSError, json.JSONDecodeError, AttributeError, TypeError):
        return [{"role": "system", "content": SYSTEM_PROMPT}]


def wait_for_server() -> None:
    deadline = time.time() + 180
    last_error = None
    while time.time() < deadline:
        try:
            with urlopen(f"{BASE_URL}/health", timeout=5) as response:
                if response.status == 200:
                    return
        except (OSError, URLError) as exc:
            last_error = exc
        time.sleep(2)
    raise RuntimeError(f"llama-server did not become healthy within 180 seconds: {last_error}")


def chat(messages: list[dict[str, str]], max_tokens: int) -> str:
    payload = json.dumps({
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.6,
        "top_p": 0.95,
        "stream": False,
    }).encode("utf-8")
    request = Request(
        f"{BASE_URL}/v1/chat/completions",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=6 * 60 * 60) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")[:3000]
        raise RuntimeError(f"llama-server returned HTTP {exc.code}: {details}") from exc
    except URLError as exc:
        raise RuntimeError(f"Could not connect to llama-server: {exc}") from exc

    try:
        answer = result["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError(f"Unexpected response from llama-server: {result}") from exc
    if isinstance(answer, list):
        answer = "".join(
            item.get("text", "") if isinstance(item, dict) else str(item)
            for item in answer
        )
    answer = str(answer).strip()
    if not answer:
        raise RuntimeError("The model returned an empty response.")
    return answer


def main() -> int:
    prompt = os.environ.get("PROMPT", "").strip()
    if not prompt:
        print("PROMPT is empty; enter a prompt in the workflow form.", file=sys.stderr)
        return 2
    if len(prompt) > 20000:
        print("Prompt is too long (maximum 20,000 characters).", file=sys.stderr)
        return 2

    try:
        max_tokens = int(os.environ.get("MAX_TOKENS", "512"))
    except ValueError:
        max_tokens = 512
    max_tokens = min(max(max_tokens, 128), 1024)
    reset = os.environ.get("RESET_HISTORY", "false").lower() == "true"

    messages = read_state(reset)
    messages.append({"role": "user", "content": prompt})
    print(f"Waiting for local model endpoint at {BASE_URL} ...")
    wait_for_server()
    print(f"Generating answer (maximum {max_tokens} tokens)...")
    answer = chat(messages, max_tokens)
    messages.append({"role": "assistant", "content": answer})

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(
        json.dumps({"messages": messages, "updated_at": now}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    RESULT_PATH.write_text(
        "# Latest AI answer\n\n"
        f"- Generated at: {now}\n"
        "- Model: Qwen3-8B GGUF (Q4_K_M) via llama.cpp\n"
        f"- Maximum output tokens: {max_tokens}\n\n"
        "## Prompt\n\n"
        f"{prompt}\n\n"
        "## Answer\n\n"
        f"{answer}\n",
        encoding="utf-8",
    )
    print("Answer generated and saved to latest-result.md.")
    print("\n--- ANSWER PREVIEW ---\n")
    print(answer[:12000])
    if len(answer) > 12000:
        print("\n[Preview truncated; download the ai-answer artifact for the complete answer.]")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
