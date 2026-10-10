---
title: PostgreSQL
description: Open the one PostgreSQL pool of a site, check its address, migrate it and test against fresh databases.
---

[`dbkit/postgres`](https://pkg.go.dev/github.com/gopherium/framework/dbkit/postgres)
opens your site's one PostgreSQL pool through pgx. You get the pool
for pgx code and a `database/sql` view for everything else, with one
connection cap for both.

## Opening the handle

```go
h, err := postgres.Open(cfg.DatabaseURL, postgres.Options{
	MaxConns: cfg.MaxConns,
})
```

`h.Pool` is a `*pgxpool.Pool`. `h.DB` is a `*sql.DB` that borrows its
connections from that pool. `MaxConns` caps both views together and
must be 2 or more. The view keeps no idle connection of its own, so
every connection it frees goes back to the pool.

`Open` connects to nothing. The first query opens the first
connection, and the pool keeps no minimum of idle ones. `h.Close`
closes the view, then the pool, and waits until every borrowed
connection is given back.

## Addresses

`Open` checks the address with `CheckAddress` first. Call it yourself
too, for example when your settings load.

A URL address may hold only one `@` before the first `/`, the one that
ends the user and password. Write every other `@` as `%40`:

```text
postgres://site:p%40ss@db/site
```

The rule is strict because pgx versions disagree. pgx 5.10 ends the
user and password at the last `@` before the first `/`, `?` or `#`.
pgx 5.11 ends them at the first `@` before the first `/`, even inside
the query. So `postgres://db?sslpassword=a@b` reaches the host `db` on
5.10 and the host `b` on 5.11. `CheckAddress` refuses both shapes, and
each shape in the next two sections, because pgx 5.10 and 5.11 read
those as different settings too.

### Writing a URL address

In the user or password, write `?` as `%3F`, `#` as `%23`, `/` as
`%2F` and `@` as `%40`. Percent-encode every character other than
letters, digits and `-._~!$&'()*+,;=:`, because pgx 5.10 cannot read
it there. A password `p?a#s/s@` goes in like this:

```text
postgres://site:p%3Fa%23s%2Fs%40@db/site
```

In Go, `url.UserPassword(user, password).String()` writes the user
and password this way for you.

Write these characters percent-encoded in the rest of the address too:

| Character | Write it as | Where |
| --- | --- | --- |
| `#` | `%23` | anywhere |
| a space | `%20` | anywhere |
| `%` | `%25` | anywhere |
| `+` | `%2B` | in the query |
| a semicolon | `%3B` | in the query |
| `=` inside a value | `%3D` | in the query |

pgx 5.10 drops everything after a `#`, and pgx 5.11 keeps it. So
`postgres://site:pw@db/site#primary` reaches the database `site` on
one and `site#primary` on the other.

A space or a control character, such as a line end, is refused
anywhere in a URL. Every `%` must start an escape of two hex digits,
and `%00` is refused.

In the query, pgx 5.10 reads a raw `+` as a space. It also drops a
whole pair that holds a semicolon or a bad escape, so
`sslmode=verify-full%` would silently fall back to `prefer`. Write
the query like this:

```text
postgres://site:pw@db/site?options=-c%20search_path%3Dsite
```

Each query pair needs exactly one `=`. Give each key once, and count
`dbname` and `database` as one key. pgx 5.10 keeps the first value and
pgx 5.11 the last, so `?sslmode=require&sslmode=disable` turns TLS on
in one and off in the other. Set `sslmode`, never `ssl`, which only
pgx 5.11 reads as `sslmode=require`.

In a host list, name every host, and give every host a port:

```text
postgres://site:pw@db1:5432,db2:5433/site
```

pgx 5.10 gives a lone port to every host, while pgx 5.11 gives it
only to its own host, so a list where some hosts have a port is
refused. A list with no port at all passes, but see the environment
below. A `host` key in the query must name every host too.

A database name that starts with `/` goes in the query, with the `/`
written as `%2F`: `postgres://db/?dbname=%2Fsite`.

### Writing a keyword and value address

A keyword and value address, such as `host=db user=site`, passes, but
it may hold no backslash. pgx 5.11 drops every backslash and pgx 5.10
keeps most of them, so write such an address as a URL with `%5C`.
Name every host of a `host` list, and never give `host=''`.

### Shapes one pgx cannot parse

A few shapes can be parsed by only one of the two pgx versions, such
as an IPv6 host inside a host list or a `%2F` socket directory in the
host part. On the pgx that cannot read them, `Open` refuses them with
its fixed message that pgx cannot parse the address.

### Empty addresses and the environment

`CheckAddress` also refuses an empty or blank address, since pgx
would then take every setting from the `PG*` environment variables.

pgx merges the `PG*` environment variables under any address. A
setting your address leaves out, such as `PGSSLMODE`, still comes from
the environment. So keep your program's environment free of `PG*`
variables you did not mean to set.

With no `PG*` variable set, every address `CheckAddress` accepts reads
the same on every pgx this module allows. Two shapes still read apart
once the environment is set:

- A host list with no ports, such as `postgres://site:pw@db1,db2/site`,
  takes `PGPORT` on pgx 5.10 and port 5432 on pgx 5.11. Give every host
  a port.
- An empty password, such as `postgres://site:@db/site`, sends no
  password on pgx 5.10 and `PGPASSWORD` on pgx 5.11. Leave the password
  out instead of empty.

A `pg_service.conf` file is read by pgx, not by `CheckAddress`, so
the same rules apply to what you write in it.

### Pool settings

`Open` checks the `pool_*` settings of the address after
`CheckAddress`:

| Setting | `Open` |
| --- | --- |
| `pool_max_conns`, `pool_min_conns`, `pool_min_idle_conns` | refused |
| `pool_health_check_period` | refused at zero or below |
| `pool_max_conn_lifetime` | refused at zero or below |
| `pool_max_conn_lifetime_jitter` | refused below zero |
| `pool_ping_timeout` | refused |
| `pool_max_conn_idle_time` | passes at any value |

The first three are refused because `MaxConns` is the only cap and
the pool opens no idle connection.

A health check period of zero makes pgx panic in the background and
stop your program. A lifetime of zero makes every connection expire
at once on pgx 5.10, so no query ever gets one, and never expire on
pgx 5.11. A jitter below zero moves the expiry earlier, and a large
one makes some connections expire as soon as they open.

pgx 5.10 does not know `pool_ping_timeout` and sends it to the server,
which then turns down every connection. At zero or below,
`pool_max_conn_idle_time` makes pgx close each idle connection at the
next health check.

Every refused address matches `dbkit.ErrAddress`, and its message
never repeats the address. A refused pool setting names its key and
never its value.

## Error classes

`Classify` wraps a server error in its dbkit
[error class](/database/overview/#error-classes):

```go
_, err := h.DB.ExecContext(ctx, "INSERT INTO core.items VALUES ($1)", code)
if errors.Is(postgres.Classify(err), dbkit.ErrUnique) {
	return errCodeTaken
}
```

| Server code | Class |
| --- | --- |
| 23505 | `ErrUnique` |
| 23503 | `ErrForeignKey` |
| 23502 | `ErrNotNull` |
| 23514 | `ErrCheck` |
| 55P03, 40001, 40P01 | `ErrBusy` |

55P03 is a lock that was not free, under `NOWAIT` or `lock_timeout`.
40001 is a serialization failure and 40P01 a deadlock. Each one is a
race your transaction lost, and a retry may win it. 57014, a statement
stopped by `statement_timeout`, stays unclassed, even when it cut a
lock wait short. Every other error comes back unchanged.

## Migrations

Each owner of tables keeps its own goose version table:

```go
err := postgres.Migrate(ctx, h.DB, postgres.Migrations{
	Table: "core.goose_db_version",
	FS:    migrations,
})
```

`Table` is a lowercase plain name, alone or after a schema and a dot,
with up to 63 bytes in each part. No part, before or after the dot,
may be a keyword PostgreSQL reserves, such as `user`, `order` or
`table`. Those are the 101 words that `pg_get_keywords()` lists in the
categories R and T on PostgreSQL 18. Keywords PostgreSQL does not
reserve, such as `version` or `between`, pass. The schema may not
start with `pg_`, which PostgreSQL keeps for itself.

When the schema is missing, `Migrate` creates it first, which needs
the CREATE right on the database. A role that already owns the schema,
or may create in it, needs nothing more.

`Migrate` holds goose's session advisory lock while it runs, with
goose's default lock id 4097083626. Every owner on the database
shares that id, so runs from many processes take turns. A waiting run
tries again every 5 seconds for about 5 minutes. The lock belongs to
one server session, so migrate over a direct connection. A connection
pooler in transaction mode, such as PgBouncer, hands each transaction
another session and breaks the lock.

Go migrations come only from `Migrations.Go`, each built with
`goose.NewGoMigration`. goose's global registry is ignored. Run the
owners one after another, never one inside another.

## Shares on PostgreSQL

Build each share on `h.DB` with `dbkit.Postgres`:

```go
share, err := dbkit.NewShare(h.DB, dbkit.Postgres, dbkit.ShareOptions{
	ID:                 "notes",
	Slots:              cfg.PluginSlots,
	StatementTimeout:   cfg.StatementTimeout,
	TransactionTimeout: cfg.TransactionTimeout,
})
```

The share borrows from the pool, so `MaxConns` stays the only cap.
[Shares](/database/shares/) explains slots, parameters and the
observer.

## Testing

`pgtest` gives each test a fresh database, cut from a template that
is migrated once:

```go
var migrator = pgtest.Migrator(migrationsHash, migrate)

func migrate(ctx context.Context, db *sql.DB) error {
	return postgres.Migrate(ctx, db, coreMigrations)
}

func TestSavesAnItem(t *testing.T) {
	address := pgtest.New(t, testServer, migrator)
	h, err := postgres.Open(address, postgres.Options{MaxConns: 4})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = h.Close() })
}
```

`Migrator` builds one template per hash, so change the hash whenever
your migrations change. `New` takes the server's `postgres://` URL and
returns the escaped address of the new database. It refuses a keyword
and value address, and a host with a colon, such as an IPv6 literal.
Give such a server a host name. `URL` builds the same escaped address
from a `pgtestdb.Config`.

`New` checks the address with `CheckAddress` too. It also refuses an
address pgx cannot parse, and an address whose query sets `password`
or `sslpassword`. Write the server password before the `@`, and set a
client key password in `PGSSLPASSWORD`. It refuses a query that sets
`user`, `host`, `port`, `dbname` or `database` as well, since pgtestdb
copies the query onto every test database and those keys would send
it elsewhere. Give them before the `?`.

dbkit's own errors hold no part of the address. When the server cannot
be reached, pgx's connect error, which `New` and `Migrate` pass on,
names the user, the database and the host, but never the password.

When the address has no password, `New` uses the one pgx finds in
`PGPASSWORD` or in your passfile. Every option the address sets, such
as `sslmode` or `application_name`, reaches each test database, and
the address `New` returns keeps it.

A passing test drops its database. A failed test keeps it, so you can
look inside. `Sweep` drops those leftovers:

```go
dropped, err := pgtest.Sweep(ctx, testServer, cfg.TestDatabaseMaxAge)
```

`Sweep` drops each test database older than the age you pass that has
no session on it, and returns the names it dropped. Templates and
other databases stay. The age counts from when PostgreSQL created the
database. pgtest has no default age, so take it from your own settings
and make it longer than your longest test run.

PostgreSQL waits up to 5 seconds for the sessions on a database to end
before it gives up a drop. So `Sweep` spends up to 5 seconds on each
test database that still has a session, then keeps it.

The role of the address you pass to `Sweep` must be allowed to drop
the test databases and to call `pg_stat_file`. A superuser can do
both. Any other role needs membership in `pgtdbuser`, the pgtestdb
role that owns every test database, and `EXECUTE` on
`pg_stat_file(text, boolean)`.

`NewSwept` does both in one call. The first call for an address sweeps
the server, then every call hands out a fresh database as `New` does:

```go
func TestSavesAnItem(t *testing.T) {
	address := pgtest.NewSwept(t, testServer, cfg.TestDatabaseMaxAge, migrator)
	h, err := postgres.Open(address, postgres.Options{MaxConns: 4})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = h.Close() })
}
```

Each test process sweeps each address at most once. Tests that start
while that sweep runs wait for it, and the first call's age is the one
it uses. An age of zero or less fails the test. A failed sweep, such as
one whose role lacks the rights above, is logged on the test that ran
it, and every test still gets its fresh database. `go test -v` shows
that line.

The test binaries of one `go test ./...` each sweep once, and they stay
out of each other's way. A sweep keeps a database that is in use or
younger than the age, and skips one that another sweep dropped first.

Templates stay. Each migration hash keeps one, a few tens of megabytes,
and neither `Sweep` nor `NewSwept` drops it.
