---
title: Persistence
description: The Postgres store, the schema it owns, and how its migrations compose with yours.
---

[`authkit/postgres`](https://pkg.go.dev/github.com/gopherium/gouncer/authkit/postgres)
persists users and sessions in PostgreSQL. Its design goal is to be a
guest in your database without ever being a roommate: everything it
owns lives in a schema of its own, including its migration history.

## Wiring

```go
if err := authkitpg.Migrate(ctx, databaseURL); err != nil {
	return err
}
pool, err := pgxpool.New(ctx, databaseURL)
if err != nil {
	return err
}
store := authkitpg.NewUserStore(pool)
```

`NewUserStore` satisfies `gouncer.Store`, `authkit.AdminStore`, and
`authkit.SessionReaper`, so one value feeds the handlers, the admin
surface, and the reaper.

## The schema-ownership rule

`Migrate` creates and evolves the `auth` schema: `auth.users`,
`auth.sessions`, their indexes, and, crucially, its own goose version
table at `auth.goose_db_version`. Your application's migrations keep
their own version table. On every start, run both migrators, the
library's first:

```go
if err := authkitpg.Migrate(ctx, databaseURL); err != nil {
	return err
}
if err := appMigrate(ctx, databaseURL); err != nil {
	return err
}
```

Two migration lineages sharing one version table corrupt each other's
history. Separate tables make the module droppable into any database,
regardless of what migration numbering the application already uses.
The same rule generalizes: any schema-owning module you write should
migrate against its own version table.

## Semantics the store guarantees

- Duplicate emails surface as `gouncer.ErrEmailTaken`, mapped from the
  unique violation inside the store.
- Session lookup joins the user and refuses expired sessions and
  disabled users at the query level.
- `SetUserDisabled` flags the account and deletes its sessions in one
  transaction.
- `DeleteExpiredSessions` returns the reaped count and is backed by an
  index on the expiry column, so sweeps never scan the table.
- Case-insensitive email uniqueness holds through gouncer's
  normalization. Every writer goes through `gouncer.NewUser`, which
  lowercases before storage.

## Testing against the real thing

The module ships a
[`testdb`](https://pkg.go.dev/github.com/gopherium/gouncer/authkit/postgres/testdb)
package wiring [pgtestdb](https://github.com/peterldowns/pgtestdb):
each test gets a fresh database migrated through the module's own
`Migrate`, so test databases match production ones by construction.
Consumers can use the same migrator for their own store tests that
need the auth schema present.
