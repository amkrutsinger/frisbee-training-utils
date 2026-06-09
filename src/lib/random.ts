import type { Command } from "../types";

export function randomIntervalSeconds(min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.random() * (max - min);
}

// A command with min == max is treated as a "one-off" (fixed duration) and is
// exempt from the repeat-avoidance rule below.
function isOneOff(c: Command): boolean {
  return c.minSeconds === c.maxSeconds;
}

export type LastFiredMap = Record<string, number>;

export type PickOptions = {
  lastFired: LastFiredMap;
  sessionStart: number;
  now: number;
};

// Force-picks the most-overdue constrained command if any is overdue.
// Otherwise falls back to the normal random pick (honouring avoidRepeats).
// The force-pick wins over avoidRepeats — otherwise we couldn't actually
// guarantee the appearance within the user's deadline.
export function pickCommand(
  commands: Command[],
  prev: Command | null,
  avoidRepeats: boolean,
  options?: PickOptions
): Command {
  if (options) {
    const { lastFired, sessionStart, now } = options;
    let mostOverdue: { cmd: Command; gap: number } | null = null;
    for (const cmd of commands) {
      if (cmd.maxGapSeconds === undefined) continue;
      const maxGapMs = cmd.maxGapSeconds * 1000;
      const lastSeen = lastFired[cmd.name] ?? sessionStart;
      const gap = now - lastSeen;
      if (gap >= maxGapMs) {
        if (mostOverdue === null || gap > mostOverdue.gap) {
          mostOverdue = { cmd, gap };
        }
      }
    }
    if (mostOverdue) return mostOverdue.cmd;
  }

  if (
    avoidRepeats &&
    commands.length >= 2 &&
    prev !== null &&
    !isOneOff(prev)
  ) {
    const pool = commands.filter((c) => c.name !== prev.name);
    if (pool.length > 0) {
      return pool[Math.floor(Math.random() * pool.length)];
    }
  }
  return commands[Math.floor(Math.random() * commands.length)];
}

export function durationMsFor(command: Command): number {
  return randomIntervalSeconds(command.minSeconds, command.maxSeconds) * 1000;
}
