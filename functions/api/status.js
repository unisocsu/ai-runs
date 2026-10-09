const GH = "https://api.github.com";
const REPO = "unisocsu/ai-runs";
const WORKFLOW_ID = "infer.yml";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {"content-type": "application/json; charset=utf-8", "cache-control": "no-store"}
  });
}

export async function onRequestGet({request, env}) {
  if (!env.GITHUB_TOKEN || !env.CHAT_ACCESS_KEY) return json({error: "האתר עדיין לא הוגדר."}, 503);
  if (request.headers.get("x-chat-key") !== env.CHAT_ACCESS_KEY) return json({error: "מפתח הגישה שגוי."}, 401);
  const url = new URL(request.url);
  const since = url.searchParams.get("since");
  if (!since || Number.isNaN(Date.parse(since))) return json({error: "חסר זמן התחלת הבקשה."}, 400);

  const headers = {
    "authorization": "Bearer " + env.GITHUB_TOKEN,
    "accept": "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "ai-runs-cloudflare-chat"
  };
  const runsResponse = await fetch(`${GH}/repos/${REPO}/actions/workflows/${WORKFLOW_ID}/runs?event=workflow_dispatch&per_page=10`, {headers});
  if (!runsResponse.ok) return json({error: `לא ניתן לקרוא את מצב GitHub Actions (HTTP ${runsResponse.status}).`}, 502);
  const payload = await runsResponse.json();
  const threshold = Date.parse(since) - 15000;
  const runs = (payload.workflow_runs || []).filter(run => Date.parse(run.created_at) >= threshold).sort((a,b) => Date.parse(b.created_at)-Date.parse(a.created_at));
  if (!runs.length) return json({status: "dispatching"});
  const run = runs[0];
  if (run.status !== "completed") return json({status: run.status || "queued", run_id: run.id});

  if (run.conclusion !== "success") return json({status: "completed", conclusion: run.conclusion, run_id: run.id});
  const resultResponse = await fetch(`${GH}/repos/${REPO}/contents/latest-result.md?ref=main`, {headers});
  if (!resultResponse.ok) return json({status: "completed", conclusion: "failure", error: "ההרצה הסתיימה אך קובץ התשובה לא נמצא."});
  const file = await resultResponse.json();
  let markdown = "";
  try { markdown = atob((file.content || "").replace(/\s/g, "")); }
  catch { return json({status: "completed", conclusion: "failure", error: "לא ניתן לפענח את קובץ התשובה."}); }
  const marker = "## Answer";
  const index = markdown.lastIndexOf(marker);
  const answer = index >= 0 ? markdown.slice(index + marker.length).trim() : markdown.trim();
  return json({status: "completed", conclusion: "success", run_id: run.id, answer});
}
