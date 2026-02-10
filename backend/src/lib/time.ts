export function nowMs() {
  return Date.now();
}

export function isoFromMs(ms: number) {
  return new Date(ms).toISOString();
}
