// TODO: replace with real signature validation against Prolific JWKS.
export async function verifyProlificSecuredUrlJwt(jwt) {
    // Dev fallback: allow JSON payload in local tests.
    try {
        const parsed = JSON.parse(jwt);
        if (!parsed.PROLIFIC_PID || !parsed.STUDY_ID || !parsed.SESSION_ID) {
            throw new Error("Missing required claim");
        }
        return parsed;
    }
    catch {
        throw new Error("Invalid secured_url_jwt; implement production JWT verification");
    }
}
