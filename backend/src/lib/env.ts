type EnvMap = Record<string, string | undefined>;

function readEnv(): EnvMap {
  const g = globalThis as unknown as { process?: { env?: EnvMap } };
  return g.process?.env ?? {};
}

export function envOr(name: string, fallback: string): string {
  const v = readEnv()[name];
  return v && v.length > 0 ? v : fallback;
}
