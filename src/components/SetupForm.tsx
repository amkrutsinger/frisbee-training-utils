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
  const [minRaw, setMinRaw] = useState("3");
  const [maxRaw, setMaxRaw] = useState("7");
  const [avoidRepeats, setAvoidRepeats] = useState(false);

  const minSeconds = Number(minRaw);
  const maxSeconds = Number(maxRaw);

  const commands = useMemo(() => parseCommands(raw), [raw]);

  const canAvoidRepeats = commands.length >= 2;
  const effectiveAvoidRepeats = avoidRepeats && canAvoidRepeats;

  const errors: string[] = [];
  if (commands.length === 0) errors.push("Add at least one command.");
  if (!Number.isFinite(minSeconds) || minSeconds <= 0)
    errors.push("Min seconds must be greater than 0.");
  if (!Number.isFinite(maxSeconds) || maxSeconds < minSeconds)
    errors.push("Max must be ≥ min.");

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

      <label>
        Commands (comma-separated)
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={2}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>

      {commands.length > 0 && (
        <div className="chips">{commands.length} command{commands.length === 1 ? "" : "s"}</div>
      )}

      <div className="row">
        <label>
          Min seconds
          <input
            type="number"
            inputMode="decimal"
            min={0.5}
            step={0.5}
            value={minRaw}
            onChange={(e) => setMinRaw(e.target.value)}
          />
        </label>
        <label>
          Max seconds
          <input
            type="number"
            inputMode="decimal"
            min={0.5}
            step={0.5}
            value={maxRaw}
            onChange={(e) => setMaxRaw(e.target.value)}
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
        Avoid immediate repeats
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
