export function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

export function parseBody<T>(rawBody?: string | null): T {
  if (!rawBody) throw new Error("Missing body");
  return JSON.parse(rawBody) as T;
}
