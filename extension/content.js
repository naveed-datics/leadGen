// Runs the human-paced DM flow on a single Facebook Page. Injected by the
// service worker; replies to a { type: "RUN", body } message with a result.
(() => {
  if (window.__lgContentLoaded) return;
  window.__lgContentLoaded = true;

  const S = () => window.__lgSelectors;
  const rand = (min, max) => min + Math.random() * (max - min);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pause = (min, max) => sleep(rand(min, max));

  async function waitFor(fn, timeoutMs, stepMs = 400) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const value = fn();
      if (value) return value;
      await sleep(stepMs);
    }
    return null;
  }

  /** Random human-like scrolling for ~8-25s, occasionally back up. */
  async function browseLikeHuman() {
    const total = rand(8000, 25000);
    const end = Date.now() + total;
    while (Date.now() < end) {
      const goUp = Math.random() < 0.18;
      const distance = rand(120, 520) * (goUp ? -1 : 1);
      window.scrollBy({ top: distance, behavior: "smooth" });
      await pause(700, 2600);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    await pause(800, 1800);
  }

  function hoverThenClick(el) {
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    return (async () => {
      await pause(600, 1400);
      const r = el.getBoundingClientRect();
      const opts = {
        bubbles: true,
        clientX: r.left + r.width / 2 + rand(-4, 4),
        clientY: r.top + r.height / 2 + rand(-3, 3),
      };
      el.dispatchEvent(new MouseEvent("mouseover", opts));
      el.dispatchEvent(new MouseEvent("mousemove", opts));
      await pause(300, 900);
      el.click();
    })();
  }

  async function typeMessage(composer, text) {
    composer.focus();
    await pause(500, 1200);
    for (const ch of text) {
      if (ch === "\n") {
        document.execCommand("insertLineBreak");
      } else {
        document.execCommand("insertText", false, ch);
      }
      await sleep(rand(35, 140));
      if (Math.random() < 0.04) await pause(300, 900);
    }
  }

  async function run(body) {
    if (S().isBlocked()) return { outcome: "failed", reason: "action_blocked" };
    if (S().isLoggedOut()) return { outcome: "failed", reason: "not_logged_in" };

    await waitFor(() => document.readyState === "complete", 20000);
    await pause(1500, 3500);
    if (S().isUnavailable()) return { outcome: "skipped", reason: "page_unavailable" };

    await browseLikeHuman();
    if (S().isBlocked()) return { outcome: "failed", reason: "action_blocked" };

    const button = await waitFor(() => S().findMessageButton(), 8000);
    if (!button) return { outcome: "skipped", reason: "no_message_button" };
    await hoverThenClick(button);

    const composer = await waitFor(() => S().findComposer(), 15000);
    if (!composer) {
      if (S().isBlocked()) return { outcome: "failed", reason: "action_blocked" };
      return { outcome: "skipped", reason: "messaging_disabled" };
    }

    const snippet = body.split("\n")[0].slice(0, 30);
    const before = S().countText(snippet);
    await typeMessage(composer, body);
    await pause(700, 1600);

    const send = S().findSendButton();
    if (send) {
      await hoverThenClick(send);
    } else {
      composer.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }),
      );
    }

    const confirmed = await waitFor(() => S().countText(snippet) > before, 12000);
    if (S().isBlocked()) return { outcome: "failed", reason: "action_blocked" };
    if (!confirmed) return { outcome: "failed", reason: "send_unconfirmed" };

    await pause(1500, 3500);
    const close = S().findCloseChatButton();
    if (close) close.click();
    return { outcome: "sent" };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "RUN") return false;
    run(String(message.body || ""))
      .then(sendResponse)
      .catch(() => sendResponse({ outcome: "failed", reason: "error" }));
    return true;
  });
})();
