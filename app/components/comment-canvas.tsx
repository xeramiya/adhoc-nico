import { useState, useEffect, useRef, useCallback } from "react";
import { css } from "~/styled-system/css";
import type { Comment, WaveInfo } from "~/lib/protocol";
import { WAVE_PATTERNS } from "~/lib/protocol";

const ANIMATION_DURATION_MS = 8000;
const SAFETY_GAP_MS = 300;
const LANE_HEIGHT = 48;

type FlowingComment = {
  id: string;
  text: string;
  lane: number;
  key: string;
};

type FlowingWave = {
  key: string;
  text: string;
  lane: number;
  duration: number;
};

type Props = {
  comments: Comment[];
  synced: boolean;
  waveData: WaveInfo[];
};

export function CommentCanvas({ comments, synced, waveData }: Props) {
  const [flowingComments, setFlowingComments] = useState<FlowingComment[]>([]);
  const [flowingWaves, setFlowingWaves] = useState<FlowingWave[]>([]);
  const [laneCount, setLaneCount] = useState(() =>
    typeof window !== "undefined"
      ? Math.max(1, Math.floor(window.innerHeight / LANE_HEIGHT))
      : 20,
  );

  const seenIdsRef = useRef(new Set<string>());
  const laneAvailableAtRef = useRef<number[]>([]);
  const waveLaneAvailableAtRef = useRef<number[]>([]);
  const measureCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const didInitRef = useRef(false);
  const waveCounterRef = useRef(0);
  const waveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getMeasureCtx = useCallback(() => {
    if (!measureCtxRef.current) {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.font = "bold 36px sans-serif";
        measureCtxRef.current = ctx;
      }
    }
    return measureCtxRef.current;
  }, []);

  useEffect(() => {
    const onResize = () =>
      setLaneCount(Math.max(1, Math.floor(window.innerHeight / LANE_HEIGHT)));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    while (laneAvailableAtRef.current.length < laneCount) {
      laneAvailableAtRef.current.push(0);
    }
    while (waveLaneAvailableAtRef.current.length < laneCount) {
      waveLaneAvailableAtRef.current.push(0);
    }
  }, [laneCount]);

  // コメントレーン割り当て (上から順)
  const allocateCommentLane = useCallback(
    (textWidth: number): number => {
      const now = Date.now();
      const lanes = laneAvailableAtRef.current;
      let bestLane = 0;
      let bestTime = Infinity;

      for (let i = 0; i < laneCount; i++) {
        const available = lanes[i] || 0;
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
      lanes[bestLane] =
        now + (textWidth / (vw + textWidth)) * ANIMATION_DURATION_MS + SAFETY_GAP_MS;
      return bestLane;
    },
    [laneCount],
  );

  // ウェーブレーン割り当て (下から順)
  const allocateWaveLane = useCallback(
    (duration: number): number => {
      const now = Date.now();
      const lanes = waveLaneAvailableAtRef.current;
      let bestLane = laneCount - 1;
      let bestTime = Infinity;

      for (let i = laneCount - 1; i >= 0; i--) {
        const available = lanes[i] || 0;
        if (available <= now) {
          bestLane = i;
          break;
        }
        if (available < bestTime) {
          bestTime = available;
          bestLane = i;
        }
      }

      lanes[bestLane] = now + duration * 1000 * 0.3;
      return bestLane;
    },
    [laneCount],
  );

  // コメント処理
  useEffect(() => {
    if (!synced) return;

    if (!didInitRef.current) {
      didInitRef.current = true;
      for (const c of comments) {
        seenIdsRef.current.add(c.id);
      }
      return;
    }

    const currentIds = new Set(comments.map((c) => c.id));
    setFlowingComments((prev) => {
      const filtered = prev.filter((fc) => currentIds.has(fc.id));
      return filtered.length !== prev.length ? filtered : prev;
    });

    const ctx = getMeasureCtx();
    const newFlowing: FlowingComment[] = [];

    for (const c of comments) {
      if (seenIdsRef.current.has(c.id)) continue;
      seenIdsRef.current.add(c.id);
      const textWidth = ctx ? ctx.measureText(c.text).width : c.text.length * 36;
      const lane = allocateCommentLane(textWidth);
      newFlowing.push({ id: c.id, text: c.text, lane, key: c.id });
    }

    if (newFlowing.length > 0) {
      setFlowingComments((prev) => [...prev, ...newFlowing]);
    }
  }, [comments, synced, allocateCommentLane, getMeasureCtx]);

  // ウェーブ生成: waveDataが変わるたびにインターバルを再設定
  useEffect(() => {
    if (waveIntervalRef.current) {
      clearInterval(waveIntervalRef.current);
      waveIntervalRef.current = null;
    }

    if (waveData.length === 0) return;

    const spawnWaves = () => {
      const newWaves: FlowingWave[] = [];
      for (const w of waveData) {
        const pattern = WAVE_PATTERNS[w.waveType] || WAVE_PATTERNS[0];
        const key = `wave-${waveCounterRef.current++}`;
        const lane = allocateWaveLane(w.period);
        newWaves.push({ key, text: pattern, lane, duration: w.period });
      }
      if (newWaves.length > 0) {
        setFlowingWaves((prev) => [...prev, ...newWaves]);
      }
    };

    spawnWaves();
    const minPeriod = Math.min(...waveData.map((w) => w.period));
    waveIntervalRef.current = setInterval(spawnWaves, minPeriod * 1000);

    return () => {
      if (waveIntervalRef.current) clearInterval(waveIntervalRef.current);
    };
  }, [waveData, allocateWaveLane]);

  const handleCommentEnd = useCallback((key: string) => {
    setFlowingComments((prev) => prev.filter((fc) => fc.key !== key));
  }, []);

  const handleWaveEnd = useCallback((key: string) => {
    setFlowingWaves((prev) => prev.filter((fw) => fw.key !== key));
  }, []);

  return (
    <div className={css({ position: "relative", w: "100vw", h: "100vh", overflow: "hidden" })}>
      {/* コメントレイヤー */}
      {flowingComments.map((fc) => (
        <div
          key={fc.key}
          onAnimationEnd={() => handleCommentEnd(fc.key)}
          className={commentStyle}
          style={{ top: `${fc.lane * LANE_HEIGHT}px` }}
        >
          {fc.text}
        </div>
      ))}
      {/* ウェーブレイヤー */}
      {flowingWaves.map((fw) => (
        <div
          key={fw.key}
          onAnimationEnd={() => handleWaveEnd(fw.key)}
          className={waveStyle}
          style={{
            top: `${fw.lane * LANE_HEIGHT}px`,
            animationDuration: `${fw.duration}s`,
          }}
        >
          {fw.text}
        </div>
      ))}
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

const waveStyle = css({
  position: "absolute",
  left: 0,
  whiteSpace: "nowrap",
  color: "rgba(0,255,255,0.7)",
  fontSize: "32px",
  fontWeight: "bold",
  textShadow: "0 0 8px rgba(0,255,255,0.5)",
  willChange: "transform",
  pointerEvents: "none",
  animation: "commentFlow linear forwards",
});
