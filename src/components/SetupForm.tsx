import type { FormData } from "../App";
import type { Command, SessionConfig } from "../types";

type Props = {
  form: FormData;
  onChange: (next: FormData) => void;
  onReview: (config: SessionConfig) => void;
};

function parseCsv(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildConfig(form: FormData): {
  config: SessionConfig | null;
  errors: string[];
} {
  const errors: string[] = [];

  const commandNames = parseCsv(form.commandsRaw);
  const oneOffNames = parseCsv(form.oneOffsRaw);

  const min = Number(form.defaultMinRaw);
  const max = Number(form.defaultMaxRaw);
  const oneOff = Number(form.defaultOneOffRaw);

  if (commandNames.length === 0 && oneOffNames.length === 0) {
    errors.push("Add at least one command or one-off.");
  }
  if (commandNames.length > 0) {
    if (!Number.isFinite(min) || min <= 0)
      errors.push("Default min seconds must be > 0.");
    if (!Number.isFinite(max) || max < min)
      errors.push("Default max must be ≥ min.");
  }
  if (oneOffNames.length > 0) {
    if (!Number.isFinite(oneOff) || oneOff <= 0)
      errors.push("One-off duration must be > 0.");
  }

  if (errors.length > 0) return { config: null, errors };

  const commands: Command[] = [
    ...commandNames.map(
      (name): Command => ({ name, minSeconds: min, maxSeconds: max })
    ),
    ...oneOffNames.map(
      (name): Command => ({
        name,
        minSeconds: oneOff,
        maxSeconds: oneOff,
      })
    ),
  ];

  return {
    config: {
      commands,
      avoidRepeats: form.avoidRepeats && commands.length >= 2,
      hideNextExercise: form.hideNextExercise,
    },
    errors: [],
  };
}

export default function SetupForm({ form, onChange, onReview }: Props) {
  const { config, errors } = buildConfig(form);

  function patch(p: Partial<FormData>) {
    onChange({ ...form, ...p });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (config) onReview(config);
  }

  return (
    <form className="setup" onSubmit={handleSubmit}>
      <h1>Disc-patch</h1>
      <p className="tagline">
        Your hands-free drill caller. Build a list of moves and Disc-patch
        randomly calls them out — on screen and out loud — at random intervals,
        so you can train footwork and reactions solo without watching a clock.
      </p>

      <div className="section section-regular">
        <label>
          <span className="label-row">
            Commands <span className="hint">— comma-separated</span>
          </span>
          <textarea
            value={form.commandsRaw}
            onChange={(e) => patch({ commandsRaw: e.target.value })}
            rows={2}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>

        <div className="row">
          <label>
            Default min seconds
            <input
              type="number"
              inputMode="decimal"
              min={0.5}
              step="any"
              value={form.defaultMinRaw}
              onChange={(e) => patch({ defaultMinRaw: e.target.value })}
            />
          </label>
          <label>
            Default max seconds
            <input
              type="number"
              inputMode="decimal"
              min={0.5}
              step="any"
              value={form.defaultMaxRaw}
              onChange={(e) => patch({ defaultMaxRaw: e.target.value })}
            />
          </label>
        </div>
      </div>

      <div className="section section-oneoff">
        <label>
          <span className="label-row">
            One-offs <span className="hint">— comma-separated, fixed duration</span>
          </span>
          <textarea
            value={form.oneOffsRaw}
            onChange={(e) => patch({ oneOffsRaw: e.target.value })}
            rows={2}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>

        <label>
          <span className="label-row">
            One-off duration <span className="hint">— seconds, applied to every one-off</span>
          </span>
          <input
            type="number"
            inputMode="decimal"
            min={0.5}
            step="any"
            value={form.defaultOneOffRaw}
            onChange={(e) => patch({ defaultOneOffRaw: e.target.value })}
          />
        </label>
      </div>

      <div className="section section-options">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.avoidRepeats}
            onChange={(e) => patch({ avoidRepeats: e.target.checked })}
          />
          Avoid immediate repeats
          <span className="hint"> — one-offs are exempt</span>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.hideNextExercise}
            onChange={(e) => patch({ hideNextExercise: e.target.checked })}
          />
          Hide next exercise
        </label>
      </div>

      {errors.length > 0 && (
        <ul className="errors">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      )}

      <button type="submit" className="primary" disabled={config === null}>
        Review
      </button>
    </form>
  );
}
