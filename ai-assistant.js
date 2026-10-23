(() => {
  if (window.__cmaddAiLoaded) return;
  window.__cmaddAiLoaded = true;

  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "/ai-assistant.css?v=2";
  document.head.appendChild(css);

  const root = document.createElement("div");
  root.id = "cmadd-ai-root";
  root.innerHTML = `
    <button class="cm-ai-fab" type="button" aria-label="Open MAYA AI Assistant" aria-expanded="false">
      <span class="cm-ai-fab-orb" aria-hidden="true">✦</span><span class="cm-ai-fab-label">MAYA AI</span>
    </button>
    <section class="cm-ai-panel" role="dialog" aria-modal="false" aria-label="MAYA AI Customer Assistant" hidden>
      <header class="cm-ai-head">
        <div class="cm-ai-avatar" aria-hidden="true">✦</div>
        <div class="cm-ai-heading"><strong>MAYA</strong><span><i></i> Powered by FIXBYTE · CMADD2 Support</span></div>
        <button class="cm-ai-icon-btn cm-ai-close" type="button" aria-label="Close assistant">×</button>
      </header>
      <div class="cm-ai-trust">AI-generated help · Please verify business-critical details</div>
      <div class="cm-ai-messages" aria-live="polite" aria-relevant="additions">
        <div class="cm-ai-msg cm-ai-bot">Namaste! 👋 Main MAYA hoon — Choudhary Medical and Drug Distributors ki AI assistant. Product enquiry, order tracking, complaint ya website help ke liye batayein, main kaise madad kar sakti hoon?</div>
      </div>
      <div class="cm-ai-quick">
        <button type="button" data-prompt="Mujhe product ki enquiry karni hai.">Product enquiry</button>
        <button type="button" data-prompt="Mujhe apna order track karna hai.">Track order</button>
        <button type="button" data-prompt="Mujhe complaint register karne mein help chahiye.">Complaint help</button>
      </div>
      <form class="cm-ai-form">
        <label class="cm-ai-sr" for="cm-ai-input">Your message</label>
        <textarea id="cm-ai-input" maxlength="4000" rows="1" placeholder="Apni problem yahan likhein..." required></textarea>
        <button class="cm-ai-send" type="submit" aria-label="Send message">➤</button>
      </form>
      <footer class="cm-ai-footer"><span>Don't share OTPs or payment PINs.</span><button type="button" class="cm-ai-wa">Talk to our team ↗</button></footer>
    </section>`;
  document.body.appendChild(root);

  const fab = root.querySelector(".cm-ai-fab");
  const panel = root.querySelector(".cm-ai-panel");
  const close = root.querySelector(".cm-ai-close");
  const form = root.querySelector(".cm-ai-form");
  const input = root.querySelector("#cm-ai-input");
  const messages = root.querySelector(".cm-ai-messages");
  const quick = root.querySelector(".cm-ai-quick");
  const history = [];
  let busy = false;

  function toggle(open) {
    panel.hidden = !open;
    fab.setAttribute("aria-expanded", String(open));
    fab.classList.toggle("cm-ai-fab-open", open);
    if (open) setTimeout(() => input.focus(), 60);
  }
  fab.addEventListener("click", () => toggle(panel.hidden));
  close.addEventListener("click", () => { toggle(false); fab.focus(); });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !panel.hidden) toggle(false);
  });

  function addMessage(text, who, extraClass) {
    const el = document.createElement("div");
    el.className = "cm-ai-msg " + (who === "user" ? "cm-ai-user" : "cm-ai-bot") + (extraClass ? " " + extraClass : "");
    el.textContent = text;
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
    return el;
  }

  function shareWhatsApp() {
    const lastUser = [...history].reverse().find(item => item.role === "user");
    const lastAssistant = [...history].reverse().find(item => item.role === "assistant");
    const enquiryId = "CMD-AI-" + new Date().toISOString().slice(2,10).replaceAll("-", "") + "-" + Math.random().toString(36).slice(2,6).toUpperCase();
    const text = [
      "🩺 *CMADD2 Customer Support Request*",
      "*Reference ID:* " + enquiryId,
      "*Business:* Choudhary Medical and Drug Distributors",
      "*Customer issue:* " + (lastUser ? lastUser.content : "Please help me"),
      "*AI summary:* " + (lastAssistant ? lastAssistant.content.slice(0, 500) : "Customer needs assistance"),
      "",
      "Please help verify and resolve this request."
    ].join("\n");
    window.open("https://wa.me/918000540156?text=" + encodeURIComponent(text), "_blank", "noopener,noreferrer");
  }
  root.querySelector(".cm-ai-wa").addEventListener("click", shareWhatsApp);

  async function sendMessage(value) {
    const text = String(value || "").trim();
    if (!text || busy) return;
    busy = true;
    quick.hidden = true;
    input.value = "";
    input.style.height = "auto";
    addMessage(text, "user");
    history.push({ role: "user", content: text });
    const typing = addMessage("Thinking…", "assistant", "cm-ai-typing");
    const sendButton = root.querySelector(".cm-ai-send");
    sendButton.disabled = true;
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: history.slice(0, -1).slice(-10) })
      });
      const data = await response.json().catch(() => ({}));
      typing.remove();
      if (!response.ok) throw new Error(data.error || "AI is temporarily unavailable.");
      const answer = String(data.answer || "Sorry, I couldn't answer that just now.").slice(0, 5000);
      addMessage(answer, "assistant");
      history.push({ role: "assistant", content: answer });
      if (history.length > 12) history.splice(0, history.length - 12);
    } catch (error) {
      typing.remove();
      addMessage((error && error.message) || "Connection issue. Please try again or contact our team.", "assistant");
      const fallback = document.createElement("button");
      fallback.type = "button";
      fallback.className = "cm-ai-fallback";
      fallback.textContent = "Continue on WhatsApp";
      fallback.addEventListener("click", shareWhatsApp);
      messages.appendChild(fallback);
      messages.scrollTop = messages.scrollHeight;
    } finally {
      busy = false;
      sendButton.disabled = false;
      input.focus();
    }
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    sendMessage(input.value);
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  });
  quick.querySelectorAll("button").forEach(button => button.addEventListener("click", () => sendMessage(button.dataset.prompt)));
})();
