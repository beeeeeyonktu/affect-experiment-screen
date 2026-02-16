export function assertString(value, field) {
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`Invalid ${field}`);
    }
    return value;
}
export function assertOptionalNumber(value, field) {
    if (value === undefined || value === null)
        return undefined;
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`Invalid ${field}`);
    }
    return value;
}
