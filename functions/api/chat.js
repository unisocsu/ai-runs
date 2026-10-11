const GH = "https://api.github.com";
const REPO = "unisocsu/ai-runs";
const WORKFLOW = "infer.yml";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {"content-type": "application/json; charset=utf-8", "cache-control": "no-store"}
  });
}

function validId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(value);
}

export async function onRequestPost({request, env}) {
  if (!env.GITHUB_TOKEN || !env.CHAT_ACCESS_KEY || !env.AI_QUEUE) {
    return json({error: "חסרה הגדרה ב-Cloudflare Pages: GITHUB_TOKEN, CHAT_ACCESS_KEY או AI_QUEUE (KV)."}, 503);
  }
  let body;
  try { body = await request.json(); } catch { return json({error: "בקשה לא תקינה."}, 400); }
  if (!body || body.accessKey !== env.CHAT_ACCESS_KEY) return json({error: "מפתח הגישה שגוי."}, 401);

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const sessionId = body.sessionId;
  const messageId = body.messageId;
  const maxTokens = [256, 512, 1024].includes(Number(body.max_tokens)) ? Number(body.max_tokens) : 512;
  if (!validId(sessionId) || !validId(messageId)) return json({error: "מזהה שיחה או הודעה לא תקין."}, 400);
  if (!prompt) return json({error: "יש לכתוב הודעה."}, 400);
  if (prompt.length > 20000) return json({error: "ההודעה ארוכה מדי (עד 20,000 תווים)."}, 413);

  const sessionKey = "session:" + sessionId;
  const session = await env.AI_QUEUE.get(sessionKey, "json");
  const messageKey = "result:" + messageId;
  if (await env.AI_QUEUE.get(messageKey)) return json({error: "מזהה הודעה כבר קיים."}, 409);

  const item = {messageId, prompt, max_tokens: maxTokens, createdAt: new Date().toISOString()};
  await env.AI_QUEUE.put(messageKey, JSON.stringify({status: "queued", sessionId}), {expirationTtl: 21600});

  if (session && session.status === "running") {
    const pendingKey = "pending:" + sessionId;
    if (await env.AI_QUEUE.get(pendingKey)) {
      await env.AI_QUEUE.delete(messageKey);
      return json({error: "כבר ממתינה הודעה לשיחה הזאת. המתן לתשובה ונסה שוב."}, 409);
    }
    await env.AI_QUEUE.put(pendingKey, JSON.stringify(item), {expirationTtl: 21600});
    return json({ok: true, sessionId, messageId, queued: true});
  }

  await env.AI_QUEUE.put(sessionKey, JSON.stringify({status: "running", startedAt: new Date().toISOString()}), {expirationTtl: 21600});
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
    body: JSON.stringify({ref: "main", inputs: {
      prompt, max_tokens: String(maxTokens), reset_history: false,
      session_id: sessionId, message_id: messageId
    }})
  });
  if (!dispatch.ok) {
    await env.AI_QUEUE.delete(sessionKey);
    await env.AI_QUEUE.delete(messageKey);
    const detail = (await dispatch.text()).slice(0, 400);
    return json({error: `GitHub לא הצליח להתחיל הרצה (HTTP ${dispatch.status}). ${detail}`}, 502);
  }
  return json({ok: true, sessionId, messageId, queued: false});
}
