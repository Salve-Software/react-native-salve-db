/**
 * Estratégia de autenticação por-endpoint de um {@link AuthenticationDefinition}.
 *
 * Não confundir com {@link AuthProvider}, que é a credencial global do app.
 */
export type AuthStrategy = "none" | "bearer" | "basic" | "custom";
