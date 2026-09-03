---
title: Migrations
---

Salve DB auto-migrates SQLite tables from your [schema](./schemas.md) definitions. There is
no migration file to write or run — the native [Migration Engine](../architecture.md)
diffs the declared schema against the stored table on every `Database.register()` call.

## How it works

Each schema declares a `version: number`. The engine tracks the last-applied version per
table in an internal `_salve_schema_versions` table and compares it against the schema's
declared `version` every time that schema is registered:

- **First run** — no stored version for the table yet. The engine creates the table from
  scratch, with every declared column, index, and reserved sync-metadata column.
- **Version bump** — the declared `version` is higher than the stored one. The engine diffs
  the declared columns against the table's actual columns and runs `ALTER TABLE ... ADD
  COLUMN` for anything missing. Columns marked `unique` get a companion `CREATE UNIQUE
  INDEX IF NOT EXISTS` right after, since `ADD COLUMN` can't carry a `UNIQUE` constraint
  directly.
- **Same version** — the engine still checks for reserved/internal columns the library
  itself may have added in a later release, so upgrading the package version is safe even
  without bumping your own schema version.

## Only `ADD COLUMN` — no `DROP`/`RENAME`

The engine only ever adds columns. It never drops a column, renames a column, or changes a
column's type. This is intentional, not a missing feature:

- `ADD COLUMN` is always safe against data already on the device — there is no destructive
  path.
- `DROP`/`RENAME COLUMN` require a rebuild-and-copy in SQLite in general, which is riskier
  to run automatically against production data you don't control the timing of.

If you need to remove or rename a field, add the new column, migrate data in application
code, and stop reading the old column — don't rely on the migration engine to drop it.

## Bumping a schema version

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

Registering this schema (via `Database.register({ schema: CustomerSchema })`) against a
device that already has version `1` runs a single `ALTER TABLE customers ADD COLUMN
loyaltyTier TEXT` and stores `2` as the new version for `customers`. A brand-new install
registering the same schema for the first time just creates the table with `loyaltyTier`
already present — there's no intermediate v1 state to pass through.

See [Schemas](./schemas.md) for the full column/index/relation contract, and
[Architecture](../architecture.md) for where the Migration Engine sits in the native core.
