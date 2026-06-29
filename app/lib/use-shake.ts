import { useEffect, useRef, useState } from "react";

const MIN_ACCEL = 3;
const MIN_PERIOD = 0.3;
const MAX_PERIOD = 5;
const BUFFER_SIZE = 6;
const IDLE_TIMEOUT_MS = 2000;

export type MotionPermissionResult = "granted" | "denied" | "unavailable";

export async function requestMotionPermission(): Promise<MotionPermissionResult> {
  if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) {
    return "unavailable";
  }

  const DME = window.DeviceMotionEvent as unknown as {
    requestPermission?: () => Promise<string>;
  };

  if (typeof DME.requestPermission === "function") {
    try {
      const result = await DME.requestPermission();
      return result === "granted" ? "granted" : "denied";
    } catch {
      return "denied";
    }
  }

  return "granted";
}

export function useShake(active: boolean) {
  const [period, setPeriod] = useState<number | null>(null);
  const [sensorActive, setSensorActive] = useState(false);
  const sensorActiveRef = useRef(false);
  const timesRef = useRef<number[]>([]);
  const wasUpRef = useRef(false);
  const peakRef = useRef(0);
  const gravityRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) {
      setPeriod(null);
      setSensorActive(false);
      sensorActiveRef.current = false;
      timesRef.current = [];
      wasUpRef.current = false;
      peakRef.current = 0;
      gravityRef.current = 0;
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      return;
    }

    if (typeof DeviceMotionEvent === "undefined") return;

    const resetIdle = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        setPeriod(null);
        timesRef.current = [];
        wasUpRef.current = false;
        peakRef.current = 0;
      }, IDLE_TIMEOUT_MS);
    };

    const handler = (e: DeviceMotionEvent) => {
      if (!sensorActiveRef.current) {
        sensorActiveRef.current = true;
        setSensorActive(true);
      }

      let y: number;
      if (e.acceleration && e.acceleration.y != null) {
        y = e.acceleration.y;
      } else if (e.accelerationIncludingGravity && e.accelerationIncludingGravity.y != null) {
        const raw = e.accelerationIncludingGravity.y;
        gravityRef.current = gravityRef.current * 0.9 + raw * 0.1;
        y = raw - gravityRef.current;
      } else {
        return;
      }

      const isUp = y > 0;

      if (isUp) {
        peakRef.current = Math.max(peakRef.current, y);
      }

      if (wasUpRef.current && !isUp && peakRef.current >= MIN_ACCEL) {
        const now = performance.now();
        const times = timesRef.current;
        times.push(now);
        if (times.length > BUFFER_SIZE) times.shift();

        peakRef.current = 0;
        resetIdle();

        if (times.length >= 3) {
          const intervals: number[] = [];
          for (let i = 1; i < times.length; i++) {
            intervals.push((times[i] - times[i - 1]) / 1000);
          }
          const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
          const clamped = Math.max(MIN_PERIOD, Math.min(MAX_PERIOD, avg));
          setPeriod(Math.round(clamped * 100) / 100);
        }
      }

      wasUpRef.current = isUp;
    };

    window.addEventListener("devicemotion", handler);
    return () => {
      window.removeEventListener("devicemotion", handler);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [active]);

  return { period, sensorActive };
}
