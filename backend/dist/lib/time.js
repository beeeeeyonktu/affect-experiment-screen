export function nowMs() {
    return Date.now();
}
export function isoFromMs(ms) {
    return new Date(ms).toISOString();
}
