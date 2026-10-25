---
title: Files in PostgreSQL
description: Keep your program's files in its PostgreSQL database through gocloud.dev/blob, with postgresblob.
---

[`postgresblob`](https://pkg.go.dev/github.com/gopherium/framework/postgresblob)
lets your program keep its files, such as uploads and attachments, in
the PostgreSQL database it already runs. You need no second service
for files.

It is a driver for [gocloud.dev/blob](https://gocloud.dev/howto/blob/),
the Go API for buckets of files. The same API has drivers for S3,
Google Cloud Storage, Azure, a local folder and memory, so your code
stays the same when you move your files elsewhere later.

If you know Laravel, gocloud.dev/blob plays the part of Flysystem, and
postgresblob is one more adapter behind it. Flysystem's own adapters
offer no disk made of database tables, and that is what this one is.

## How your files are stored

A bucket lives in one schema of your database, in two tables:

- `objects` holds one row for each file, with its key, size, content
  type and metadata.
- `chunks` holds the bytes, cut into pieces of 1 MiB by default.

Writes send one chunk at a time. Each read fetches at most one chunk,
or 1 MiB when chunks are smaller, so a large file never sits whole in
your program's memory unless you read it all at once.

A new file stays hidden until its writer closes. Then it takes the
place of the old file under that key in one transaction, so a reader
sees the old file or the new one, never half of each.

A key can be any UTF-8 text of up to 1,024 bytes, a NUL byte included.
Keys are stored as bytes, so a listing follows byte order, not the
sort order of your database's language.

## Creating the tables

Run `Migrate` once at startup, before you open a bucket:

```go
err := postgresblob.Migrate(ctx, db, "files")
```

`db` is your `*sql.DB`. `Migrate` creates the schema and both tables
through [`dbkit/postgres`](/database/postgres/#migrations), under
goose's migration lock, so many processes can start at once. The
schema keeps its own version table, `files.goose_db_version`.

The schema name must be a lowercase plain name, as
[migrations](/database/postgres/#migrations) explains. An empty name
means `blob`.

## Opening a bucket on your pool

Most programs already hold one `*pgxpool.Pool`. Hand it to
`OpenBucket`:

```go
bucket, err := postgresblob.OpenBucket(ctx, pool, &postgresblob.Options{
	Schema:  "files",
	MaxSize: 25 << 20,
})
if err != nil {
	return err
}
defer bucket.Close()
```

`OpenBucket` never closes your pool, so `bucket.Close` leaves it open
for the rest of your program. It checks that the database encoding is
UTF8 and refuses any other.

Each option you leave at zero takes its default:

| Option | Default | Meaning |
| --- | --- | --- |
| `Schema` | `blob` | the schema that holds the tables |
| `ChunkSize` | 1 MiB | the most bytes one chunk row holds, up to `MaxChunkSize` (256 MiB) |
| `MaxSize` | no cap | the most bytes one file may hold |
| `CleanupTimeout` | 10 seconds | how long a failed upload may take to delete its rows |

Each upload in progress holds one chunk in memory, so a large chunk
size costs memory for every upload at once.

## Opening a bucket from a URL

Import the package for its URL scheme, then open a URL:

```go
import _ "github.com/gopherium/framework/postgresblob"

bucket, err := blob.OpenBucket(ctx, "postgres://app@db.example.com/site?schema=files")
```

This bucket opens a pool of its own, and `bucket.Close` closes it. The
driver takes `schema` out of the URL and hands the rest to pgx, so
pgx settings such as `sslmode` and `pool_max_conns` work. pgx sends
every other query parameter to the server as a setting, and the
server turns down a name it does not know. go-cloud's own `prefix`
parameter works too.

When pgx cannot parse the URL, the error holds no part of it. A URL
that Go's `net/url` cannot parse never reaches the driver, and
go-cloud's error for it repeats the whole URL, password included. So
keep those errors out of shared logs.

## Writing and reading

Use the gocloud.dev/blob API as you would with any driver:

```go
err := bucket.WriteAll(ctx, "invoices/2026-10.pdf", data, &blob.WriterOptions{
	ContentType: "application/pdf",
	IfNotExist:  true,
})

r, err := bucket.NewReader(ctx, "invoices/2026-10.pdf", nil)
if err != nil {
	return err
}
defer r.Close()
_, err = io.Copy(w, r)
```

With `IfNotExist`, the write fails with `gcerrors.FailedPrecondition`
when the key already holds a file. Writes, copies and deletes of the
same key wait for each other, so when many writers race for one key,
exactly one wins.

A reader takes no snapshot. When another write replaces or deletes the
file while you read it, your next read fails with
`gcerrors.FailedPrecondition`. You never get short data. If your
program never replaces, deletes or copies onto a file while someone
reads it, this cannot happen.

## Capping file size

Set `MaxSize` to refuse files that are too large. A write or a copy
that would take a file past the cap fails with
`gcerrors.ResourceExhausted`, and the old file under that key stays as
it was.

## Cleaning up unfinished uploads

A writer whose context ends, or whose write fails, deletes its own
rows. But a program that stops in the middle of an upload, for example
in a crash, leaves a pending row behind. `Sweep` deletes those:

```go
deleted, err := postgresblob.Sweep(ctx, pool, postgresblob.SweepOptions{
	Schema:    "files",
	OlderThan: time.Hour,
	Limit:     100,
})
```

`Sweep` deletes at most `Limit` uploads that got no new chunk for
longer than `OlderThan`, the oldest first. Run it from a timer. When
it returns `Limit`, more may be waiting for the next run.

Pick an `OlderThan` longer than your slowest upload takes between two
chunks. An upload that `Sweep` deleted fails with
`gcerrors.FailedPrecondition` when it writes its next chunk or closes.

## Errors

Read the code of an error with `gcerrors.Code`:

| Code | When |
| --- | --- |
| `NotFound` | no file has the key, or the schema has no tables |
| `FailedPrecondition` | `IfNotExist` found a file, the file changed during a read, or `Sweep` deleted the upload |
| `InvalidArgument` | an empty key, or a key over 1,024 bytes |
| `ResourceExhausted` | a write or copy past `MaxSize`, or a server short of disk, memory or connections, or past one of its limits |
| `PermissionDenied` | the database role may not do what the call needs |
| `Canceled` | a canceled context, or a statement the server canceled |
| `Unimplemented` | `SignedURL` |
| `Unknown` | every other error |

A schema with no tables answers `NotFound` to every call, so a typo in
the schema name looks like an empty bucket. Call
`bucket.IsAccessible` at startup, and stop when it answers false.

`bucket.ErrorAs` sets a `*pgconn.PgError` when the error came from the
server, so you can read its SQLSTATE code.

## What it does not do

- `SignedURL` answers `gcerrors.Unimplemented`, so your program serves
  each file itself.
- Files grow your database and its backups. The chunks are stored
  without compression, which suits files such as PDF and JPEG that are
  compressed already.
- A large `Copy` runs as one long transaction, and writes to its
  source or its destination wait until it ends.

## Testing

For unit tests of your own code, use
[`memblob`](https://pkg.go.dev/gocloud.dev/blob/memblob), go-cloud's
driver in memory, since your code only sees the gocloud.dev/blob API.
Run postgresblob itself in the tests that need your database, with a
fresh database from [`pgtest`](/database/postgres/#testing) and
`Migrate` in its migrator.

postgresblob runs go-cloud's own conformance suite, `drivertest`, in
three ways: plain, behind a key prefix, and with 7 byte chunks so the
small test files cross chunk edges. CI runs it against PostgreSQL 18,
and once a week against the newest go-cloud.
