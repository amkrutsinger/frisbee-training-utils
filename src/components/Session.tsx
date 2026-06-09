import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SessionConfig } from "../types";
import { pickCommand, randomIntervalSeconds } from "../lib/random";
import { cancelSpeech, speak } from "../lib/speech";
import { releaseWakeLock, requestWakeLock } from "../lib/wakeLock";

type Props = {
  config: SessionConfig;
  initialCommand: string;
  onStop: () => void;
};

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Session({ config, initialCommand, onStop }: Props) {
  const [current, setCurrent] = useState(initialCommand);
  const [isPaused, setIsPaused] = useState(false);
  const [, force] = useState(0);
  const commandRef = useRef<HTMLDivElement>(null);

  const elapsedBeforePauseRef = useRef(0);
  const resumedAtRef = useRef<number | null>(Date.now());

  const timeoutRef = useRef<number | null>(null);
  const segmentStartRef = useRef<number>(Date.now());
  const segmentMsRef = useRef<number>(0);
  const remainingMsRef = useRef<number | null>(null);
  const prevCommandRef = useRef<string>(initialCommand);

  function scheduleNext(ms: number) {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }
    segmentStartRef.current = Date.now();
    segmentMsRef.current = ms;
    timeoutRef.current = window.setTimeout(() => {
      const next = pickCommand(
        config.commands,
        prevCommandRef.current,
        config.avoidRepeats
      );
      prevCommandRef.current = next;
      setCurrent(next);
      speak(next);
      const nextMs =
        randomIntervalSeconds(config.minSeconds, config.maxSeconds) * 1000;
      scheduleNext(nextMs);
    }, ms);
  }

  useEffect(() => {
    requestWakeLock();
    const firstMs =
      randomIntervalSeconds(config.minSeconds, config.maxSeconds) * 1000;
    scheduleNext(firstMs);
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      cancelSpeech();
      releaseWakeLock();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, []);

  // Shrink command font-size so the longest word always fits on one line.
  useLayoutEffect(() => {
    const el = commandRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    el.style.fontSize = "";
    const available = parent.clientWidth;
    let fontSize = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > available && fontSize > 16) {
      fontSize -= 2;
      el.style.fontSize = `${fontSize}px`;
    }
  }, [current]);

  function elapsedMs(): number {
    const live = resumedAtRef.current === null ? 0 : Date.now() - resumedAtRef.current;
    return elapsedBeforePauseRef.current + live;
  }

  function handlePause() {
    if (isPaused) return;
    if (resumedAtRef.current !== null) {
      elapsedBeforePauseRef.current += Date.now() - resumedAtRef.current;
      resumedAtRef.current = null;
    }
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      const used = Date.now() - segmentStartRef.current;
      remainingMsRef.current = Math.max(0, segmentMsRef.current - used);
    }
    cancelSpeech();
    setIsPaused(true);
  }

  function handleResume() {
    if (!isPaused) return;
    resumedAtRef.current = Date.now();
    speak(current);
    const remaining = remainingMsRef.current ?? 0;
    remainingMsRef.current = null;
    scheduleNext(remaining);
    setIsPaused(false);
  }

  function handleStop() {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    cancelSpeech();
    releaseWakeLock();
    onStop();
  }

  return (
    <div className="session">
      <div
        ref={commandRef}
        className={`command ${isPaused ? "paused" : ""}`}
        aria-live="polite"
      >
        {current}
      </div>
      <div className="controls">
        {isPaused ? (
          <button type="button" className="resume" onClick={handleResume}>
            Resume
          </button>
        ) : (
          <button type="button" className="pause" onClick={handlePause}>
            Pause
          </button>
        )}
        <button type="button" className="stop" onClick={handleStop}>
          Stop
        </button>
      </div>
      <div className="clock" aria-label="Elapsed time">
        <span className="clock-label">Elapsed</span>
        <span className="clock-value">{formatElapsed(elapsedMs())}</span>
      </div>
    </div>
  );
}
