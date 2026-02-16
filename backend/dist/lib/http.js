export function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            "content-type": "application/json",
            "cache-control": "no-store"
        },
        body: JSON.stringify(body)
    };
}
export function parseBody(rawBody) {
    if (!rawBody)
        throw new Error("Missing body");
    return JSON.parse(rawBody);
}
