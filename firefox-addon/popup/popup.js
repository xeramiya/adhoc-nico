const sidInput = document.getElementById("sid");
const tabBtn = document.getElementById("tabBtn");
const resetBtn = document.getElementById("resetBtn");
const dot = document.getElementById("dot");
const statusText = document.getElementById("statusText");

let isConnected = false;
let isCurrentTabOn = false;
let tabAvailable = false;
let currentTabId = null;

const port = browser.runtime.connect({ name: "popup" });

port.onMessage.addListener((msg) => {
  switch (msg.type) {
    case "status":
      updateStatus(msg);
      break;
    case "tabState":
      isCurrentTabOn = msg.enabled;
      updateTabBtn(msg.enabled);
      break;
    case "sessionSync":
      if (!isConnected && !isCurrentTabOn) {
        sidInput.value = msg.sessionId;
      }
      break;
  }
});

port.postMessage({ type: "getStatus" });

browser.storage.local.get(["sessionId"]).then((data) => {
  if (data.sessionId) sidInput.value = data.sessionId;
});

browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
  if (tabs[0]?.id == null) return;
  currentTabId = tabs[0].id;

  browser.tabs
    .sendMessage(currentTabId, { type: "ping" })
    .then(() => {
      tabAvailable = true;
      port.postMessage({ type: "getTabState", tabId: currentTabId });
    })
    .catch(() => {
      tabAvailable = false;
      tabBtn.disabled = true;
      tabBtn.textContent = "このページでは利用できません";
    });
});

tabBtn.addEventListener("click", () => {
  if (!tabAvailable || currentTabId == null) return;

  if (isCurrentTabOn) {
    port.postMessage({ type: "toggleTab", tabId: currentTabId });
  } else {
    const sessionId = sidInput.value.trim();
    if (!sessionId) return;
    browser.storage.local.set({ sessionId });
    port.postMessage({ type: "toggleTab", tabId: currentTabId, sessionId });
  }
});

resetBtn.addEventListener("click", () => {
  port.postMessage({ type: "reset" });
});

function updateStatus(s) {
  isConnected = s.connected;
  const locked = s.connected || s.hasEnabledTabs;
  sidInput.disabled = locked;

  if (s.connected) {
    dot.className = "dot on";
    statusText.textContent = s.sessionName || "接続中";
  } else {
    dot.className = "dot";
    statusText.textContent = "未接続";
  }

  if (!s.hasEnabledTabs) {
    isCurrentTabOn = false;
    if (tabAvailable) updateTabBtn(false);
  }
}

function updateTabBtn(enabled) {
  if (enabled) {
    tabBtn.className = "btn tab-toggle active";
    tabBtn.textContent = "このタブ: ON";
  } else {
    tabBtn.className = "btn tab-toggle";
    tabBtn.textContent = "このタブ: OFF";
  }
}
