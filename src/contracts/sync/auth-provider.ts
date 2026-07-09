/**
 * Provider de credenciais global (`Database.configure().credentials.provider`).
 *
 * Não confundir com {@link AuthStrategy}, que é por-endpoint (ver
 * {@link AuthenticationDefinition}) e está fora do MVP — MVP usa só
 * credenciais globais via `AuthProvider`.
 *
 * MVP: só `"oauth2"` é implementada.
 */
export type AuthProvider = "oauth2"; // MVP: única implementada
