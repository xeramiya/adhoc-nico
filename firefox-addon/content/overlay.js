(function () {
  const WAVE_DURATION_MULTIPLIER = 4;
  const COMMENT_FONT = "bold " + COMMENT_FONT_PX + "px " + NICO_FONT_FAMILY;

  let overlay = null;
  let laneCount = Math.max(1, Math.floor(window.innerHeight / LANE_HEIGHT_PX));
  let laneAvailableAt = [];
  let measureCtx = null;
  let waveTimers = [];
  let qrElement = null;

  function getOverlay() {
    if (overlay && document.documentElement.contains(overlay)) return overlay;
    overlay = document.createElement("div");
    overlay.id = "adhoc-nico-overlay";
    document.documentElement.appendChild(overlay);
    return overlay;
  }

  function removeOverlay() {
    clearWaveTimers();
    hideQr();
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
  }

  function getMeasureCtx() {
    if (!measureCtx) {
      measureCtx = document.createElement("canvas").getContext("2d");
    }
    return measureCtx;
  }

  function allocateLane(textWidth) {
    const now = Date.now();
    while (laneAvailableAt.length < laneCount) laneAvailableAt.push(0);

    let bestLane = 0;
    let bestTime = Infinity;

    for (let i = 0; i < laneCount; i++) {
      const available = laneAvailableAt[i] || 0;
      if (available <= now) {
        bestLane = i;
        break;
      }
      if (available < bestTime) {
        bestTime = available;
        bestLane = i;
      }
    }

    const vw = window.innerWidth;
    laneAvailableAt[bestLane] =
      now + (textWidth / (vw + textWidth)) * ANIMATION_DURATION_MS + SAFETY_GAP_MS;
    return bestLane;
  }

  function addComment(text) {
    const container = getOverlay();
    const { color, body } = parseColorCommand(text);
    const ctx = getMeasureCtx();
    ctx.font = COMMENT_FONT;
    const textWidth = ctx.measureText(body).width;
    const lane = allocateLane(textWidth);

    const el = document.createElement("div");
    el.className = "adhoc-nico-comment";
    el.textContent = body;
    el.style.top = lane * LANE_HEIGHT_PX + "px";
    el.style.fontSize = COMMENT_FONT_PX + "px";
    el.style.fontFamily = NICO_FONT_FAMILY;
    el.style.animationDuration = ANIMATION_DURATION_MS + "ms";
    if (color) el.style.color = color;
    el.addEventListener("animationend", () => el.remove());
    container.appendChild(el);
  }

  function clearWaveTimers() {
    waveTimers.forEach((t) => clearInterval(t));
    waveTimers = [];
  }

  function updateWaves(waves) {
    clearWaveTimers();

    if (overlay) {
      overlay.querySelectorAll(".adhoc-nico-wave").forEach((el) => el.remove());
    }

    if (!waves || waves.length === 0) return;

    const container = getOverlay();
    const ctx = getMeasureCtx();
    ctx.font = COMMENT_FONT;
    const vw = window.innerWidth;

    for (let i = 0; i < waves.length; i++) {
      const w = waves[i];
      const pattern = WAVE_PATTERNS[w.waveType] || WAVE_PATTERNS[0];
      const color = NEON_COLORS[w.waveType % NEON_COLORS.length];
      const textWidth = ctx.measureText(pattern).width;
      const duration = w.period * WAVE_DURATION_MULTIPLIER;
      // ウィンドウが低くてレーンが足りない場合は最上段に重ねる
      const lane = Math.max(0, laneCount - 1 - i);
      const interval = (textWidth / (vw + textWidth)) * duration * 1000;

      const spawn = () => {
        const el = document.createElement("div");
        el.className = "adhoc-nico-wave";
        el.textContent = pattern;
        el.style.top = lane * LANE_HEIGHT_PX + "px";
        el.style.fontSize = COMMENT_FONT_PX + "px";
        el.style.fontFamily = NICO_FONT_FAMILY;
        el.style.animationDuration = duration + "s";
        el.style.color = color;
        el.style.textShadow = "0 0 8px " + color;
        el.addEventListener("animationend", () => el.remove());
        container.appendChild(el);
      };

      spawn();
      waveTimers.push(setInterval(spawn, Math.max(50, interval)));
    }
  }

  // 管理者由来とはいえ任意ページにSVGを挿入するため、スクリプトや外部参照を除去する
  function sanitizeSvg(svgString) {
    const doc = new DOMParser().parseFromString(svgString, "image/svg+xml");
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== "svg") return null;
    svg.querySelectorAll("script, foreignObject, use, image, animate, set").forEach((el) => el.remove());
    const walker = doc.createTreeWalker(svg, NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;
    while (node) {
      for (const attr of [...node.attributes]) {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on") || name === "href" || name === "xlink:href") {
          node.removeAttribute(attr.name);
        }
      }
      node = walker.nextNode();
    }
    return svg.outerHTML;
  }

  function showQr(svgString) {
    hideQr();
    if (!svgString) return;
    const sanitized = sanitizeSvg(svgString);
    if (!sanitized) return;
    const container = getOverlay();
    qrElement = document.createElement("div");
    qrElement.className = "adhoc-nico-qr";
    qrElement.innerHTML = sanitized;
    container.appendChild(qrElement);
  }

  function hideQr() {
    if (qrElement) {
      qrElement.remove();
      qrElement = null;
    }
  }

  window.addEventListener("resize", () => {
    laneCount = Math.max(1, Math.floor(window.innerHeight / LANE_HEIGHT_PX));
  });

  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg.type) {
      case "ping":
        sendResponse({ ok: true });
        break;
      case "overlay:on":
        getOverlay();
        updateWaves(msg.waves || []);
        if (msg.qrSvg) showQr(msg.qrSvg);
        else hideQr();
        break;
      case "overlay:off":
      case "stop":
        removeOverlay();
        break;
      case "comment":
        addComment(msg.text);
        break;
      case "wave:data":
        updateWaves(msg.waves);
        break;
      case "qr":
        if (msg.qrSvg) showQr(msg.qrSvg);
        else hideQr();
        break;
    }
    return true;
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== "adhoc-nico:sync") return;
    if (!isAllowedSyncOrigin(event.origin)) return;

    browser.runtime
      .sendMessage({
        type: "session:sync",
        sessionId: String(event.data.sessionId || ""),
        sessionName: String(event.data.sessionName || ""),
      })
      .catch(() => {});
  });

  browser.runtime
    .sendMessage({ type: "content:init" })
    .then((state) => {
      if (state && state.connected && state.enabled) {
        getOverlay();
        updateWaves(state.waves || []);
        if (state.qrSvg) showQr(state.qrSvg);
      }
    })
    .catch(() => {});
})();
