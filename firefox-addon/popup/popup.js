const hostInput = document.getElementById("host");
const sessionIdInput = document.getElementById("session-id");
const connectBtn = document.getElementById("connect-btn");
const disconnectBtn = document.getElementById("disconnect-btn");
const dot = document.getElementById("dot");
const statusText = document.getElementById("status-text");
const tabSection = document.getElementById("tab-section");
const tabToggleBtn = document.getElementById("tab-toggle-btn");

let currentTabId = null;
let tabEnabled = false;

function updateUI(connected, config) {
  if (connected) {
    dot.classList.add("on");
    statusText.textContent = `接続中: ${config.sessionId}`;
    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
    tabSection.style.display = "";
  } else {
    dot.classList.remove("on");
    statusText.textContent = "未接続";
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
    tabSection.style.display = "none";
  }
  updateTabButton();
}

function updateTabButton() {
  if (tabEnabled) {
    tabToggleBtn.textContent = "このタブで無効にする";
    tabToggleBtn.classList.add("active");
  } else {
    tabToggleBtn.textContent = "このタブで有効にする";
    tabToggleBtn.classList.remove("active");
  }
}

browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
  if (tabs[0]) {
    currentTabId = tabs[0].id;
    browser.runtime.sendMessage({ action: "get-status", tabId: currentTabId }).then((res) => {
      if (res) {
        updateUI(res.connected, res.config);
        tabEnabled = res.enabledTabId;
        updateTabButton();
        if (res.config.host) hostInput.value = res.config.host;
        if (res.config.sessionId) sessionIdInput.value = res.config.sessionId;
      }
    });
  }
});

browser.storage.local.get(["sessionId", "host"]).then((data) => {
  if (data.host && !hostInput.value) hostInput.value = data.host;
  if (data.sessionId && !sessionIdInput.value) sessionIdInput.value = data.sessionId;
});

connectBtn.addEventListener("click", () => {
  const sessionId = sessionIdInput.value.trim();
  const host = hostInput.value.trim() || "adhocnico.uebit.net";
  if (!sessionId) {
    sessionIdInput.focus();
    return;
  }
  browser.runtime.sendMessage({ action: "connect", sessionId, host });
  updateUI(true, { sessionId, host });
});

disconnectBtn.addEventListener("click", () => {
  browser.runtime.sendMessage({ action: "disconnect" });
  tabEnabled = false;
  updateUI(false, {});
});

tabToggleBtn.addEventListener("click", () => {
  if (!currentTabId) return;
  if (tabEnabled) {
    browser.runtime.sendMessage({ action: "disable-tab", tabId: currentTabId });
    tabEnabled = false;
  } else {
    browser.runtime.sendMessage({ action: "enable-tab", tabId: currentTabId });
    tabEnabled = true;
  }
  updateTabButton();
});

browser.runtime.onMessage.addListener((message) => {
  if (message.action === "status") {
    updateUI(message.connected, message.config);
  }
});
