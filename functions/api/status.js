function corsHeaders(request) {\n  const origin = request && request.headers.get("Origin") || "";\n  const allowed = origin === "https://unisocsu.github.io";\n  return {\n    "access-control-allow-origin": allowed ? origin : "https://unisocsu.github.io",\n    "access-control-allow-methods": "GET, POST, OPTIONS",\n    "access-control-allow-headers": "Content-Type, X-Chat-Key",\n    "vary": "Origin"\n  };\n}\nfunction json(data, status = 200, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {...corsHeaders(request), "content-type": "application/json; charset=utf-8", "cache-control": "no-store"}
  });
}
function validId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(value);
}
export async function onRequestOptions({request}) { return new Response(null, {status: 204, headers: {...corsHeaders(request), "access-control-max-age": "86400"}}); }\n\nexport async function onRequestGet({request, env}) {
  if (!env.CHAT_ACCESS_KEY || !env.AI_QUEUE) return json({error: "האתר עדיין לא הוגדר."}, 503);
  if (request.headers.get("x-chat-key") !== env.CHAT_ACCESS_KEY) return json({error: "מפתח הגישה שגוי."}, 401);
  const url = new URL(request.url);
  const messageId = url.searchParams.get("messageId");
  if (!validId(messageId)) return json({error: "חסר מזהה הודעה תקין."}, 400);
  const result = await env.AI_QUEUE.get("result:" + messageId, "json");
  if (!result) return json({status: "unknown"});
  return json(result);
}
