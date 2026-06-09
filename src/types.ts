export type Command = {
  name: string;
  minSeconds: number;
  maxSeconds: number;
  // Optional: guarantee this command appears at least once per `maxGapSeconds`.
  // When set, the picker will force-pick this command if its last appearance
  // (or the session start, whichever is later) was longer ago than this gap.
  maxGapSeconds?: number;
};

export type SessionConfig = {
  commands: Command[];
  avoidRepeats: boolean;
};

export type AppState =
  | { phase: "setup" }
  | { phase: "running"; config: SessionConfig };
