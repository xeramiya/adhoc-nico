let ws = null;
let connected = false;
let sessionId = null;
let sessionName = "";
let intentionalClose = false;
let currentWaves = [];
let currentQrSvg = null;
let reconnectTimer = null;
const popupPorts = new Set();
const enabledTabs = new Set();

function updateGlobalBadge() {
  if (connected) {
    browser.browserAction.setBadgeText({ text: " " });
    browser.browserAction.setBadgeBackgroundColor({ color: "#22c55e" });
  } else {
    browser.browserAction.setBadgeText({ text: "" });
  }
}

function setBadgeForTab(tabId, enabled) {
  if (enabled) {
    browser.browserAction.setBadgeText({ text: "ON", tabId });
    browser.browserAction.setBadgeBackgroundColor({ color: "#22c55e", tabId });
  } else {
    browser.browserAction.setBadgeText({ text: null, tabId });
  }
}

function notifyPopups(msg) {
  for (const p of popupPorts) {
    try {
      p.postMessage(msg);
    } catch {}
  }
}

// 送信失敗はページ遷移中などの一時的なものがほとんどなので、タブを無効化しない。
// タブが閉じられた場合はtabs.onRemovedで確実に掃除される。
function sendToEnabledTabs(msg) {
  for (const tabId of enabledTabs) {
    browser.tabs.sendMessage(tabId, msg).catch(() => {});
  }
}

function overlayOnMsg() {
  return { type: "overlay:on", waves: currentWaves, qrSvg: currentQrSvg };
}

function statusMsg() {
  return {
    type: "status",
    connected,
    sessionId,
    sessionName,
    hasEnabledTabs: enabledTabs.size > 0,
  };
}

// 接続確立前(CONNECTING)や再接続待ちでもクリーンアップが必要なため、connectedでは判定しない
function hasActiveConnection() {
  return connected || ws !== null || reconnectTimer !== null;
}

browser.runtime.onConnect.addListener((port) => {
  if (port.name !== "popup") return;

  popupPorts.add(port);
  port.onDisconnect.addListener(() => popupPorts.delete(port));

  port.onMessage.addListener((msg) => {
    switch (msg.type) {
      case "getStatus":
        port.postMessage(statusMsg());
        break;
      case "toggleTab": {
        const tabId = msg.tabId;
        if (enabledTabs.has(tabId)) {
          enabledTabs.delete(tabId);
          browser.tabs
            .sendMessage(tabId, { type: "overlay:off" })
            .catch(() => {});
          setBadgeForTab(tabId, false);
          port.postMessage({ type: "tabState", enabled: false });

          if (enabledTabs.size === 0 && hasActiveConnection()) {
            intentionalClose = true;
            disconnect();
          }
        } else {
          enabledTabs.add(tabId);
          setBadgeForTab(tabId, true);

          if (!connected && msg.sessionId) {
            connect(msg.sessionId);
          } else if (connected) {
            browser.tabs
              .sendMessage(tabId, overlayOnMsg())
              .catch(() => {
                // 有効化直後の失敗はコンテンツスクリプトが動かないページ(about:等)なので戻す
                enabledTabs.delete(tabId);
                setBadgeForTab(tabId, false);
              });
          }

          port.postMessage({ type: "tabState", enabled: true });
        }
        notifyPopups(statusMsg());
        break;
      }
      case "getTabState":
        port.postMessage({
          type: "tabState",
          enabled: enabledTabs.has(msg.tabId),
        });
        break;
      case "reset":
        intentionalClose = true;
        disconnect();
        break;
    }
  });
});

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case "content:init": {
      const tabId = sender.tab?.id;
      const isEnabled = tabId != null && enabledTabs.has(tabId);
      sendResponse({
        connected,
        enabled: isEnabled,
        waves: isEnabled ? currentWaves : [],
        qrSvg: isEnabled ? currentQrSvg : null,
      });
      break;
    }
    case "session:sync":
      sessionName = msg.sessionName || "";
      browser.storage.local.set({
        sessionId: msg.sessionId,
        sessionName,
      });
      notifyPopups({
        type: "sessionSync",
        sessionId: msg.sessionId,
        sessionName,
      });
      break;
  }
  return true;
});

function connect(sid) {
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }

  sessionId = sid;
  intentionalClose = false;
  currentWaves = [];
  currentQrSvg = null;

  const protocol = isLocalAdhocHost() ? "ws" : "wss";
  const url =
    protocol +
    "://" +
    ADHOC_NICO_HOST +
    "/parties/session/" +
    sid +
    "?role=screen&userId=addon-overlay";

  ws = new WebSocket(url);
  let synced = false;

  ws.onopen = () => {
    connected = true;
    updateGlobalBadge();
    notifyPopups(statusMsg());
  };

  ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    // 終了済みセッションへ再接続し続けないよう、syncの前でも処理する
    if (msg.type === "session:ended") {
      intentionalClose = true;
      disconnect();
      return;
    }

    if (msg.type === "sync") {
      synced = true;
      currentWaves = msg.state.waveData || [];
      currentQrSvg = msg.state.qrVisible ? msg.state.qrSvg || null : null;
      sessionName = msg.state.sessionName || "";
      sendToEnabledTabs(overlayOnMsg());
      notifyPopups(statusMsg());
      return;
    }

    if (!synced) return;

    switch (msg.type) {
      case "comment:new":
        sendToEnabledTabs({
          type: "comment",
          text: msg.comment.text,
          id: msg.comment.id,
        });
        break;
      case "wave:data":
        currentWaves = msg.waves || [];
        sendToEnabledTabs({ type: "wave:data", waves: currentWaves });
        break;
      case "qr-visible":
        currentQrSvg = msg.visible ? msg.qrSvg || null : null;
        sendToEnabledTabs({ type: "qr", qrSvg: currentQrSvg });
        break;
    }
  };

  ws.onclose = () => {
    connected = false;
    ws = null;
    updateGlobalBadge();
    notifyPopups(statusMsg());

    if (!intentionalClose && sessionId) {
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => connect(sessionId), 3000);
    }
  };

  ws.onerror = () => {};
}

function disconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  sessionId = null;
  sessionName = "";
  currentWaves = [];
  currentQrSvg = null;

  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }

  connected = false;
  updateGlobalBadge();

  for (const tabId of enabledTabs) {
    browser.tabs.sendMessage(tabId, { type: "stop" }).catch(() => {});
    setBadgeForTab(tabId, false);
  }
  enabledTabs.clear();

  notifyPopups(statusMsg());
}

browser.tabs.onRemoved.addListener((tabId) => {
  if (!enabledTabs.delete(tabId)) return;

  if (enabledTabs.size === 0 && hasActiveConnection()) {
    intentionalClose = true;
    disconnect();
  } else {
    notifyPopups(statusMsg());
  }
});
