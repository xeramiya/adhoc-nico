(() => {
  const LANE_HEIGHT = 48;
  const DEPTH_OFFSET = 16;
  const MAX_DEPTH_LAYERS = 3;
  const COMMENT_DURATION_MS = 5000;
  const SAFETY_GAP_MS = 300;
  const WAVE_DURATION_MULTIPLIER = 4;
  const FONT = '-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif';
  const WAVE_PATTERNS = [
    "下广卞廿十亠卉与本二上旦上二本与卉亠十廿卞广",
    "▁▂▃▅▆▇▇▆▅▃▂▁",
    "➫➙➬➭➫➙➬➮➪",
    "↗⁀↘‿↗⁀↘‿",
  ];

  let overlay = null;
  let measureCtx = null;
  let commentSlots = [];
  let synced = false;
  let enabled = false;
  let seenIds = new Set();
  let waveTimers = [];
  let waveCounter = 0;
  let qrElement = null;

  function ensureOverlay() {
    if (overlay && document.documentElement.contains(overlay)) return overlay;
    overlay = document.createElement("div");
    overlay.id = "adhoc-nico-overlay";
    document.documentElement.appendChild(overlay);
    return overlay;
  }

  function removeOverlay() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
  }

  function getMeasureCtx() {
    if (!measureCtx) {
      const canvas = document.createElement("canvas");
      measureCtx = canvas.getContext("2d");
    }
    return measureCtx;
  }

  function getLaneCount() {
    return Math.max(1, Math.floor(window.innerHeight / LANE_HEIGHT));
  }

  function ensureSlots() {
    const total = getLaneCount() * MAX_DEPTH_LAYERS;
    while (commentSlots.length < total) commentSlots.push(0);
  }

  function allocateLane(textWidth) {
    ensureSlots();
    const now = Date.now();
    const laneCount = getLaneCount();
    const totalSlots = laneCount * MAX_DEPTH_LAYERS;
    const vw = window.innerWidth;

    for (let i = 0; i < totalSlots; i++) {
      if ((commentSlots[i] || 0) <= now) {
        commentSlots[i] = now + (textWidth / (vw + textWidth)) * COMMENT_DURATION_MS + SAFETY_GAP_MS;
        return { lane: i % laneCount, depth: Math.floor(i / laneCount) };
      }
    }

    let best = 0;
    let bestTime = Infinity;
    for (let i = 0; i < totalSlots; i++) {
      if (commentSlots[i] < bestTime) {
        bestTime = commentSlots[i];
        best = i;
      }
    }
    commentSlots[best] = now + (textWidth / (vw + textWidth)) * COMMENT_DURATION_MS + SAFETY_GAP_MS;
    return { lane: best % laneCount, depth: Math.floor(best / laneCount) };
  }

  function spawnComment(text) {
    if (!enabled) return;
    const container = ensureOverlay();
    const ctx = getMeasureCtx();
    ctx.font = `bold 36px ${FONT}`;
    const textWidth = ctx.measureText(text).width;
    const { lane, depth } = allocateLane(textWidth);

    const el = document.createElement("div");
    el.className = "adhoc-nico-comment";
    el.textContent = text;
    el.style.top = `${lane * LANE_HEIGHT + depth * DEPTH_OFFSET}px`;
    el.style.opacity = Math.max(0.4, 1.0 - depth * 0.2);
    el.addEventListener("animationend", () => el.remove());
    container.appendChild(el);
  }

  function spawnWave(text, lane, depth, duration, color) {
    if (!enabled) return;
    const container = ensureOverlay();
    const el = document.createElement("div");
    el.className = "adhoc-nico-wave";
    el.textContent = text;
    el.style.bottom = `${lane * LANE_HEIGHT + depth * DEPTH_OFFSET}px`;
    el.style.opacity = Math.max(0.4, 1.0 - depth * 0.2);
    el.style.animationDuration = `${duration}s`;
    el.style.color = color;
    el.style.textShadow = `0 0 8px ${color}80`;
    el.addEventListener("animationend", () => el.remove());
    container.appendChild(el);
  }

  function showQr(svgString) {
    hideQr();
    if (!enabled) return;
    const container = ensureOverlay();
    qrElement = document.createElement("div");
    qrElement.className = "adhoc-nico-qr";
    qrElement.innerHTML = svgString;
    container.appendChild(qrElement);
  }

  function hideQr() {
    if (qrElement) {
      qrElement.remove();
      qrElement = null;
    }
  }

  function clearWaveTimers() {
    waveTimers.forEach((t) => clearInterval(t));
    waveTimers = [];
  }

  function updateWaves(waveUsers) {
    clearWaveTimers();
    if (!waveUsers || waveUsers.length === 0) return;

    const vw = window.innerWidth;
    const ctx = getMeasureCtx();
    ctx.font = `bold 32px ${FONT}`;
    const laneCount = getLaneCount();

    for (let i = 0; i < waveUsers.length; i++) {
      const user = waveUsers[i];
      const pattern = WAVE_PATTERNS[user.waveType] || WAVE_PATTERNS[0];
      const textWidth = ctx.measureText(pattern).width;
      const duration = user.period * WAVE_DURATION_MULTIPLIER;
      const interval = (textWidth / (vw + textWidth)) * duration * 1000;

      const lane = i % laneCount;
      const depth = Math.min(Math.floor(i / laneCount), MAX_DEPTH_LAYERS - 1);

      const doSpawn = () => spawnWave(pattern, lane, depth, duration, user.color);
      doSpawn();
      waveTimers.push(setInterval(doSpawn, Math.max(50, interval)));
    }
  }

  function clearAll() {
    clearWaveTimers();
    hideQr();
    removeOverlay();
    enabled = false;
    synced = false;
    seenIds.clear();
    commentSlots = [];
  }

  function handleServerMessage(msg) {
    if (!enabled) return;
    switch (msg.type) {
      case "sync":
        synced = true;
        if (msg.state && msg.state.comments) {
          for (const c of msg.state.comments) seenIds.add(c.id);
        }
        if (msg.state && msg.state.waveUsers) {
          updateWaves(msg.state.waveEnabled ? msg.state.waveUsers : []);
        }
        if (msg.state && msg.state.qrVisible && msg.state.qrSvg) {
          showQr(msg.state.qrSvg);
        } else {
          hideQr();
        }
        break;
      case "comment:new":
        if (!synced) break;
        if (seenIds.has(msg.comment.id)) break;
        seenIds.add(msg.comment.id);
        spawnComment(msg.comment.text);
        break;
      case "wave:data":
        if (msg.users) updateWaves(msg.users);
        break;
      case "wave:status":
        if (!msg.enabled) {
          clearWaveTimers();
        }
        break;
      case "qr-visible":
        if (msg.visible && msg.qrSvg) {
          showQr(msg.qrSvg);
        } else {
          hideQr();
        }
        break;
    }
  }

  browser.runtime.onMessage.addListener((message) => {
    switch (message.action) {
      case "server-message":
        handleServerMessage(message.msg);
        break;
      case "enable":
        enabled = true;
        ensureOverlay();
        break;
      case "clear":
        clearAll();
        break;
    }
  });
})();
