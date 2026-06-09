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

// Stops that *we* inject (after a Sprint, or after a forced repeat) are tagged
// here so we can tell them apart from a "stop" the user typed into their list.
// Identity-based, so it keys off origin rather than the string "stop".
const forcedStops = new WeakSet<Command>();

function isForcedStop(c: Command | null): boolean {
  return c !== null && forcedStops.has(c);
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
  // When `upcomingRef` is a *forced* Stop, this holds the command committed to
  // fire after it — what the preview shows in the Stop's place, and what
  // actually fires when the Stop ends (kept in sync so the preview never lies).
  const afterStopRef = useRef<Command | null>(null);

  // Tracks when each command last fired, used by the maxGapMinutes constraint.
  // Seeded in the mount effect with the initial command + session start time.
  const sessionStartRef = useRef<number>(Date.now());
  const lastFiredRef = useRef<LastFiredMap>({});

  // A forced Stop: a brief transient command, reusing the user's own "stop"
  // duration if they listed one. Always a fresh object so it can be tagged in
  // `forcedStops` without affecting the user's command (if any).
  function forcedStop(): Command {
    const existing = config.commands.find(
      (c) => c.name.trim().toLowerCase() === "stop",
    );
    const cmd: Command = existing
      ? { ...existing }
      : { name: "stop", minSeconds: 0.9, maxSeconds: 0.9 };
    forcedStops.add(cmd);
    return cmd;
  }

  // Decides what comes after `prev`, as of the moment it will fire (`atMs`).
  // A "Stop" is forced when (1) prev is a "Sprint", or (2) repeats are allowed
  // and the picker lands on the same command again. A forced "Stop" never
  // follows a "Stop" — back-to-back stops only happen if the user lists "stop".
  function pickAfter(prev: Command, atMs: number): Command {
    const prevName = prev.name.trim().toLowerCase();
    if (prevName === "sprint") return forcedStop();
    const next = pickCommand(config.commands, prev, config.avoidRepeats, {
      lastFired: lastFiredRef.current,
      sessionStart: sessionStartRef.current,
      now: atMs,
    });
    if (!config.avoidRepeats && prevName !== "stop" && next.name === prev.name) {
      return forcedStop();
    }
    return next;
  }

  // Commits the command that fires after `next` (which starts at `now` and
  // lasts `ms`) and mirrors the preview. When that command is a forced Stop,
  // also commits the move after the Stop so the preview skips past the Stop and
  // shows a real command — and that exact command fires when the Stop ends.
  function commitAfter(next: Command, now: number, ms: number) {
    const following = pickAfter(next, now + ms);
    upcomingRef.current = following;
    if (isForcedStop(following)) {
      const afterStop = pickAfter(following, now + ms + durationMsFor(following));
      afterStopRef.current = afterStop;
      setUpcoming(afterStop);
    } else {
      afterStopRef.current = null;
      setUpcoming(following);
    }
  }

  // Promotes `next` to current, announces it, then pre-picks the following
  // command for the preview and schedules the segment. `committedFollowing`,
  // when given, is used verbatim instead of re-picking — this is the move
  // already shown in the preview while a forced Stop was on screen, so it must
  // fire exactly as previewed.
  function advanceTo(next: Command, committedFollowing?: Command) {
    const now = Date.now();
    lastFiredRef.current = { ...lastFiredRef.current, [next.name]: now };
    prevCommandRef.current = next;
    setCurrent(next);
    speak(next.name);

    const ms = durationMsFor(next);
    if (committedFollowing !== undefined) {
      upcomingRef.current = committedFollowing;
      afterStopRef.current = null;
      setUpcoming(committedFollowing);
    } else {
      // Pick the following command for the time this segment will end, so the
      // maxGap guarantee is evaluated against the moment it actually fires.
      commitAfter(next, now, ms);
    }
    scheduleNext(ms);
  }

  // Promotes the pre-picked command. Shared by the interval timer and Skip.
  // When the committed next is a forced Stop, hand the already-committed
  // post-Stop move through so it fires exactly as the preview promised.
  function fireNext() {
    const next =
      upcomingRef.current ?? pickAfter(prevCommandRef.current, Date.now());
    if (isForcedStop(next) && afterStopRef.current) {
      advanceTo(next, afterStopRef.current);
    } else {
      advanceTo(next);
    }
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
    // user is bailing on the whole sprint, so jump straight to the move the
    // preview was already showing (committed past the Stop).
    if (cur.name.trim().toLowerCase() === "sprint" && afterStopRef.current) {
      advanceTo(afterStopRef.current);
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
    commitAfter(initialCommand, start, ms);
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
      {!config.hideNextExercise && upcoming && (
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
