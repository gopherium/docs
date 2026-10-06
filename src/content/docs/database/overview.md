---
title: One database handle
description: What dbkit is, the addresses it reads, and the shared types every engine uses.
---

[`dbkit`](https://pkg.go.dev/github.com/gopherium/framework/dbkit)
gives your program one database handle and the pieces every part of
the program shares around it. A handle is the `*sql.DB` your code
runs its queries on.

## Why one handle

Open one `*sql.DB` for the site and pass it to everyone: your stores,
your accounts, your command line and your plugins. Never let a part
open its own.

On SQLite this rule keeps the file safe. A second copy of the SQLite
library keeps its own lock state. Code that opens and closes the
database file drops SQLite's locks. Either one can corrupt the file.
Many connections through one copy of SQLite are safe.

One handle also means one connection cap, so memory stays bounded,
and one set of connection rules for every query.

## Addresses

`EngineOf` reads which engine an address names:

| Address | Engine |
| --- | --- |
| `postgres://user@db/site` or `postgresql://...` | `dbkit.Postgres` |
| `sqlite:/srv/site/site.db` | `dbkit.SQLite` |

A SQLite address is `sqlite:` followed by a plain path. `SQLitePath`
returns that path. dbkit refuses `sqlite://`, `:memory:`, a `file:`
URI, and any `?`, `#` or `%` in the address. So an address can never
switch a connection rule off. Every refused address matches
`dbkit.ErrAddress`, and its message never repeats the address, which
may hold a password.

## Error classes

dbkit names five classes of database error. Test for one with
`errors.Is`:

| Class | Means |
| --- | --- |
| `ErrBusy` | a lock stayed taken past the engine's wait |
| `ErrUnique` | a unique or primary key constraint failed |
| `ErrForeignKey` | a foreign key constraint failed |
| `ErrNotNull` | a not null constraint failed |
| `ErrCheck` | a check constraint failed |

The classified error still wraps the driver's own error.

## Go functions for SQL

SQLite can call Go functions from SQL. Build the list once at start
with `NewFunctionList` and pass the same list to every open.
`CaseFold` is a ready entry named `casefold`, because SQLite's `LIKE`
folds case for ASCII letters only:

```go
functions, err := dbkit.NewFunctionList(dbkit.CaseFold())
```

```sql
SELECT id FROM core_items WHERE casefold(title) = casefold($1)
```

## Names and types on SQLite

Several owners keep their tables in the one SQLite file, so they
agree on these rules:

| Topic | Rule |
| --- | --- |
| Table names | a prefix replaces the PostgreSQL schema: `auth_users`, `gonsole_records`, `core_...`, `plugin_...` |
| Index names | take the same prefix, since SQLite scopes them to the file |
| Migrations | each owner keeps its own goose version table, such as `core_goose_db_version` |
| NOT NULL | every column PostgreSQL declares NOT NULL, primary keys included |
| Ids | `TEXT` in `uuid.UUID.String()` form, never a 16-byte blob |
| Times | `INTEGER` UTC microseconds, read with `dbkit.Time` |
| Booleans | `INTEGER` 0 or 1 |
| JSON | `TEXT`, read with `json_extract` and `json_each` |
| Hashes | `BLOB` |

`dbkit.Time` writes a time as microseconds and reads it back in UTC.
Scan a nullable column into a `*dbkit.Time`, which stays nil for
NULL.

## The import rule

Only dbkit imports a SQLite driver and only dbkit opens a handle.
Give your program the depguard and forbidigo rules from the
[dbkit README](https://github.com/gopherium/framework/tree/main/dbkit#the-import-rule).
forbidigo matters because `sql.Open("sqlite", path)` needs no driver
import to skip every connection rule.
