import { useMemo, useState } from "react";
import type { SessionConfig } from "../types";

type Props = {
  onStart: (config: SessionConfig) => void;
};

function parseCommands(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function SetupForm({ onStart }: Props) {
  const [raw, setRaw] = useState("forehand, backhand, hammer, scoober");
  const [minSeconds, setMinSeconds] = useState(3);
  const [maxSeconds, setMaxSeconds] = useState(7);
  const [avoidRepeats, setAvoidRepeats] = useState(false);

  const commands = useMemo(() => parseCommands(raw), [raw]);

  const canAvoidRepeats = commands.length >= 2;
  const effectiveAvoidRepeats = avoidRepeats && canAvoidRepeats;

  const errors: string[] = [];
  if (commands.length === 0) errors.push("Add at least one command.");
  if (minSeconds <= 0) errors.push("Min seconds must be greater than 0.");
  if (maxSeconds < minSeconds) errors.push("Max must be ≥ min.");

  const canStart = errors.length === 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canStart) return;
    onStart({
      commands,
      minSeconds,
      maxSeconds,
      avoidRepeats: effectiveAvoidRepeats,
    });
  }

  return (
    <form className="setup" onSubmit={handleSubmit}>
      <h1>Training Wheel</h1>

      <label className="field">
        <span>Commands (comma-separated)</span>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={3}
          placeholder="forehand, backhand, hammer"
          autoCapitalize="none"
          autoCorrect="off"
        />
      </label>

      {commands.length > 0 && (
        <div className="chips" aria-label="Parsed commands">
          {commands.map((c, i) => (
            <span key={`${c}-${i}`} className="chip">
              {c}
            </span>
          ))}
        </div>
      )}

      <div className="row">
        <label className="field">
          <span>Min seconds</span>
          <input
            type="number"
            inputMode="decimal"
            min={0.5}
            step={0.5}
            value={minSeconds}
            onChange={(e) => setMinSeconds(Number(e.target.value))}
          />
        </label>
        <label className="field">
          <span>Max seconds</span>
          <input
            type="number"
            inputMode="decimal"
            min={0.5}
            step={0.5}
            value={maxSeconds}
            onChange={(e) => setMaxSeconds(Number(e.target.value))}
          />
        </label>
      </div>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={effectiveAvoidRepeats}
          disabled={!canAvoidRepeats}
          onChange={(e) => setAvoidRepeats(e.target.checked)}
        />
        <span>
          Avoid immediate repeats
          {!canAvoidRepeats && <em> (needs 2+ commands)</em>}
        </span>
      </label>

      {errors.length > 0 && (
        <ul className="errors">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      )}

      <button type="submit" className="primary" disabled={!canStart}>
        Go
      </button>
    </form>
  );
}
