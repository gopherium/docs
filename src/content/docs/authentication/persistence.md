---
title: Persistence
description: The PostgreSQL store, the database schema it owns, and how its migrations sit beside yours.
---

`authkit/postgres` stores users and sessions in PostgreSQL, so you do
not have to write that layer yourself.

Its main design goal is to be a guest in your database rather than a
roommate. Everything it owns lives in a separate schema called `auth`,
including the record of which migrations have run. It never touches
your tables and never shares your migration history.

## Wiring it up

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

`Migrate` creates or updates the `auth` schema. `NewUserStore` then
gives you one value that satisfies three different interfaces:
`gouncer.Store`, `authkit.AdminStore` and `authkit.SessionReaper`. So
the same `store` feeds the login handlers, the
[admin surface](/authentication/user-administration/) and the session
cleanup, with no extra wiring.

## Keep migrations separate

`Migrate` owns the `auth` schema: the `auth.users` and `auth.sessions`
tables, their indexes, and its own record of applied migrations in
`auth.goose_db_version`.

That last part is the important one. Your application keeps its own
migration record in its own table. Run both migrators at startup, the
library's first:

```go
if err := authkitpg.Migrate(ctx, databaseURL); err != nil {
	return err
}
if err := appMigrate(ctx, databaseURL); err != nil {
	return err
}
```

Why it matters: a migration tool records which migrations it has
already applied. Point two different sets of migrations at one record
table and each will misread the other's entries as its own, and both
histories are then corrupt.

Keeping them apart also means this module drops into any database
whatever numbering your migrations already use. The same rule is worth
following for any module of yours that owns tables, including
[plugins](/plugins/host-lifecycle/).

## What the store guarantees

- A duplicate email comes back as `gouncer.ErrEmailTaken`. The store
  translates the database's unique constraint violation for you.
- Looking up a session joins the user and rejects expired sessions and
  disabled users in the query itself, so a stale session can never
  slip through in application code.
- `SetUserDisabled` sets the flag and deletes that account's sessions
  in a single transaction. Either both happen or neither does.
- `DeleteExpiredSessions` returns how many rows it removed, and uses
  an index on the expiry column, so cleanup never scans the whole
  table.
- Email uniqueness ignores case. Every write goes through
  `gouncer.NewUser`, which lowercases first.

## Testing against a real database

The module ships a
[`testdb`](https://pkg.go.dev/github.com/gopherium/gouncer/authkit/postgres/testdb)
package built on
[pgtestdb](https://github.com/peterldowns/pgtestdb). Every test gets
its own fresh database, migrated with the module's own `Migrate`.

That last detail is the point: your test databases are built the same
way production is, so a migration that would break production breaks
your tests first.

You can use the same helper for your own tests that need the `auth`
schema to exist.
