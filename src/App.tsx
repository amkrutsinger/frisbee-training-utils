import { useState } from "react";
import SetupForm from "./components/SetupForm";
import ReviewTable from "./components/ReviewTable";
import Session from "./components/Session";
import type { Command, SessionConfig } from "./types";
import { pickCommand } from "./lib/random";
import { speak } from "./lib/speech";

export type FormData = {
  commandsRaw: string;
  oneOffsRaw: string;
  defaultMinRaw: string;
  defaultMaxRaw: string;
  defaultOneOffRaw: string;
  avoidRepeats: boolean;
  hideNextExercise: boolean;
};

const INITIAL_FORM: FormData = {
  commandsRaw: "sprint, back pedal, shuffle left, shuffle right",
  oneOffsRaw: "high-five, jump",
  defaultMinRaw: "10",
  defaultMaxRaw: "30",
  defaultOneOffRaw: "1.2",
  avoidRepeats: false,
  hideNextExercise: false,
};

type Phase =
  | { kind: "setup" }
  | { kind: "review"; config: SessionConfig }
  | { kind: "running"; config: SessionConfig; initial: Command };

export default function App() {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [phase, setPhase] = useState<Phase>({ kind: "setup" });

  function handleReview(config: SessionConfig) {
    setPhase({ kind: "review", config });
  }

  function handleBack() {
    setPhase({ kind: "setup" });
  }

  function handleStart(config: SessionConfig) {
    // Speak synchronously inside the click handler so iOS Safari unlocks audio.
    const first = pickCommand(config.commands, null, config.avoidRepeats);
    speak(first.name);
    setPhase({ kind: "running", config, initial: first });
  }

  function handleStop() {
    setPhase({ kind: "setup" });
  }

  return (
    <main className="app">
      {phase.kind === "setup" && (
        <SetupForm form={form} onChange={setForm} onReview={handleReview} />
      )}
      {phase.kind === "review" && (
        <ReviewTable
          config={phase.config}
          onBack={handleBack}
          onStart={() => handleStart(phase.config)}
        />
      )}
      {phase.kind === "running" && (
        <Session
          config={phase.config}
          initialCommand={phase.initial}
          onStop={handleStop}
        />
      )}
    </main>
  );
}
