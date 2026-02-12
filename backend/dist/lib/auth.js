export function assertAdminAuthorized(requestContext) {
    const claims = requestContext?.authorizer?.jwt?.claims;
    if (!claims) {
        throw new Error("admin unauthorized");
    }
}
