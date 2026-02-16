function readEnv() {
    const g = globalThis;
    return g.process?.env ?? {};
}
export function envOr(name, fallback) {
    const v = readEnv()[name];
    return v && v.length > 0 ? v : fallback;
}
