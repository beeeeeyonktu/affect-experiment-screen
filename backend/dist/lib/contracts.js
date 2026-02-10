export function assertString(value, field) {
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`Invalid ${field}`);
    }
    return value;
}
