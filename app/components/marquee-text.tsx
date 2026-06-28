import { useRef, useState, useEffect, useCallback } from "react";
import { css } from "~/styled-system/css";

type Props = { text: string; className?: string };

export function MarqueeText({ text, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);

  const check = useCallback(() => {
    const container = containerRef.current;
    const span = textRef.current;
    if (!container || !span) return;
    setOverflows(span.scrollWidth > container.clientWidth);
  }, []);

  useEffect(() => {
    check();
  }, [text, check]);

  useEffect(() => {
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [check]);

  return (
    <div
      ref={containerRef}
      className={`${css({
        overflow: "hidden",
        whiteSpace: "nowrap",
        position: "relative",
      })} ${className ?? ""}`}
    >
      <span
        ref={textRef}
        className={css({
          display: "inline-block",
          ...(overflows
            ? {
                animation: "marquee 12s linear infinite",
                paddingLeft: "100%",
              }
            : {
                width: "100%",
                textAlign: "center",
              }),
        })}
      >
        {text}
      </span>
    </div>
  );
}
