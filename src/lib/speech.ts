// Notes on iOS audio coexistence (e.g. Spotify playing on the same device):
//
// iOS Safari's speechSynthesis runs under the OS "playback" audio session
// category. JS cannot change this. Practical consequence: each utterance
// briefly ducks (or pauses) other audio for the ~0.5-0.8s the command takes
// to speak, then the other app resumes automatically.
//
// We deliberately do NOT touch the Web Audio API or play any HTML <audio>
// elements — doing either would claim the audio session for ourselves and
// could prevent the background app (Spotify, Apple Music, etc.) from
// resuming. As long as we stick to speechSynthesis, the OS handles the
// ducking-and-resume dance for us.

export function speak(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  // Only cancel if something is actually queued — calling cancel() right before
  // speak() can suppress the first utterance on iOS Safari.
  if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
    window.speechSynthesis.cancel();
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
}

export function cancelSpeech(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
}
