---
title: Credenciais OAuth2
---

O bloco `credentials` do `Database.configure` declara um provedor de credenciais OAuth2 para as
requisições de sincronização. Uma vez configurado, o armazenamento e a renovação dos tokens são
tratados inteiramente pelo engine nativo — o JS nunca mais vê os tokens depois da chamada inicial de
`configure()`.

## `ICredentialsDefinition`

```ts
interface ICredentialsDefinition {
  provider: 'oauth2';
  accessToken?: {
    headerName?: string;   // default: "Authorization"
    scheme?: string;       // default: "Bearer"
  };
  tokens?: {
    accessToken: string;
    refreshToken: string;
  };
  refresh: {
    endpoint: string;
    response: {
      accessToken: JsonPath;
      refreshToken: JsonPath;
    };
  };
}
```

- **`provider`** — apenas `"oauth2"` está implementado.
- **`accessToken.headerName`** / **`accessToken.scheme`** — onde o access token viaja nas requisições
  de sincronização, e o prefixo de esquema aplicado a ele (ex.: `Authorization: Bearer <token>`).
  Padrão: `"Authorization"` e `"Bearer"`. Passe `scheme: ""` para APIs que esperam o token bruto sem
  prefixo de esquema.
- **`tokens`** — o par inicial de access/refresh token, obtido pelo próprio fluxo de login do app
  (fora do escopo desta biblioteca) antes de chamar `Database.configure()`. Armazenado nativamente
  (Keychain no iOS, Keystore no Android) e nunca mais relido a partir do JS depois disso — toda
  renovação subsequente é 100% nativa.
- **`refresh.endpoint`** — a rota de renovação de token que o `CredentialProvider` nativo chama em um
  401.
- **`refresh.response`** — um par [`JsonPath`](../architecture.md) (`accessToken`, `refreshToken`)
  que informa ao engine nativo onde encontrar os novos tokens no corpo da resposta do endpoint de
  renovação.

```ts
credentials: {
  provider: 'oauth2',
  // accessToken.headerName/scheme default to "Authorization"/"Bearer" — override for custom APIs.
  tokens: { accessToken, refreshToken },
  refresh: {
    endpoint: '/auth/refresh',
    response: { accessToken: '$.accessToken', refreshToken: '$.refreshToken' },
  },
}
```

## Onde os tokens ficam

O par inicial `tokens.accessToken`/`tokens.refreshToken` passado para `configure()` é escrito uma
única vez no armazenamento seguro da plataforma — o **Keychain** no iOS, o **Keystore** no Android —
pelo `CredentialProvider` nativo. A partir daí:

- O JS nunca lê os tokens de volta. Não existe API do `Database` para recuperar o access ou refresh
  token atual.
- O header de autenticação de toda requisição de sincronização é anexado nativamente, usando
  qualquer token que esteja no momento no armazenamento seguro.
- Um par de tokens renovado sobrescreve o par armazenado nativamente; o JS nunca é informado de que
  uma renovação aconteceu.

## A renovação é 100% nativa

Quando uma chamada HTTP de sincronização recebe um `401`, o engine nativo — não o JS — chama
`refresh.endpoint` com o refresh token armazenado, extrai o novo `accessToken`/`refreshToken` da
resposta usando o par de `JsonPath` configurado, escreve-os de volta no Keychain/Keystore, e refaz a
chamada original. Isso acontece independentemente de a sessão de sincronização ter sido disparada
pelo JS (`Database.sync()` / `syncAll()`), pelo `syncOnAppOpen`, ou por um wake em background em que
o runtime JS sequer chegou a ser iniciado — veja [Background Sync](../guides/background-sync.md). O
JS não tem nenhum hook para esse fluxo e nenhuma forma de interceptar, atrasar ou observar uma
renovação individual.

Para o contrato de sincronização que essas credenciais autenticam, veja [Sincronização](../guides/sync.md).
