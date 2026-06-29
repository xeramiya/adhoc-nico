let ws = null;
let connected = false;
let config = { sessionId: "", host: "adhocnico.uebit.net" };
const enabledTabs = new Set();
let cachedSync = null;

function getWsUrl(host, sessionId) {
  const isLocal = host.startsWith("localhost") || /^(192|10|172)\.\d/.test(host);
  const port = host.split(":")[1];
  const protocol = (!isLocal || port === "3443") ? "wss" : "ws";
  return `${protocol}://${host}/parties/session/${sessionId}?role=screen&userId=addon-overlay`;
}

function connect(sessionId, host) {
  disconnect();
  config = { sessionId, host };

  const url = getWsUrl(host, sessionId);
  ws = new WebSocket(url);

  ws.onopen = () => {
    connected = true;
    broadcastStatus();
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "sync") cachedSync = msg;
      for (const tabId of enabledTabs) {
        browser.tabs.sendMessage(tabId, { action: "server-message", msg }).catch(() => {
          enabledTabs.delete(tabId);
        });
      }
    } catch {}
  };

  ws.onclose = () => {
    connected = false;
    broadcastStatus();
    ws = null;
  };

  ws.onerror = () => {
    connected = false;
    broadcastStatus();
  };
}

function disconnect() {
  if (ws) {
    ws.close();
    ws = null;
  }
  connected = false;
  cachedSync = null;
  for (const tabId of enabledTabs) {
    browser.tabs.sendMessage(tabId, { action: "clear" }).catch(() => {});
  }
  enabledTabs.clear();
  broadcastStatus();
}

function broadcastStatus(targetTabId) {
  const msg = { action: "status", connected, config };
  browser.runtime.sendMessage(msg).catch(() => {});
}

function updateBadge(tabId) {
  const on = enabledTabs.has(tabId);
  browser.browserAction.setBadgeText({ text: on ? "ON" : "", tabId });
  browser.browserAction.setBadgeBackgroundColor({ color: "#f33968", tabId });
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case "connect":
      connect(message.sessionId, message.host);
      browser.storage.local.set({ sessionId: message.sessionId, host: message.host });
      sendResponse({ ok: true });
      break;
    case "disconnect":
      disconnect();
      sendResponse({ ok: true });
      break;
    case "get-status":
      sendResponse({ connected, config, enabledTabId: message.tabId ? enabledTabs.has(message.tabId) : false });
      break;
    case "enable-tab": {
      const tabId = message.tabId;
      enabledTabs.add(tabId);
      browser.tabs.sendMessage(tabId, { action: "enable" }).catch(() => {});
      if (cachedSync) {
        browser.tabs.sendMessage(tabId, { action: "server-message", msg: cachedSync }).catch(() => {});
      }
      updateBadge(tabId);
      sendResponse({ ok: true });
      break;
    }
    case "disable-tab": {
      const tabId = message.tabId;
      enabledTabs.delete(tabId);
      browser.tabs.sendMessage(tabId, { action: "clear" }).catch(() => {});
      updateBadge(tabId);
      sendResponse({ ok: true });
      break;
    }
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  enabledTabs.delete(tabId);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete" && enabledTabs.has(tabId)) {
    updateBadge(tabId);
    browser.tabs.sendMessage(tabId, { action: "enable" }).catch(() => {});
    if (cachedSync) {
      browser.tabs.sendMessage(tabId, { action: "server-message", msg: cachedSync }).catch(() => {});
    }
  }
});

browser.storage.local.get(["sessionId", "host"]).then((data) => {
  if (data.host) config.host = data.host;
  if (data.sessionId) config.sessionId = data.sessionId;
});
