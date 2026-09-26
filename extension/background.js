// Service worker: polls the LeadGen app for approved jobs and drives one
// Facebook Page at a time, with long random gaps between messages.
const TICK_ALARM = "lg-tick";
const rand = (min, max) => min + Math.random() * (max - min);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getStore() {
  return chrome.storage.local.get({
    appUrl: "",
    token: "",
    running: false,
    busy: false,
    nextAt: 0,
    status: "Idle",
    sentThisRun: 0,
    log: [],
  });
}

async function patch(values) {
  await chrome.storage.local.set(values);
}

async function log(message) {
  const { log: entries } = await getStore();
  const next = [`${new Date().toLocaleTimeString()}  ${message}`, ...entries].slice(0, 30);
  await patch({ log: next });
}

async function api(path, options = {}) {
  const { appUrl, token } = await getStore();
  const res = await fetch(`${appUrl.replace(/\/$/, "")}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function withinHours(hours) {
  const h = new Date().getHours();
  return h >= hours.startHour && h < hours.endHour;
}

function waitForTabComplete(tabId, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("page load timeout"));
    }, timeoutMs);
    function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

/** Opens the Page in an unfocused window (so timers aren't throttled) and runs the flow. */
async function processJob(job) {
  const win = await chrome.windows.create({
    url: job.targetUrl,
    focused: false,
    width: 1100,
    height: 800,
  });
  const tabId = win.tabs[0].id;
  try {
    await waitForTabComplete(tabId);
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["selectors.js", "content.js"],
    });
    return await chrome.tabs.sendMessage(tabId, { type: "RUN", body: job.body });
  } catch (error) {
    return { outcome: "failed", reason: "error", detail: String(error?.message || error) };
  } finally {
    await sleep(1500);
    chrome.windows.remove(win.id).catch(() => {});
  }
}

async function tick() {
  const state = await getStore();
  if (!state.running || state.busy || !state.appUrl || !state.token) return;
  if (Date.now() < state.nextAt) return;

  await patch({ busy: true });
  try {
    const config = await api("/api/extension/config");
    if (!withinHours(config.businessHours)) {
      await patch({ status: "Waiting for business hours", nextAt: Date.now() + 10 * 60_000 });
      return;
    }
    if (config.remainingToday <= 0) {
      await patch({ running: false, status: `Done for today (${config.sentToday}/${config.dailyCap} sent)` });
      await log("Daily cap reached.");
      return;
    }

    const { job, reason } = await api("/api/extension/jobs/next", { method: "POST" });
    if (!job) {
      const done = reason === "daily_cap_reached";
      await patch({
        running: done ? false : state.running,
        status: done ? "Done for today (daily cap reached)" : "No approved jobs in the queue",
        nextAt: Date.now() + 2 * 60_000,
      });
      return;
    }

    await patch({ status: `Messaging ${job.targetUrl}` });
    await log(`Opening ${job.targetUrl}`);
    const result = await processJob(job);
    await api(`/api/extension/jobs/${job.id}/result`, {
      method: "POST",
      body: JSON.stringify(
        result.outcome === "sent"
          ? { outcome: "sent" }
          : { outcome: result.outcome, reason: result.reason },
      ),
    });
    await log(`${result.outcome}${result.reason ? ` (${result.reason})` : ""}: ${job.targetUrl}`);

    if (result.outcome === "sent") {
      const fresh = await getStore();
      await patch({ sentThisRun: fresh.sentThisRun + 1 });
    }
    if (result.reason === "action_blocked" || result.reason === "not_logged_in") {
      await patch({
        running: false,
        status:
          result.reason === "not_logged_in"
            ? "Paused: log in to Facebook, then press Start"
            : "Paused: Facebook showed a block/checkpoint. Resolve it manually before resuming",
      });
      return;
    }
    const gap = config.betweenMessagesMs;
    await patch({ status: "Waiting before next message", nextAt: Date.now() + rand(gap.min, gap.max) });
  } catch (error) {
    await patch({ status: `Error: ${error?.message || error}`, nextAt: Date.now() + 60_000 });
    await log(`Error: ${error?.message || error}`);
  } finally {
    await patch({ busy: false });
  }
}

chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK_ALARM) tick();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === "START") {
      await patch({ running: true, nextAt: 0, sentThisRun: 0, status: "Starting" });
      tick();
    } else if (message.type === "STOP") {
      await patch({ running: false, status: "Paused" });
    } else if (message.type === "CHECK") {
      sendResponse(await api("/api/extension/config"));
      return;
    }
    sendResponse({ ok: true });
  })().catch((error) => sendResponse({ error: String(error?.message || error) }));
  return true;
});

// A service worker restart mid-job must not leave "busy" stuck.
chrome.runtime.onStartup.addListener(() => patch({ busy: false }));
chrome.runtime.onInstalled.addListener(() => patch({ busy: false }));
