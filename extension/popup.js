const $ = (id) => document.getElementById(id);

async function render() {
  const s = await chrome.storage.local.get({
    appUrl: "", token: "", running: false, status: "Idle", sentThisRun: 0, log: [],
  });
  $("appUrl").value = s.appUrl;
  $("token").value = s.token;
  $("status").textContent = `${s.running ? "Running" : "Stopped"} - ${s.status}`;
  $("counts").textContent = `Sent this run: ${s.sentThisRun}`;
  $("log").textContent = s.log.join("\n");
}

$("save").addEventListener("click", async () => {
  const appUrl = $("appUrl").value.trim().replace(/\/$/, "");
  const token = $("token").value.trim();
  try {
    const origin = new URL(appUrl).origin;
    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
    if (!granted) throw new Error("Permission to reach the app was denied");
    await chrome.storage.local.set({ appUrl, token });
    const config = await chrome.runtime.sendMessage({ type: "CHECK" });
    if (config?.error) throw new Error(config.error);
    await chrome.storage.local.set({
      status: `Connected as ${config.agentName}: ${config.sentToday}/${config.dailyCap} sent today`,
    });
  } catch (error) {
    await chrome.storage.local.set({ status: `Connection failed: ${error.message}` });
  }
  render();
});

$("start").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "START" });
  render();
});
$("stop").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "STOP" });
  render();
});

chrome.storage.onChanged.addListener(render);
render();
