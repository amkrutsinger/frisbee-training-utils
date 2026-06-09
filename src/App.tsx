import { useState } from "react";
import SetupForm from "./components/SetupForm";
import Session from "./components/Session";
import type { AppState, SessionConfig } from "./types";
import { pickCommand } from "./lib/random";
import { speak } from "./lib/speech";

export default function App() {
  const [state, setState] = useState<AppState>({ phase: "setup" });
  const [initialCommand, setInitialCommand] = useState<string>("");

  function handleStart(config: SessionConfig) {
    // Speak synchronously inside the click handler so iOS Safari unlocks audio.
    const first = pickCommand(config.commands, null, config.avoidRepeats);
    speak(first);
    setInitialCommand(first);
    setState({ phase: "running", config });
  }

  function handleStop() {
    setState({ phase: "setup" });
  }

  return (
    <main className="app">
      {state.phase === "setup" ? (
        <SetupForm onStart={handleStart} />
      ) : (
        <Session
          config={state.config}
          initialCommand={initialCommand}
          onStop={handleStop}
        />
      )}
    </main>
  );
}
