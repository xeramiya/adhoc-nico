import { useParams } from "react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { css } from "~/styled-system/css";
import { useSession } from "~/lib/use-party";
import { CommentCanvas } from "~/components/comment-canvas";
import { QRCodeSVG } from "qrcode.react";

const IDLE_TIMEOUT = 2000;

export default function Screen() {
  const { sessionId } = useParams();
  const { comments, bgColor, synced, waveData, waveUsers, qrVisible } = useSession(
    sessionId!,
    "screen",
    "screen-display",
  );

  const isLocal = typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || /^(192|10|172)\.\d/.test(window.location.hostname));
  const audienceUrl =
    typeof window !== "undefined"
      ? isLocal
        ? `${window.location.protocol}//${__DEV_LAN_IP__}:${window.location.port}/${sessionId}`
        : `${window.location.origin}/${sessionId}`
      : "";

  const containerRef = useRef<HTMLDivElement>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [cursorHidden, setCursorHidden] = useState(false);

  // Hide cursor when idle
  useEffect(() => {
    const show = () => {
      setCursorHidden(false);
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => setCursorHidden(true), IDLE_TIMEOUT);
    };
    window.addEventListener("mousemove", show);
    idleTimerRef.current = setTimeout(() => setCursorHidden(true), IDLE_TIMEOUT);
    return () => {
      window.removeEventListener("mousemove", show);
      clearTimeout(idleTimerRef.current);
    };
  }, []);

  // Prevent scrollbars on body while mounted
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Double-click toggles fullscreen
  const handleDoubleClick = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current?.requestFullscreen();
    }
  }, []);

  return (
    <div
      ref={containerRef}
      onDoubleClick={handleDoubleClick}
      className={css({
        w: "100vw",
        h: "100vh",
        overflow: "hidden",
        transition: "background-color 0.5s ease",
      })}
      style={{
        backgroundColor: bgColor,
        cursor: cursorHidden ? "none" : "default",
      }}
    >
      <CommentCanvas comments={comments} synced={synced} waveData={waveData} waveUsers={waveUsers} />
      {qrVisible && audienceUrl && (
        <div
          className={css({
            position: "absolute",
            bottom: "32px",
            left: "32px",
            pointerEvents: "none",
            zIndex: 10,
            filter: "drop-shadow(0 0 8px rgba(255,255,255,0.3))",
          })}
        >
          <QRCodeSVG value={audienceUrl} size={120} bgColor="transparent" fgColor="#ffffff" level="M" />
        </div>
      )}
    </div>
  );
}
