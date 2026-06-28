import { useEffect, useRef, useState, useCallback } from "react";

const SHAKE_THRESHOLD = 12;
const MIN_PERIOD = 0.3;
const MAX_PERIOD = 5;
const PEAK_BUFFER_SIZE = 6;

export function useShake(active: boolean) {
  const [period, setPeriod] = useState<number | null>(null);
  const [permissionNeeded, setPermissionNeeded] = useState(false);
  const peakTimesRef = useRef<number[]>([]);
  const lastAboveRef = useRef(false);

  const requestPermission = useCallback(async () => {
    const DME = DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (DME.requestPermission) {
      const result = await DME.requestPermission();
      if (result === "granted") {
        setPermissionNeeded(false);
        return true;
      }
      return false;
    }
    return true;
  }, []);

  useEffect(() => {
    if (!active) {
      setPeriod(null);
      peakTimesRef.current = [];
      return;
    }

    const DME = DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (DME.requestPermission) {
      setPermissionNeeded(true);
    }

    const handler = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc || acc.x == null || acc.y == null || acc.z == null) return;

      const mag = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
      const isAbove = mag > SHAKE_THRESHOLD;
      const wasAbove = lastAboveRef.current;
      lastAboveRef.current = isAbove;

      // ピーク検出: 閾値超え→下回りの立ち下がりエッジ
      if (wasAbove && !isAbove) {
        const now = performance.now();
        const peaks = peakTimesRef.current;
        peaks.push(now);
        if (peaks.length > PEAK_BUFFER_SIZE) {
          peaks.shift();
        }

        if (peaks.length >= 3) {
          const intervals: number[] = [];
          for (let i = 1; i < peaks.length; i++) {
            intervals.push((peaks[i] - peaks[i - 1]) / 1000);
          }
          const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
          const clamped = Math.max(MIN_PERIOD, Math.min(MAX_PERIOD, avg));
          setPeriod(Math.round(clamped * 100) / 100);
        }
      }
    };

    window.addEventListener("devicemotion", handler);
    return () => window.removeEventListener("devicemotion", handler);
  }, [active]);

  return { period, permissionNeeded, requestPermission };
}
