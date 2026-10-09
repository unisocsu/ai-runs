const form = document.querySelector("#chat-form");
const promptInput = document.querySelector("#prompt");
const messages = document.querySelector("#messages");
const welcome = document.querySelector("#welcome");
const progress = document.querySelector("#progress");
const progressTitle = document.querySelector("#progress-title");
const progressDetail = document.querySelector("#progress-detail");
const elapsedLabel = document.querySelector("#elapsed");
const errorBox = document.querySelector("#error");
const sendButton = document.querySelector("#send");
const settings = document.querySelector("#settings");
const keyInput = document.querySelector("#access-key");
let busy = false;
let elapsedTimer = null;
let pollTimer = null;
let currentChat = [];

keyInput.value = sessionStorage.getItem("ai-runs-access-key") || "";
document.querySelector("#settings-toggle").addEventListener("click", () => settings.classList.toggle("hidden"));
document.querySelector("#save-key").addEventListener("click", () => {
  sessionStorage.setItem("ai-runs-access-key", keyInput.value.trim());
  settings.classList.add("hidden");
  showError("");
});
document.querySelector("#new-chat").addEventListener("click", () => {
  if (busy) return;
  currentChat = [];
  messages.replaceChildren();
  messages.classList.add("hidden");
  welcome.classList.remove("hidden");
  showError("");
});
document.querySelectorAll(".suggestion").forEach(button => button.addEventListener("click", () => {
  promptInput.value = button.dataset.prompt || "";
  promptInput.focus();
  autoGrow();
}));
promptInput.addEventListener("input", autoGrow);
promptInput.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});
form.addEventListener("submit", async event => {
  event.preventDefault();
  const prompt = promptInput.value.trim();
  if (!prompt || busy) return;
  const accessKey = sessionStorage.getItem("ai-runs-access-key") || "";
  if (!accessKey) {
    settings.classList.remove("hidden");
    showError("צריך להזין מפתח גישה. אם אין לך מפתח, פנה למנהל האתר.");
    keyInput.focus();
    return;
  }
  showError("");
  busy = true;
  sendButton.disabled = true;
  promptInput.disabled = true;
  welcome.classList.add("hidden");
  messages.classList.remove("hidden");
  addMessage("user", prompt);
  promptInput.value = "";
  autoGrow();
  const startedAt = new Date().toISOString();
  progress.classList.remove("hidden");
  progressTitle.textContent = "הבקשה נשלחה";
  progressDetail.textContent = "מאתר את הרצת GitHub Actions…";
  const startMs = Date.now();
  elapsedTimer = setInterval(() => {
    const sec = Math.floor((Date.now() - startMs) / 1000);
    elapsedLabel.textContent = Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
  }, 1000);
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({prompt, max_tokens: Number(document.querySelector("#max-tokens").value), startedAt, accessKey})
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "לא ניתן להתחיל הרצה.");
    progressTitle.textContent = "ה-AI חושב";
    progressDetail.textContent = "המודל רץ ב-GitHub Actions. אפשר להמתין כאן.";
    await pollForAnswer(data.startedAt || startedAt, accessKey);
  } catch (error) {
    showError(error.message || "אירעה שגיאה בתקשורת.");
    finishBusy();
  }
});
async function pollForAnswer(startedAt, accessKey) {
  let failures = 0;
  while (busy) {
    await new Promise(resolve => setTimeout(resolve, 7000));
    if (!busy) break;
    try {
      const url = "/api/status?since=" + encodeURIComponent(startedAt);
      const response = await fetch(url, {headers: {"X-Chat-Key": accessKey}});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "שגיאה בבדיקת מצב ההרצה.");
      failures = 0;
      if (data.status === "queued" || data.status === "in_progress" || data.status === "dispatching") {
        progressTitle.textContent = data.status === "queued" ? "בתור להרצה" : "ה-AI חושב";
        progressDetail.textContent = data.status === "queued" ? "GitHub Actions יריץ את הבקשה כשהמשימה תתפנה." : "המודל מייצר תשובה. בהרצה הראשונה זה עלול לקחת זמן רב.";
        continue;
      }
      if (data.status === "completed" && data.conclusion === "success") {
        addMessage("assistant", data.answer || "ההרצה הסתיימה, אך לא נמצאה תשובה.");
        finishBusy();
        return;
      }
      if (data.status === "completed") throw new Error("הרצת ה-AI נכשלה. אפשר לבדוק את הלוגים בקישור GitHub Actions שבצד.");
    } catch (error) {
      failures++;
      if (failures >= 5) throw error;
      progressDetail.textContent = "החיבור מתעכב; מנסה שוב…";
    }
  }
}
function addMessage(role, text) {
  const item = document.createElement("article");
  item.className = "message " + (role === "user" ? "user" : "assistant");
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "user" ? "●" : "✳";
  const body = document.createElement("div");
  body.className = "message-body";
  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = role === "user" ? "אתה" : "AI Runs Agent · Qwen3-8B";
  const content = document.createElement("div");
  content.className = "message-text";
  content.textContent = text;
  body.append(label, content);
  item.append(avatar, body);
  messages.append(item);
  item.scrollIntoView({behavior: "smooth", block: "start"});
  currentChat.push({role, text});
}
function finishBusy() {
  busy = false;
  sendButton.disabled = false;
  promptInput.disabled = false;
  progress.classList.add("hidden");
  clearInterval(elapsedTimer);
  pollTimer && clearTimeout(pollTimer);
  promptInput.focus();
}
function showError(text) {
  errorBox.textContent = text;
  errorBox.classList.toggle("hidden", !text);
}
function autoGrow() {
  promptInput.style.height = "auto";
  promptInput.style.height = Math.min(promptInput.scrollHeight, 180) + "px";
}
