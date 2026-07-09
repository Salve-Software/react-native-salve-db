/**
 * Global credential provider (`Database.configure().credentials.provider`).
 *
 * Not to be confused with {@link AuthStrategy}, which is per-endpoint (see
 * {@link IAuthenticationDefinition}) and out of MVP scope — MVP uses only
 * global credentials via `AuthProvider`.
 *
 * MVP: only `"oauth2"` is implemented.
 */
export type AuthProvider = "oauth2"; // MVP: only one implemented
