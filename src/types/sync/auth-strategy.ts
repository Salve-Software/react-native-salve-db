/**
 * Per-endpoint authentication strategy for an {@link IAuthenticationDefinition}.
 *
 * Not to be confused with {@link AuthProvider}, which is the global app credential.
 */
export type AuthStrategy = "none" | "bearer" | "basic" | "custom";
