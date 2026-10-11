function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {"content-type": "application/json; charset=utf-8", "cache-control": "no-store"}
  });
}
function validId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(value);
}
export async function onRequestGet({request, env}) {
  if (!env.CHAT_ACCESS_KEY || !env.AI_QUEUE) return json({error: "האתר עדיין לא הוגדר."}, 503);
  if (request.headers.get("x-chat-key") !== env.CHAT_ACCESS_KEY) return json({error: "מפתח הגישה שגוי."}, 401);
  const url = new URL(request.url);
  const messageId = url.searchParams.get("messageId");
  if (!validId(messageId)) return json({error: "חסר מזהה הודעה תקין."}, 400);
  const result = await env.AI_QUEUE.get("result:" + messageId, "json");
  if (!result) return json({status: "unknown"});
  return json(result);
}
