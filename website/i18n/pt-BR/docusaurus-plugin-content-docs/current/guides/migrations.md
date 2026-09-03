---
title: Migrações
---

O Salve DB migra automaticamente tabelas SQLite a partir das suas definições de
[schema](./schemas.md). Não existe arquivo de migração para escrever ou executar — o
[Migration Engine](../architecture.md) nativo compara o schema declarado com a tabela armazenada a
cada chamada de `Database.register()`.

## Como funciona

Cada schema declara uma `version: number`. O motor rastreia a última versão aplicada por tabela em
uma tabela interna `_salve_schema_versions` e a compara com a `version` declarada do schema toda
vez que esse schema é registrado:

- **Primeira execução** — ainda não há versão armazenada para a tabela. O motor cria a tabela do
  zero, com toda coluna, índice e coluna reservada de metadados de sincronização declarados.
- **Incremento de versão** — a `version` declarada é maior que a armazenada. O motor compara as
  colunas declaradas com as colunas reais da tabela e executa `ALTER TABLE ... ADD COLUMN` para
  qualquer coluna faltante. Colunas marcadas como `unique` recebem um `CREATE UNIQUE INDEX IF NOT
  EXISTS` complementar logo em seguida, já que `ADD COLUMN` não consegue carregar uma restrição
  `UNIQUE` diretamente.
- **Mesma versão** — o motor ainda verifica colunas reservadas/internas que a própria biblioteca
  pode ter adicionado em um release posterior, então atualizar a versão do pacote é seguro mesmo
  sem incrementar a versão do seu próprio schema.

## Apenas `ADD COLUMN` — sem `DROP`/`RENAME`

O motor só adiciona colunas. Ele nunca remove uma coluna, renomeia uma coluna, ou muda o tipo de
uma coluna. Isso é intencional, não uma funcionalidade em falta:

- `ADD COLUMN` é sempre seguro em relação aos dados já presentes no dispositivo — não existe um
  caminho destrutivo.
- `DROP`/`RENAME COLUMN` normalmente exigem reconstruir e copiar a tabela no SQLite, o que é mais
  arriscado de executar automaticamente contra dados de produção cujo timing você não controla.

Se você precisar remover ou renomear um campo, adicione a nova coluna, migre os dados no código da
aplicação, e pare de ler a coluna antiga — não conte com o motor de migração para removê-la.

## Incrementando a versão de um schema

```ts
export const CustomerSchema = {
  name: "customers",
  version: 2, // bumped from 1
  primaryKey: "id",
  columns: {
    id: { type: "string" },
    name: { type: "string" },
    // new in v2
    loyaltyTier: { type: "string", nullable: true },
  },
};
```

Registrar esse schema (via `Database.register({ schema: CustomerSchema })`) em um dispositivo que
já está na versão `1` executa um único `ALTER TABLE customers ADD COLUMN loyaltyTier TEXT` e
armazena `2` como a nova versão de `customers`. Uma instalação nova, registrando o mesmo schema
pela primeira vez, simplesmente cria a tabela já com `loyaltyTier` presente — não há um estado
intermediário v1 pelo qual passar.

Veja [Schemas](./schemas.md) para o contrato completo de coluna/índice/relação, e
[Arquitetura](../architecture.md) para onde o Migration Engine se encaixa no núcleo nativo.
