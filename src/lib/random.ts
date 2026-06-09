export function randomIntervalSeconds(min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.random() * (max - min);
}

export function pickCommand(
  commands: string[],
  prev: string | null,
  avoidRepeats: boolean
): string {
  if (!avoidRepeats || commands.length < 2 || prev === null) {
    return commands[Math.floor(Math.random() * commands.length)];
  }
  const pool = commands.filter((c) => c !== prev);
  return pool[Math.floor(Math.random() * pool.length)];
}
