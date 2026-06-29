import { useState, useEffect, useRef, useCallback } from "react";
import { css } from "~/styled-system/css";
import type { Comment, WaveInfo, WaveUserData } from "~/lib/protocol";
import { WAVE_PATTERNS, NEON_COLORS } from "~/lib/protocol";

const ANIMATION_DURATION_MS = 8000;
const SAFETY_GAP_MS = 300;
const LANE_HEIGHT = 40;
const DEPTH_OFFSET = 12;
const MAX_DEPTH_LAYERS = 4;

const WAVE_CYCLES_PER_SET = 16;
const WAVE_SET_GAP_MS = 2000;

type FlowingComment = {
  id: string;
  text: string;
  lane: number;
  depth: number;
  key: string;
};

type WaveSetState = {
  key: string;
  text: string;
  textWidth: number;
  waveType: number;
  lane: number;
  depth: number;
  color: string;
  x: number;
  speed: number;
  frozen: boolean;
};

type WaveChannelState = {
  activeSetKey: string | null;
  tailHasEntered: boolean;
  spawnTimer: ReturnType<typeof setTimeout> | null;
  alive: boolean;
  idle: boolean;
  fadeOpacity: number;
};

type Props = {
  comments: Comment[];
  synced: boolean;
  waveData: WaveInfo[];
  waveUsers: WaveUserData[];
};

export function CommentCanvas({ comments, synced, waveData }: Props) {
  const [flowingComments, setFlowingComments] = useState<FlowingComment[]>([]);
  const [laneCount, setLaneCount] = useState(() =>
    typeof window !== "undefined"
      ? Math.max(1, Math.floor(window.innerHeight / LANE_HEIGHT))
      : 20,
  );

  const seenIdsRef = useRef(new Set<string>());
  const commentSlotsRef = useRef<number[]>([]);
  const measureCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const didInitRef = useRef(false);

  const waveContainerRef = useRef<HTMLDivElement>(null);
  const waveSetsRef = useRef<WaveSetState[]>([]);
  const waveElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const waveChannelsRef = useRef<Map<number, WaveChannelState>>(new Map());
  const waveCounterRef = useRef(0);
  const waveSlotsRef = useRef<number[]>([]);
  const waveAnimRef = useRef(0);
  const waveDataRef = useRef<WaveInfo[]>([]);
  const laneCountRef = useRef(laneCount);

  const getMeasureCtx = useCallback(() => {
    if (!measureCtxRef.current) {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (ctx) measureCtxRef.current = ctx;
    }
    return measureCtxRef.current;
  }, []);

  useEffect(() => {
    const onResize = () => {
      const newCount = Math.max(1, Math.floor(window.innerHeight / LANE_HEIGHT));
      setLaneCount(newCount);
      laneCountRef.current = newCount;
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    laneCountRef.current = laneCount;
  }, [laneCount]);

  useEffect(() => {
    const totalSlots = laneCount * MAX_DEPTH_LAYERS;
    while (commentSlotsRef.current.length < totalSlots) commentSlotsRef.current.push(0);
  }, [laneCount]);

  const allocateCommentLane = useCallback(
    (textWidth: number): { lane: number; depth: number } => {
      const now = Date.now();
      const slots = commentSlotsRef.current;
      const totalSlots = laneCount * MAX_DEPTH_LAYERS;

      for (let i = 0; i < totalSlots; i++) {
        if ((slots[i] || 0) <= now) {
          const vw = window.innerWidth;
          slots[i] =
            now + (textWidth / (vw + textWidth)) * ANIMATION_DURATION_MS + SAFETY_GAP_MS;
          return { lane: i % laneCount, depth: Math.floor(i / laneCount) };
        }
      }

      let best = 0;
      let bestTime = Infinity;
      for (let i = 0; i < totalSlots; i++) {
        if (slots[i] < bestTime) {
          bestTime = slots[i];
          best = i;
        }
      }

      const vw = window.innerWidth;
      slots[best] =
        now + (textWidth / (vw + textWidth)) * ANIMATION_DURATION_MS + SAFETY_GAP_MS;
      return { lane: best % laneCount, depth: Math.floor(best / laneCount) };
    },
    [laneCount],
  );

  useEffect(() => {
    if (!synced) return;

    if (!didInitRef.current) {
      didInitRef.current = true;
      for (const c of comments) seenIdsRef.current.add(c.id);
      return;
    }

    const currentIds = new Set(comments.map((c) => c.id));
    setFlowingComments((prev) => {
      const filtered = prev.filter((fc) => currentIds.has(fc.id));
      return filtered.length !== prev.length ? filtered : prev;
    });

    const ctx = getMeasureCtx();
    if (ctx) ctx.font = "bold 36px sans-serif";
    const newFlowing: FlowingComment[] = [];

    for (const c of comments) {
      if (seenIdsRef.current.has(c.id)) continue;
      seenIdsRef.current.add(c.id);
      const textWidth = ctx ? ctx.measureText(c.text).width : c.text.length * 36;
      const { lane, depth } = allocateCommentLane(textWidth);
      newFlowing.push({ id: c.id, text: c.text, lane, depth, key: c.id });
    }

    if (newFlowing.length > 0) {
      setFlowingComments((prev) => [...prev, ...newFlowing]);
    }
  }, [comments, synced, allocateCommentLane, getMeasureCtx]);

  // --- Wave system ---

  const allocateWaveLane = useCallback((): { lane: number; depth: number; slotIdx: number } => {
    const now = Date.now();
    const lc = laneCountRef.current;
    const totalSlots = lc * MAX_DEPTH_LAYERS;
    while (waveSlotsRef.current.length < totalSlots) waveSlotsRef.current.push(0);
    const slots = waveSlotsRef.current;

    for (let i = 0; i < totalSlots; i++) {
      if ((slots[i] || 0) <= now) {
        return { lane: i % lc, depth: Math.floor(i / lc), slotIdx: i };
      }
    }

    let best = 0;
    let bestTime = Infinity;
    for (let i = 0; i < totalSlots; i++) {
      if (slots[i] < bestTime) {
        bestTime = slots[i];
        best = i;
      }
    }
    return { lane: best % lc, depth: Math.floor(best / lc), slotIdx: best };
  }, []);

  const spawnWaveSet = useCallback((waveType: number, period: number) => {
    const container = waveContainerRef.current;
    if (!container) return;

    const pattern = WAVE_PATTERNS[waveType] || WAVE_PATTERNS[0];
    const text = pattern.repeat(WAVE_CYCLES_PER_SET);

    const ctx = getMeasureCtx();
    if (ctx) ctx.font = "bold 32px sans-serif";
    const textWidth = ctx ? ctx.measureText(text).width : text.length * 32;
    const cycleWidth = textWidth / WAVE_CYCLES_PER_SET;
    const speed = cycleWidth / period;

    const vw = window.innerWidth;
    const crossingMs = ((vw + textWidth) / speed) * 1000;

    const { lane, depth, slotIdx } = allocateWaveLane();
    waveSlotsRef.current[slotIdx] = Date.now() + crossingMs + SAFETY_GAP_MS;

    const color = NEON_COLORS[waveType % NEON_COLORS.length];
    const key = `wave-${waveCounterRef.current++}`;

    const entry: WaveSetState = {
      key, text, textWidth, waveType, lane, depth, color,
      x: vw, speed, frozen: false,
    };

    const channel = waveChannelsRef.current.get(waveType);
    const channelOpacity = channel ? channel.fadeOpacity : 1;

    const el = document.createElement("div");
    el.className = waveElClass;
    el.style.bottom = `${lane * LANE_HEIGHT + depth * DEPTH_OFFSET}px`;
    el.style.opacity = `${Math.max(0.4, 1.0 - depth * 0.2) * channelOpacity}`;
    el.style.color = color;
    el.style.textShadow = `0 0 8px ${color}80`;
    el.style.transform = `translateX(${vw}px)`;
    el.textContent = text;
    container.appendChild(el);
    waveElsRef.current.set(key, el);

    if (channel) {
      if (channel.activeSetKey) {
        const prev = waveSetsRef.current.find(s => s.key === channel.activeSetKey);
        if (prev) prev.frozen = true;
      }
      channel.activeSetKey = key;
      channel.tailHasEntered = false;
    }

    waveSetsRef.current.push(entry);
  }, [allocateWaveLane, getMeasureCtx]);

  const spawnWaveSetRef = useRef(spawnWaveSet);
  useEffect(() => { spawnWaveSetRef.current = spawnWaveSet; }, [spawnWaveSet]);

  // Animation loop — runs once, reads all state from refs
  useEffect(() => {
    let lastTime = performance.now();

    const animate = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;

      if (rawDt <= 0 || rawDt > 0.1) {
        waveAnimRef.current = requestAnimationFrame(animate);
        return;
      }

      const vw = window.innerWidth;

      for (const set of waveSetsRef.current) {
        set.x -= set.speed * rawDt;
        const el = waveElsRef.current.get(set.key);
        if (el) el.style.transform = `translateX(${set.x}px)`;
      }

      // フェード処理: idle時にゆっくり透明にする (~2.5秒で完全消失)
      const FADE_SPEED = 0.4;
      for (const [waveType, channel] of waveChannelsRef.current) {
        const targetOpacity = channel.idle ? 0 : 1;
        if (channel.fadeOpacity !== targetOpacity) {
          if (targetOpacity < channel.fadeOpacity) {
            channel.fadeOpacity = Math.max(0, channel.fadeOpacity - FADE_SPEED * rawDt);
          } else {
            channel.fadeOpacity = Math.min(1, channel.fadeOpacity + FADE_SPEED * rawDt);
          }
          for (const set of waveSetsRef.current) {
            if (set.waveType !== waveType) continue;
            const el = waveElsRef.current.get(set.key);
            if (el) {
              const base = Math.max(0.4, 1.0 - set.depth * 0.2);
              el.style.opacity = `${base * channel.fadeOpacity}`;
            }
          }
          // 完全に消えたらセットを除去しスポーンを停止
          if (channel.fadeOpacity <= 0) {
            waveSetsRef.current = waveSetsRef.current.filter(s => {
              if (s.waveType !== waveType) return true;
              const el = waveElsRef.current.get(s.key);
              if (el) { el.remove(); waveElsRef.current.delete(s.key); }
              return false;
            });
            channel.activeSetKey = null;
            if (channel.spawnTimer) { clearTimeout(channel.spawnTimer); channel.spawnTimer = null; }
          }
        }
      }

      for (const [waveType, channel] of waveChannelsRef.current) {
        if (!channel.activeSetKey || channel.tailHasEntered || !channel.alive) continue;
        if (channel.idle) continue;
        const set = waveSetsRef.current.find(s => s.key === channel.activeSetKey);
        if (!set) continue;

        if (set.x + set.textWidth <= vw) {
          channel.tailHasEntered = true;
          channel.spawnTimer = setTimeout(() => {
            channel.spawnTimer = null;
            if (!channel.alive || channel.idle) return;
            const info = waveDataRef.current.find(w => w.waveType === waveType);
            if (info) spawnWaveSetRef.current(waveType, info.period);
          }, WAVE_SET_GAP_MS);
        }
      }

      waveSetsRef.current = waveSetsRef.current.filter(set => {
        if (set.x < -(set.textWidth + 100)) {
          const el = waveElsRef.current.get(set.key);
          if (el) { el.remove(); waveElsRef.current.delete(set.key); }
          return false;
        }
        return true;
      });

      for (const [waveType, channel] of waveChannelsRef.current) {
        if (!channel.alive && !waveSetsRef.current.some(s => s.waveType === waveType)) {
          if (channel.spawnTimer) clearTimeout(channel.spawnTimer);
          waveChannelsRef.current.delete(waveType);
        }
      }

      waveAnimRef.current = requestAnimationFrame(animate);
    };

    waveAnimRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(waveAnimRef.current);
  }, []);

  // Respond to waveData changes: update speeds, manage channels
  useEffect(() => {
    waveDataRef.current = waveData;

    for (const set of waveSetsRef.current) {
      if (set.frozen) continue;
      const info = waveData.find(w => w.waveType === set.waveType);
      if (info) {
        const cycleWidth = set.textWidth / WAVE_CYCLES_PER_SET;
        set.speed = cycleWidth / info.period;
      }
    }

    for (const info of waveData) {
      const existing = waveChannelsRef.current.get(info.waveType);
      if (!existing) {
        waveChannelsRef.current.set(info.waveType, {
          activeSetKey: null,
          tailHasEntered: false,
          spawnTimer: null,
          alive: true,
          idle: info.idle,
          fadeOpacity: info.idle ? 0 : 1,
        });
        if (!info.idle) spawnWaveSet(info.waveType, info.period);
      } else {
        const wasIdle = existing.idle;
        existing.idle = info.idle;
        if (!existing.alive) {
          existing.alive = true;
        }
        // idle解除時: アクティブセットがなければ新規スポーン
        if (wasIdle && !info.idle) {
          if (!existing.activeSetKey || !waveSetsRef.current.some(s => s.key === existing.activeSetKey)) {
            spawnWaveSet(info.waveType, info.period);
          }
        }
      }
    }

    for (const [waveType, channel] of waveChannelsRef.current) {
      if (!waveData.some(w => w.waveType === waveType)) {
        channel.alive = false;
        if (channel.spawnTimer) {
          clearTimeout(channel.spawnTimer);
          channel.spawnTimer = null;
        }
      }
    }
  }, [waveData, spawnWaveSet]);

  useEffect(() => {
    return () => {
      for (const [, channel] of waveChannelsRef.current) {
        if (channel.spawnTimer) clearTimeout(channel.spawnTimer);
      }
      waveChannelsRef.current.clear();
      for (const [, el] of waveElsRef.current) el.remove();
      waveElsRef.current.clear();
      waveSetsRef.current = [];
    };
  }, []);

  const handleCommentEnd = useCallback((key: string) => {
    setFlowingComments((prev) => prev.filter((fc) => fc.key !== key));
  }, []);

  return (
    <div className={css({ position: "relative", w: "100vw", h: "100vh", overflow: "hidden" })}>
      {flowingComments.map((fc) => (
        <div
          key={fc.key}
          onAnimationEnd={() => handleCommentEnd(fc.key)}
          className={commentStyle}
          style={{
            top: `${fc.lane * LANE_HEIGHT + fc.depth * DEPTH_OFFSET}px`,
            opacity: Math.max(0.4, 1.0 - fc.depth * 0.2),
          }}
        >
          {fc.text}
        </div>
      ))}
      <div ref={waveContainerRef} className={css({ position: "absolute", inset: 0 })} />
    </div>
  );
}

const commentStyle = css({
  position: "absolute",
  left: 0,
  whiteSpace: "nowrap",
  color: "white",
  fontSize: "36px",
  fontWeight: "bold",
  textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
  willChange: "transform",
  pointerEvents: "none",
  animation: "commentFlow 8s linear forwards",
});

const waveElClass = css({
  position: "absolute",
  left: 0,
  whiteSpace: "nowrap",
  fontSize: "32px",
  fontWeight: "bold",
  willChange: "transform",
  pointerEvents: "none",
});
