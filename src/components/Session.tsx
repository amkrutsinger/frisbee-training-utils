import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Command, SessionConfig } from "../types";
import { durationMsFor, pickCommand, type LastFiredMap } from "../lib/random";
import { cancelSpeech, speak } from "../lib/speech";
import { releaseWakeLock, requestWakeLock } from "../lib/wakeLock";

type Props = {
  config: SessionConfig;
  initialCommand: Command;
  onStop: () => void;
};

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Session({ config, initialCommand, onStop }: Props) {
  const [current, setCurrent] = useState<Command>(initialCommand);
  const [isPaused, setIsPaused] = useState(false);
  const [, force] = useState(0);
  const commandRef = useRef<HTMLDivElement>(null);

  const elapsedBeforePauseRef = useRef(0);
  const resumedAtRef = useRef<number | null>(Date.now());

  const timeoutRef = useRef<number | null>(null);
  const segmentStartRef = useRef<number>(Date.now());
  const segmentMsRef = useRef<number>(0);
  const remainingMsRef = useRef<number | null>(null);
  const prevCommandRef = useRef<Command>(initialCommand);

  // Tracks when each command last fired, used by the maxGapMinutes constraint.
  // Seeded in the mount effect with the initial command + session start time.
  const sessionStartRef = useRef<number>(Date.now());
  const lastFiredRef = useRef<LastFiredMap>({});

  function scheduleNext(ms: number) {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }
    segmentStartRef.current = Date.now();
    segmentMsRef.current = ms;
    timeoutRef.current = window.setTimeout(() => {
      const now = Date.now();
      const next = pickCommand(
        config.commands,
        prevCommandRef.current,
        config.avoidRepeats,
        {
          lastFired: lastFiredRef.current,
          sessionStart: sessionStartRef.current,
          now,
        }
      );
      lastFiredRef.current = { ...lastFiredRef.current, [next.name]: now };
      prevCommandRef.current = next;
      setCurrent(next);
      speak(next.name);
      scheduleNext(durationMsFor(next));
    }, ms);
  }

  useEffect(() => {
    requestWakeLock();
    const start = Date.now();
    sessionStartRef.current = start;
    lastFiredRef.current = { [initialCommand.name]: start };
    scheduleNext(durationMsFor(initialCommand));
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
    speak(current.name);
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
        {current.name}
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
