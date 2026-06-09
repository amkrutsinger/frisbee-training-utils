export type SessionConfig = {
  commands: string[];
  minSeconds: number;
  maxSeconds: number;
  avoidRepeats: boolean;
};

export type AppState =
  | { phase: "setup" }
  | { phase: "running"; config: SessionConfig };
