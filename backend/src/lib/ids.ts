function fallbackUuid() {
  const rand = Math.random().toString(16).slice(2, 10);
  const now = Date.now().toString(16);
  return `${now}-${rand}`;
}

function uuid() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return fallbackUuid();
}

export function newSessionId() {
  return uuid();
}

export function newLeaseToken() {
  return uuid();
}
