---
title: Shares
description: Lend each plugin a capped, timed and counted share of the one database handle.
---

A share is a view of your program's one handle, lent to one part of
it, such as one plugin. Each share has a cap on how much of the
handle it may hold at once. A plugin never opens its own handle,
because it would escape the connection cap and the connection rules
of the site.

## Building a share

Build one share per plugin at start, from the handle and your own
settings:

```go
share, err := dbkit.NewShare(db, dbkit.SQLite, dbkit.ShareOptions{
	ID:                 "notes",
	Slots:              cfg.PluginSlots,
	StatementTimeout:   cfg.StatementTimeout,
	TransactionTimeout: cfg.TransactionTimeout,
	Observer:           refuseWritesOnRead,
})
```

On PostgreSQL, pass the `database/sql` view that sits beside your
pgx pool, so the pool's cap stays the only cap. Every number is
required, and `NewShare` refuses a missing one. It opens nothing and
sends nothing.

## Slots

Each slot is one thing the share holds at once. A call that finds
every slot taken waits until one frees or its statement timeout
passes, then fails with `dbkit.ErrShareFull`.

| Call | Holds its slot until |
| --- | --- |
| `Exec` | it returns |
| `Query` | `Close`, the last `Next` that returns false, or the statement timeout |
| `QueryRow` | `Scan`, or the statement timeout |
| `Begin` | `Commit`, `Rollback`, or the transaction timeout |

Statements inside a transaction run on its connection and take no
slot. They end with the transaction at the latest. Read a result set
within the statement timeout, because the rows close when it passes.
For the same reason `Scan` never takes a `*sql.RawBytes`.

## Writing parameters

Write each parameter as `$1`, `$2` and so on, once, for both
engines. On SQLite the share rewrites them to `?1`, `?2` outside
strings, quoted names and comments.

On SQLite `$2` is a name, numbered in order of appearance. So some
drivers bind `SELECT $2 || '-' || $1` backwards, with no error.
`?2` binds the second argument on every driver.

- Never write `?` or `?1` yourself, and never a named parameter such
  as `:name` before a `$1`. On SQLite the share refuses them with
  `dbkit.ErrPlaceholder`.
- Write `CAST($1 AS TEXT)`, never `$1::text`. SQLite reads `::text`
  as a parameter name and fails.

## Counting statements

A budget counts the statements of each request. Attach a fresh
counter in your middleware and read it after the handler:

```go
budget, err := dbkit.NewQueryBudget(cfg.QueryBudget)

func countQueries(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := budget.Attach(r.Context())
		next.ServeHTTP(w, r.WithContext(ctx))
		if count, ok := dbkit.QueriesIn(ctx); ok && count.PastBudget {
			log.Printf("%s ran %d statements", r.URL.Path, count.Total)
		}
	})
}
```

`Exec`, `Query` and `QueryRow` count, per share and in total.
`Begin`, `Commit` and `Rollback` never count.

## The observer

The observer sees every statement and every `Begin` before the
driver does, and refuses one by returning an error. This one refuses
writes during a read request:

```go
func refuseWritesOnRead(ctx context.Context, s dbkit.Statement) error {
	method, _ := ctx.Value(methodKey{}).(string)
	if s.Writes && (method == http.MethodGet || method == http.MethodHead) {
		return errWriteOnRead
	}
	return nil
}
```

The refused statement takes no slot, and its error matches both
`dbkit.ErrRefused` and yours. The observer runs inside the statement
timeout. `Writes` reads the text, not what it does. When in doubt it
says the statement writes:

- A function that writes, such as `nextval`, still reads as a read.
- `SELECT ... FOR UPDATE` reads, but a read-only session refuses it.
- A backslash in a PostgreSQL string makes the statement write. Pass
  such text as a parameter.

## Wrapping the share

Hide the share behind your own interface for plugins. On an error,
return a plain `nil`:

```go
rows, err := n.share.Query(ctx, query, args...)
if err != nil {
	return nil, err
}
return rows, nil
```

Returning `rows, err` directly would put a nil `*dbkit.Rows` inside
your interface, and that interface is not nil.

## What it costs

Measured on an AMD Ryzen 7 7800X3D with Go 1.27.1. Taking and giving
back a slot costs about 35 ns. The statement deadline costs about
300 ns. The rewrite costs about 130 ns for text with no `$` and
about 230 ns for a short statement with several, with one
allocation. A whole `Exec` through a share on a fake driver takes
about 720 ns.
