// ALL Facebook DOM knowledge lives here. When Facebook changes its markup,
// this is the only file that should need fixing. Injected before content.js.
(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };

  const clickable = () =>
    Array.from(document.querySelectorAll('[role="button"], a[role="link"], a, button')).filter(visible);

  const label = (el) =>
    (el.getAttribute("aria-label") || el.innerText || "").trim().toLowerCase();

  window.__lgSelectors = {
    visible,

    /** The "Message" button on a Page header (not the chat UI itself). */
    findMessageButton() {
      return (
        clickable().find((el) => {
          const l = label(el);
          if (l !== "message" && l !== "send message") return false;
          // Ignore buttons inside an already-open chat popup.
          return !el.closest('[aria-label*="Messenger" i], [data-pagelet*="Chat" i]');
        }) || null
      );
    },

    /** The chat composer that appears after clicking Message. */
    findComposer() {
      const boxes = Array.from(
        document.querySelectorAll('div[role="textbox"][contenteditable="true"]'),
      ).filter(visible);
      return (
        boxes.find((b) => /message/i.test(b.getAttribute("aria-label") || "")) ||
        boxes[boxes.length - 1] ||
        null
      );
    },

    findSendButton() {
      return (
        clickable().find((el) => {
          const l = label(el);
          return l === "press enter to send" || l === "send";
        }) || null
      );
    },

    findCloseChatButton() {
      return clickable().find((el) => label(el) === "close chat") || null;
    },

    isLoggedOut() {
      return Boolean(
        document.querySelector('form[action*="login"], input[name="pass"]') ||
          /\/login/.test(location.pathname),
      );
    },

    /** Checkpoints, temporary blocks and rate-limit notices. */
    isBlocked() {
      if (/\/checkpoint\//.test(location.pathname)) return true;
      const text = (document.body?.innerText || "").slice(0, 6000);
      return /temporarily blocked|you.?re temporarily|we limit how often|try again later|confirm your identity|security check/i.test(
        text,
      );
    },

    isUnavailable() {
      const text = (document.body?.innerText || "").slice(0, 3000);
      return /this content isn.?t available|page isn.?t available|this page isn.?t available/i.test(
        text,
      );
    },

    /** Count occurrences of the message text currently rendered on the page. */
    countText(snippet) {
      return (document.body?.innerText || "").split(snippet).length - 1;
    },
  };
})();
