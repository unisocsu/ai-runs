#!/usr/bin/env python3
"""GitHub Contents API helper for the website JSON queue."""
import base64, json, os, time
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

REPO = os.environ.get("GITHUB_REPOSITORY", "unisocsu/ai-runs")
API = "https://api.github.com/repos/" + REPO
TOKEN = os.environ.get("GH_API_TOKEN") or os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN") or ""
BRANCH = os.environ.get("QUEUE_BRANCH", "main")

def api(method, path, body=None):
    if not TOKEN:
        raise RuntimeError("GH_API_TOKEN is not set.")
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = Request(API + path, data=data, method=method, headers={
        "Authorization": "Bearer " + TOKEN, "Accept": "application/vnd.github+json",
        "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "ai-runs-json-queue/1.0"})
    try:
        with urlopen(request, timeout=25) as response:
            raw = response.read().decode("utf-8")
            return response.status, json.loads(raw) if raw else {}
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try: detail = json.loads(raw)
        except ValueError: detail = {"message": raw[:500]}
        if exc.code == 404: return 404, detail
        if exc.code in (409, 422): return exc.code, detail
        raise RuntimeError("GitHub API " + str(exc.code) + ": " + str(detail.get("message", raw))[:500]) from exc
    except URLError as exc:
        raise RuntimeError("GitHub API connection failed: " + str(exc)) from exc

def read_json(path):
    url = "/contents/" + quote(path, safe="/") + "?ref=" + quote(BRANCH)
    status, response = api("GET", url)
    if status == 404: return None, None
    try:
        payload = base64.b64decode("".join(response.get("content", "").split())).decode("utf-8")
        return json.loads(payload), response.get("sha")
    except (ValueError, UnicodeDecodeError) as exc:
        raise RuntimeError("Invalid JSON file in repository: " + path) from exc

def write_json(path, value, attempts=5):
    url = "/contents/" + quote(path, safe="/")
    for attempt in range(attempts):
        _, sha = read_json(path)
        body = {"message": "AI Runs queue: update " + path,
                "content": base64.b64encode(json.dumps(value, ensure_ascii=False, indent=2).encode("utf-8")).decode("ascii"),
                "branch": BRANCH}
        if sha: body["sha"] = sha
        status, response = api("PUT", url, body)
        if status in (200, 201): return response
        if status in (409, 422): time.sleep(0.25 * (attempt + 1)); continue
    raise RuntimeError("Could not write " + path + " after repeated GitHub conflicts.")

def list_json_paths(directory):
    url = "/contents/" + quote(directory.strip("/"), safe="/") + "?ref=" + quote(BRANCH)
    status, response = api("GET", url)
    if status == 404: return []
    if not isinstance(response, list): raise RuntimeError("Expected directory listing: " + directory)
    return sorted(entry.get("path", "") for entry in response if entry.get("type") == "file" and entry.get("name", "").endswith(".json"))

def update_session(session_id, status, extra=None):
    if not session_id: return
    current, _ = read_json("runtime/session.json")
    if not current or current.get("sessionId") != session_id:
        print("Session registry no longer belongs to this workflow; not overwriting it.")
        return
    current["status"] = status
    current["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    if extra: current.update(extra)
    write_json("runtime/session.json", current)
