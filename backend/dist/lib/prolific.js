import { envOr } from "./env.js";
function base64UrlToBytes(value) {
    const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const atobFn = globalThis.atob;
    if (!atobFn)
        throw new Error("Base64 decoder unavailable in runtime");
    const binary = atobFn(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1)
        out[i] = binary.charCodeAt(i);
    return out;
}
function decodeJson(segment) {
    const bytes = base64UrlToBytes(segment);
    const txt = new TextDecoder().decode(bytes);
    return JSON.parse(txt);
}
function assertProlificIds(claims) {
    if (!claims.PROLIFIC_PID || !claims.STUDY_ID || !claims.SESSION_ID) {
        throw new Error("Missing required Prolific claims");
    }
    return {
        PROLIFIC_PID: claims.PROLIFIC_PID,
        STUDY_ID: claims.STUDY_ID,
        SESSION_ID: claims.SESSION_ID
    };
}
function extractClaims(payload) {
    if (payload.prolific)
        return assertProlificIds(payload.prolific);
    return assertProlificIds(payload);
}
function normalizeAud(aud) {
    if (!aud)
        return [];
    return Array.isArray(aud) ? aud : [aud];
}
function originOf(urlLike) {
    try {
        return new URL(urlLike).origin;
    }
    catch {
        return urlLike;
    }
}
async function verifyRs256(headerB64, payloadB64, signatureB64, jwk) {
    const cryptoKey = await crypto.subtle.importKey("jwk", jwk, {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256"
    }, false, ["verify"]);
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = base64UrlToBytes(signatureB64);
    return crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, signature.buffer, data);
}
async function fetchJwks() {
    const url = envOr("PROLIFIC_JWKS_URL", "https://api.prolific.com/.well-known/study/jwks.json");
    const apiToken = envOr("PROLIFIC_API_TOKEN", "").trim();
    const headers = {};
    if (apiToken.length > 0)
        headers.authorization = `Token ${apiToken}`;
    const res = await fetch(url, { headers });
    if (!res.ok)
        throw new Error(`Failed to fetch Prolific JWKS (${res.status})`);
    return (await res.json());
}
function validateStandardClaims(payload) {
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) {
        throw new Error("Prolific token expired");
    }
    const expectedIssuer = envOr("PROLIFIC_EXPECTED_ISSUER", "https://www.prolific.com");
    if (payload.iss !== expectedIssuer) {
        throw new Error("Invalid Prolific token issuer");
    }
    const expectedAud = envOr("PROLIFIC_EXPECTED_AUDIENCE", "").trim();
    if (expectedAud.length > 0) {
        const tokenAud = normalizeAud(payload.aud);
        const expectedOrigin = originOf(expectedAud);
        const audMatch = tokenAud.some((x) => x === expectedAud || originOf(x) === expectedOrigin);
        if (!audMatch)
            throw new Error("Invalid Prolific token audience");
    }
}
function allowDevToken() {
    return envOr("ALLOW_DEV_JWT", "false").toLowerCase() === "true";
}
function allowUnsignedUrlParams() {
    return envOr("PROLIFIC_ALLOW_UNSIGNED_PARAMS", "true").toLowerCase() === "true";
}
function parseDevJsonToken(token) {
    const parsed = JSON.parse(token);
    return assertProlificIds(parsed);
}
export async function verifyProlificSecuredUrlJwt(token) {
    // URL-parameter mode: frontend sends JSON object with PROLIFIC_PID/STUDY_ID/SESSION_ID.
    if (allowUnsignedUrlParams()) {
        try {
            return parseDevJsonToken(token);
        }
        catch {
            // not plain JSON; continue with JWT path
        }
    }
    // Optional dev fallback for local simulation only.
    if (allowDevToken()) {
        try {
            return parseDevJsonToken(token);
        }
        catch {
            // not dev json; continue with JWT path
        }
    }
    const parts = token.split(".");
    if (parts.length !== 3)
        throw new Error("Invalid Prolific token format");
    const [headerB64, payloadB64, signatureB64] = parts;
    const header = decodeJson(headerB64);
    if (header.alg !== "RS256")
        throw new Error("Unsupported Prolific token algorithm");
    if (!header.kid)
        throw new Error("Missing Prolific token kid");
    const jwks = await fetchJwks();
    const jwk = jwks.keys.find((k) => (k.kid === header.kid) && k.kty === "RSA");
    if (!jwk)
        throw new Error("Unable to find Prolific signing key");
    const verified = await verifyRs256(headerB64, payloadB64, signatureB64, jwk);
    if (!verified)
        throw new Error("Invalid Prolific token signature");
    const payload = decodeJson(payloadB64);
    validateStandardClaims(payload);
    return extractClaims(payload);
}
