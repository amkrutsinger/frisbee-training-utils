import { useState } from "react";
import type { Command, SessionConfig } from "../types";

type Props = {
  config: SessionConfig;
  onBack: () => void;
  onStart: (config: SessionConfig) => void;
};

type EditableRow = {
  name: string;
  isOneOff: boolean;
  minRaw: string;
  maxRaw: string;
  maxGapRaw: string; // empty = no constraint
};

function rowsFromCommands(commands: Command[]): EditableRow[] {
  return commands.map((c) => ({
    name: c.name,
    isOneOff: c.minSeconds === c.maxSeconds,
    minRaw: String(c.minSeconds),
    maxRaw: String(c.maxSeconds),
    maxGapRaw: c.maxGapSeconds === undefined ? "" : String(c.maxGapSeconds),
  }));
}

function parseRow(
  row: EditableRow
): { command: Command | null; error: string | null } {
  const min = Number(row.minRaw);
  const max = Number(row.maxRaw);
  if (!Number.isFinite(min) || min <= 0)
    return { command: null, error: "Seconds must be > 0" };
  if (!row.isOneOff && (!Number.isFinite(max) || max < min))
    return { command: null, error: "Max must be ≥ min" };

  let maxGapSeconds: number | undefined;
  const gapText = row.maxGapRaw.trim();
  if (gapText !== "") {
    const gap = Number(gapText);
    if (!Number.isFinite(gap) || gap <= 0)
      return { command: null, error: "Max gap must be > 0" };
    maxGapSeconds = gap;
  }

  return {
    command: { name: row.name, minSeconds: min, maxSeconds: max, maxGapSeconds },
    error: null,
  };
}

export default function ReviewTable({ config, onBack, onStart }: Props) {
  const [rows, setRows] = useState<EditableRow[]>(() =>
    rowsFromCommands(config.commands)
  );

  const parsed = rows.map(parseRow);
  const commands = parsed
    .map((p) => p.command)
    .filter((c): c is Command => c !== null);
  const canStart = commands.length === rows.length;

  const regularCount = rows.filter((r) => !r.isOneOff).length;
  const oneOffCount = rows.length - regularCount;

  function updateRow(i: number, patch: Partial<EditableRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function updateOneOffSeconds(i: number, value: string) {
    setRows((rs) =>
      rs.map((r, idx) =>
        idx === i ? { ...r, minRaw: value, maxRaw: value } : r
      )
    );
  }

  function handleGo() {
    if (!canStart) return;
    onStart({ commands, avoidRepeats: config.avoidRepeats });
  }

  return (
    <div className="review">
      <p className="review-summary">
        {regularCount} command{regularCount === 1 ? "" : "s"}
        {oneOffCount > 0 && (
          <>
            {" · "}
            <span className="oneoff-tag">
              {oneOffCount} one-off{oneOffCount === 1 ? "" : "s"}
            </span>
          </>
        )}
        {config.avoidRepeats && " · avoiding repeats"}
      </p>

      <div className="table review-table">
        <div className="table-head">
          <div>Command</div>
          <div className="head-duration">Duration</div>
          <div className="head-maxgap">Max gap</div>
        </div>

        {rows.map((row, i) => (
          <div
            key={`${row.name}-${i}`}
            className={`table-row ${row.isOneOff ? "oneoff" : "regular"}`}
          >
            <div className="cell-name-readonly">{row.name}</div>

            {row.isOneOff ? (
              <div className="cell-duration-editor oneoff-editor">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0.5}
                  step={0.5}
                  value={row.minRaw}
                  onChange={(e) => updateOneOffSeconds(i, e.target.value)}
                  aria-label={`Duration for ${row.name}`}
                />
                <span className="unit">s</span>
              </div>
            ) : (
              <div className="cell-duration-editor">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0.5}
                  step={0.5}
                  value={row.minRaw}
                  onChange={(e) => updateRow(i, { minRaw: e.target.value })}
                  aria-label={`Min seconds for ${row.name}`}
                />
                <span className="dash">–</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0.5}
                  step={0.5}
                  value={row.maxRaw}
                  onChange={(e) => updateRow(i, { maxRaw: e.target.value })}
                  aria-label={`Max seconds for ${row.name}`}
                />
                <span className="unit">s</span>
              </div>
            )}

            <div className="cell-maxgap-editor">
              <input
                type="number"
                inputMode="decimal"
                min={0.5}
                step={0.5}
                value={row.maxGapRaw}
                onChange={(e) => updateRow(i, { maxGapRaw: e.target.value })}
                placeholder="—"
                aria-label={`Max gap in seconds for ${row.name}`}
              />
              <span className="unit">s</span>
            </div>

            {parsed[i].error && (
              <div className="row-error">{parsed[i].error}</div>
            )}
          </div>
        ))}
      </div>

      <div className="controls review-controls">
        <button type="button" className="back" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="primary go"
          onClick={handleGo}
          disabled={!canStart}
        >
          Go
        </button>
      </div>
    </div>
  );
}
