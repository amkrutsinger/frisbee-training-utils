type WakeLockSentinel = { release: () => Promise<void> };

let sentinel: WakeLockSentinel | null = null;

export async function requestWakeLock(): Promise<void> {
  const nav = navigator as Navigator & {
    wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
  };
  if (!nav.wakeLock) return;
  try {
    sentinel = await nav.wakeLock.request("screen");
  } catch {
    // Permission denied or unsupported — silently degrade.
  }
}

export async function releaseWakeLock(): Promise<void> {
  if (!sentinel) return;
  try {
    await sentinel.release();
  } catch {
    // Ignore.
  }
  sentinel = null;
}
