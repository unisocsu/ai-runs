function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {"content-type": "application/json; charset=utf-8", "cache-control": "no-store"}
  });
}
function validId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(value);
}
function authorized(request, env) {
  return !!env.CHAT_QUEUE_KEY && request.headers.get("x-worker-key") === env.CHAT_QUEUE_KEY && !!env.AI_QUEUE;
}

export async function onRequestGet({request, env}) {
  if (!authorized(request, env)) return json({error: "Unauthorized"}, 401);
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!validId(sessionId)) return json({error: "Invalid session"}, 400);
  const key = "pending:" + sessionId;
  const raw = await env.AI_QUEUE.get(key);
  if (!raw) return json({action: "wait"});
  await env.AI_QUEUE.delete(key);
  let item;
  try { item = JSON.parse(raw); } catch { return json({error: "Invalid queue item"}, 500); }
  return json({action: "message", item});
}

export async function onRequestPost({request, env}) {
  if (!authorized(request, env)) return json({error: "Unauthorized"}, 401);
  let body;
  try { body = await request.json(); } catch { return json({error: "Invalid JSON"}, 400); }
  if (!validId(body.sessionId)) return json({error: "Invalid session"}, 400);
  if (body.action === "result" && validId(body.messageId) && typeof body.answer === "string") {
    await env.AI_QUEUE.put("result:" + body.messageId, JSON.stringify({
      status: "completed", conclusion: "success", answer: body.answer.slice(0, 50000)
    }), {expirationTtl: 21600});
    return json({ok: true});
  }
  if (body.action === "failure" && validId(body.messageId)) {
    await env.AI_QUEUE.put("result:" + body.messageId, JSON.stringify({
      status: "completed", conclusion: "failure", error: String(body.error || "המודל נכשל.").slice(0, 2000)
    }), {expirationTtl: 21600});
    return json({ok: true});
  }
  if (body.action === "finish") {
    await env.AI_QUEUE.put("session:" + body.sessionId, JSON.stringify({
      status: "finished", finishedAt: new Date().toISOString()
    }), {expirationTtl: 21600});
    return json({ok: true});
  }
  return json({error: "Unknown action"}, 400);
}
