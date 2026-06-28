import { useState, useEffect, useRef, useCallback } from "react";
import { css } from "~/styled-system/css";
import type { Comment } from "~/lib/protocol";

const ANIMATION_DURATION_MS = 8000;
const SAFETY_GAP_MS = 300;
const LANE_HEIGHT = 48;

type FlowingComment = {
  id: string;
  text: string;
  lane: number;
  key: string;
};

type Props = {
  comments: Comment[];
  synced: boolean;
};

export function CommentCanvas({ comments, synced }: Props) {
  const [flowingComments, setFlowingComments] = useState<FlowingComment[]>([]);
  const [laneCount, setLaneCount] = useState(() =>
    typeof window !== "undefined"
      ? Math.max(1, Math.floor(window.innerHeight / LANE_HEIGHT))
      : 20,
  );

  const seenIdsRef = useRef(new Set<string>());
  const laneAvailableAtRef = useRef<number[]>([]);
  const measureCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const didInitRef = useRef(false);

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

  // Recalculate lane count on resize
  useEffect(() => {
    const onResize = () =>
      setLaneCount(Math.max(1, Math.floor(window.innerHeight / LANE_HEIGHT)));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Keep lane availability array sized
  useEffect(() => {
    while (laneAvailableAtRef.current.length < laneCount) {
      laneAvailableAtRef.current.push(0);
    }
  }, [laneCount]);

  const allocateLane = useCallback(
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
        now +
        (textWidth / (vw + textWidth)) * ANIMATION_DURATION_MS +
        SAFETY_GAP_MS;
      return bestLane;
    },
    [laneCount],
  );

  // Process new / deleted comments
  useEffect(() => {
    if (!synced) return;

    // On first sync, mark all existing comments as already seen
    if (!didInitRef.current) {
      didInitRef.current = true;
      for (const c of comments) {
        seenIdsRef.current.add(c.id);
      }
      return;
    }

    // Remove flowing comments that were deleted server-side
    const currentIds = new Set(comments.map((c) => c.id));
    setFlowingComments((prev) => {
      const filtered = prev.filter((fc) => currentIds.has(fc.id));
      return filtered.length !== prev.length ? filtered : prev;
    });

    // Flow any unseen comments
    const ctx = getMeasureCtx();
    const newFlowing: FlowingComment[] = [];

    for (const c of comments) {
      if (seenIdsRef.current.has(c.id)) continue;
      seenIdsRef.current.add(c.id);
      const textWidth = ctx
        ? ctx.measureText(c.text).width
        : c.text.length * 36;
      const lane = allocateLane(textWidth);
      newFlowing.push({ id: c.id, text: c.text, lane, key: c.id });
    }

    if (newFlowing.length > 0) {
      setFlowingComments((prev) => [...prev, ...newFlowing]);
    }
  }, [comments, synced, allocateLane, getMeasureCtx]);

  const handleAnimationEnd = useCallback((key: string) => {
    setFlowingComments((prev) => prev.filter((fc) => fc.key !== key));
  }, []);

  return (
    <div
      className={css({
        position: "relative",
        w: "100vw",
        h: "100vh",
        overflow: "hidden",
      })}
    >
      {flowingComments.map((fc) => (
        <div
          key={fc.key}
          onAnimationEnd={() => handleAnimationEnd(fc.key)}
          className={commentStyle}
          style={{ top: `${fc.lane * LANE_HEIGHT}px` }}
        >
          {fc.text}
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
