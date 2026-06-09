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
