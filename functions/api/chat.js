const GH = "https://api.github.com";
const REPO = "unisocsu/ai-runs";
const WORKFLOW = "infer.yml";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {"content-type": "application/json; charset=utf-8", "cache-control": "no-store"}
  });
}

export async function onRequestPost({request, env}) {
  if (!env.GITHUB_TOKEN || !env.CHAT_ACCESS_KEY) {
    return json({error: "האתר עדיין לא הוגדר. מנהל האתר צריך להגדיר GITHUB_TOKEN ו-CHAT_ACCESS_KEY ב-Cloudflare Pages."}, 503);
  }
  let body;
  try { body = await request.json(); } catch { return json({error: "בקשה לא תקינה."}, 400); }
  if (!body || typeof body.accessKey !== "string" || body.accessKey !== env.CHAT_ACCESS_KEY) {
    return json({error: "מפתח הגישה שגוי. פתח הגדרות והזן את המפתח שסופק לך."}, 401);
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const maxTokens = [256, 512, 1024].includes(Number(body.max_tokens)) ? String(Number(body.max_tokens)) : "512";
  if (!prompt) return json({error: "יש לכתוב הודעה."}, 400);
  if (prompt.length > 20000) return json({error: "ההודעה ארוכה מדי (עד 20,000 תווים)."}, 413);

  const headers = {
    "authorization": "Bearer " + env.GITHUB_TOKEN,
    "accept": "application/vnd.github+json",
    "content-type": "application/json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "ai-runs-cloudflare-chat"
  };
  const dispatch = await fetch(`${GH}/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers,
    body: JSON.stringify({ref: "main", inputs: {prompt, max_tokens: maxTokens, reset_history: false}})
  });
  if (!dispatch.ok) {
    const detail = (await dispatch.text()).slice(0, 500);
    return json({error: `GitHub לא הצליח להתחיל הרצה (HTTP ${dispatch.status}). בדוק הרשאות Actions של המפתח. ${detail}`}, 502);
  }
  return json({ok: true, startedAt: new Date().toISOString()});
}
