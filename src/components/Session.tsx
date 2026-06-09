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
  const [upcoming, setUpcoming] = useState<Command | null>(null);
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
  // The pre-picked next command, mirrored in `upcoming` state for the preview.
  // We commit to it: it is exactly what fires when this segment ends or is skipped.
  const upcomingRef = useRef<Command | null>(null);

  // Tracks when each command last fired, used by the maxGapMinutes constraint.
  // Seeded in the mount effect with the initial command + session start time.
  const sessionStartRef = useRef<number>(Date.now());
  const lastFiredRef = useRef<LastFiredMap>({});

  // A "Stop" always follows a "Sprint". Reuse a configured Stop command if the
  // user has one; otherwise synthesize a brief transient one (it never needs to
  // appear in the setup UI).
  function stopCommand(): Command {
    const existing = config.commands.find(
      (c) => c.name.trim().toLowerCase() === "stop",
    );
    return existing ?? { name: "stop", minSeconds: 0.8, maxSeconds: 0.8 };
  }

  // Decides what comes after `prev`, as of the moment it will fire (`atMs`).
  // Hard rule: whatever follows a "Sprint" (any casing) is always a "Stop".
  function pickAfter(prev: Command, atMs: number): Command {
    if (prev.name.trim().toLowerCase() === "sprint") return stopCommand();
    return pickCommand(config.commands, prev, config.avoidRepeats, {
      lastFired: lastFiredRef.current,
      sessionStart: sessionStartRef.current,
      now: atMs,
    });
  }

  // Promotes `next` to current, announces it, then pre-picks the following
  // command for the preview and schedules the segment.
  function advanceTo(next: Command) {
    const now = Date.now();
    lastFiredRef.current = { ...lastFiredRef.current, [next.name]: now };
    prevCommandRef.current = next;
    setCurrent(next);
    speak(next.name);

    // Pick the following command for the time this new segment will end, so the
    // maxGap guarantee is evaluated against the moment it actually fires.
    const ms = durationMsFor(next);
    const following = pickAfter(next, now + ms);
    upcomingRef.current = following;
    setUpcoming(following);
    scheduleNext(ms);
  }

  // Promotes the pre-picked command. Shared by the interval timer and Skip.
  function fireNext() {
    advanceTo(upcomingRef.current ?? pickAfter(prevCommandRef.current, Date.now()));
  }

  function scheduleNext(ms: number) {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }
    segmentStartRef.current = Date.now();
    segmentMsRef.current = ms;
    timeoutRef.current = window.setTimeout(fireNext, ms);
  }

  function handleSkip() {
    if (isPaused) return;
    cancelSpeech();
    const cur = prevCommandRef.current;
    // Skipping a "Sprint" also skips the "Stop" it would otherwise force — the
    // user is bailing on the whole sprint, so jump straight to a normal command.
    if (cur.name.trim().toLowerCase() === "sprint") {
      advanceTo(
        pickCommand(config.commands, cur, config.avoidRepeats, {
          lastFired: lastFiredRef.current,
          sessionStart: sessionStartRef.current,
          now: Date.now(),
        })
      );
    } else {
      fireNext();
    }
  }

  useEffect(() => {
    requestWakeLock();
    const start = Date.now();
    sessionStartRef.current = start;
    lastFiredRef.current = { [initialCommand.name]: start };
    const ms = durationMsFor(initialCommand);
    const following = pickAfter(initialCommand, start + ms);
    upcomingRef.current = following;
    setUpcoming(following);
    scheduleNext(ms);
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
    if (!el) return;
    // Shrink the font until the text fits inside the command card's content box.
    // Comparing scrollWidth to the element's own clientWidth (both include the
    // card padding) keeps the text clear of the padding and border.
    //
    // Measure left-aligned: with text-align:center, overflow spills both sides
    // and scrollWidth ignores the left half, so the text would never shrink.
    el.style.fontSize = "";
    el.style.textAlign = "left";
    let fontSize = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > el.clientWidth && fontSize > 16) {
      fontSize -= 1;
      el.style.fontSize = `${fontSize}px`;
    }
    el.style.textAlign = "";
  }, [current]);

  function elapsedMs(): number {
    const live =
      resumedAtRef.current === null ? 0 : Date.now() - resumedAtRef.current;
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
      {!config.hideNextExercise &&
        upcoming &&
        upcoming.name.trim().toLowerCase() !== "stop" && (
          <div className="next-up">
            <span className="next-up-label">Up next</span>
            <span className="next-up-value">{upcoming.name}</span>
          </div>
        )}
      <div className="controls">
        <button
          type="button"
          className="skip"
          onClick={handleSkip}
          disabled={isPaused}
        >
          Next
        </button>
        {isPaused ? (
          <button type="button" className="resume" onClick={handleResume}>
            Resume
          </button>
        ) : (
          <button type="button" className="pause" onClick={handlePause}>
            Pause
          </button>
        )}
      </div>
      <button type="button" className="stop end-session" onClick={handleStop}>
        End session
      </button>
      <div className="clock" aria-label="Elapsed time">
        <span className="clock-label">Elapsed</span>
        <span className="clock-value">{formatElapsed(elapsedMs())}</span>
      </div>
    </div>
  );
}
