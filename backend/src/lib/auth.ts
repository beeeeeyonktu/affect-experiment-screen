export interface ApiRequestContext {
  authorizer?: {
    jwt?: {
      claims?: Record<string, unknown>;
    };
  };
}

export function assertAdminAuthorized(requestContext?: ApiRequestContext) {
  const claims = requestContext?.authorizer?.jwt?.claims;
  if (!claims) {
    throw new Error("admin unauthorized");
  }
}

