---
title: SQLite
description: Open the one SQLite handle of a site, migrate it, rebuild a table and take snapshots.
---

[`dbkit/sqlite`](https://pkg.go.dev/github.com/gopherium/framework/dbkit/sqlite)
opens your site's one SQLite file with every connection rule on. It runs
on the pure Go driver `modernc.org/sqlite`, so your binary needs no C
compiler.

## Opening the handle

```go
db, err := sqlite.Open(cfg.DatabaseURL, sqlite.Options{
	BusyTimeout: cfg.BusyTimeout,
	BusyPoll:    cfg.BusyPoll,
	CacheSize:   cfg.CacheSizeKiB,
	MaxConns:    cfg.MaxConns,
	Synchronous: sqlite.SynchronousFull,
	Functions:   functions,
	BaseFolder:  cfg.DataFolder,
})
```

`Open` connects to nothing. The first query opens the first
connection. Every connection writes ahead to a log, enforces foreign
keys, starts each write transaction with `BEGIN IMMEDIATE`, and
refuses edits of the schema table. A connection waits up to
`BusyTimeout` for a lock.

Every number is required. `BusyPoll` must be at least 1ms and at most
`BusyTimeout`. Each connection keeps its own page cache, so `MaxConns`
times `CacheSize` is what the caches may take.

## What Open refuses

- A relative path without `BaseFolder`, and a missing file unless you
  set `Create`. Only install and first start should create.
- A file or folder on a network file system, such as NFS, SMB or 9P,
  where SQLite's locks are unreliable. A Windows folder seen from WSL2,
  such as `/mnt/c`, is 9P.
- Every database on a system other than Linux and macOS.

A transaction opened with `ReadOnly: true` starts with a plain `BEGIN`
and never waits for the writer. The driver does not stop a write inside
it. Run a plain `PRAGMA optimize` from your own scheduled job.

## Waiting for a lock

SQLite lets one connection write at a time. The other writers wait for
its lock. A wait ends at once when the context of your call ends. That
holds for a statement you prepared with `PrepareContext` too. A wait
while you read the rows of a query, or close them, ends with the
query's context. A wait in a commit ends with the context you gave
`BeginTx`. On a share it ends with the context you gave `Begin`, or at
the transaction timeout.

A call stopped by its context returns an error that matches your
context's error, `ctx.Err()`. When opening a connection answered busy
before your context ended, the error also matches the class
`dbkit.ErrBusy` once you pass it to
[`sqlite.Classify`](/database/overview/#error-classes). Check with
`errors.Is`, never with `==`.

A write can land in the instant before its deadline and still return
the context error. So before you run a write again, check whether the
first one was saved.

Leave `PRAGMA busy_timeout` to dbkit. It reads `BusyTimeout`. A value
you set stays on that connection for every later call that uses it,
and 0 makes that connection answer busy at once.

Opening a connection waits for a lock too, and tries again every
`BusyPoll`. One case is the
first connection to a new file while another process switches that
file to its write-ahead log. Each try to open can block for about one
`BusyPoll`, so keep `BusyPoll` small. When the context of the call
that opens the connection ends, a try still running goes on, even past
`db.Close`. Then it closes what it opened. So a test whose open
stopped on a locked file can find its temporary folder still in use at
cleanup.

A lower `BusyPoll` lets an opening connection see a freed lock sooner.
But it tries the lock more often, which costs CPU. Any other wait tries
again on SQLite's own schedule, which grows to one try every 100ms.

## Migrations

Each owner of tables in the file keeps its own goose version table:

```go
err := sqlite.Migrate(ctx, db, sqlite.Migrations{
	Table:    "core_goose_db_version",
	FS:       migrations,
	LockWait: cfg.MigrateLockWait,
	LockPoll: cfg.MigrateLockPoll,
})
```

`Migrate` takes a lock file beside the database, `<file>.migrate.lock`,
and waits up to `LockWait` for another run. Never delete that file.
Each SQL file runs in one transaction, and a file marked
`-- +goose NO TRANSACTION` is refused. Go migrations come only from
`Migrations.Go`. Run the owners one after another, never one inside
another.

## Rebuilding a table

SQLite changes most column rules only by rebuilding the table. Call
`Rebuild` from a goose Go migration registered with
`GoFunc{RunDB: ...}`. Its `done` check reports whether the new shape is
already in place, so a rerun after a crash skips the steps. The steps
get the transaction and must not commit it. `Rebuild` waits up to
`BusyTimeout` for the write lock, even after its context ends.

## Snapshots

```go
snap, err := sqlite.NewSnapshotter(db).Snapshot(ctx, "/srv/backup/site.db")
```

The target folder must exist. A snapshot locks the folder through a
`.dbkit-snapshot.lock` file it keeps there, so a second snapshot into
the same folder fails at once with `sqlite.ErrSnapshotRunning` and
leaves the first one's copy alone. Try it again later.

Every snapshot into one folder must run as the owner of the database
file, or as root. Give each service its own snapshot folder. The lock
file is private to its owner, and when a run as root creates it, the
lock file gets the owner of the database file.

A snapshot as root refuses a folder that any other user can change, and
checks every folder above it too. Point a root job at a folder only
root can write, such as one owned by root with mode 0700.

A snapshot writes its copy as `<target>.dbkit-snapshot.partial` and
moves it to the target once it is checked. Before it starts, it
removes the files with that ending, and their `-journal` files, that
an interrupted snapshot left in the folder. It never touches any other
file there.

A busy checkpoint after the copy shows in `snap.Checkpoint.Busy`. When
the context ends during the checkpoint, `Snapshot` returns an error
that matches the context error. In both cases the copy is in place and
`snap.Path` is set. So check `snap.Path` before you treat an error as
a lost copy.

To restore a snapshot:

1. Stop the app.
2. Delete the `-wal` and `-shm` files beside the database.
3. Copy the snapshot over the database file.
4. Start the app.

## Testing

`sqlitetest.NewTemplate` migrates one file once per test binary, and
`Template.Open` copies it into each test's own folder.
`Template.OpenWithFaults` and `sqlitetest.OpenWithFaults` fail a chosen
statement or the next commit. Call `sqlitetest.CheckLibc` in one test,
so a build that links another `modernc.org/libc` fails.

## Upgrading from 0.3.0

- A wait for a lock while you read a later row of a query, close its
  rows or commit now ends with the context of the query or of
  `BeginTx`. Its error, and so an `InTx` error from its commit, matches
  only the context error, no longer `dbkit.ErrBusy`. Check the context
  error with `errors.Is`.
- A share's `Commit` that waits for a lock now stops at the transaction
  timeout, or when the context you gave `Begin` ends. Its error matches
  the context error, no longer `dbkit.ErrBusy`.
- `modernc.org/sqlite` moves to v1.61.1. `modernc.org/libc` stays at
  v1.79.0.

## Upgrading from 0.2.0

- Move `modernc.org/libc` to v1.79.0 in your `go.mod`, or
  `sqlitetest.CheckLibc` fails. `go mod tidy` does it.
- A `BeginTx` error after its context ends, and so an `InTx` error from
  its begin, no longer matches `dbkit.ErrBusy`. Check the context error
  with `errors.Is`.
- A write behind another writer no longer tries the lock again every
  `BusyPoll`. It follows SQLite's own schedule, up to every 100ms.
  Change any test or doc that says otherwise.
- `sql.Conn.Raw` hands out the driver's own connection again. The
  driver takes the connection's progress handler on each call whose
  context can end, so do not set one.
- The module needs Go 1.27.3.

## Upgrading from 0.1.0

- Set `BusyPoll` from a setting of your own in every `sqlite.Options`,
  including the ones in your tests. `Open` refuses one without it.
- Remove any `PRAGMA busy_timeout` your code sets.
- The module needs Go 1.27.2 and `dbkit` 0.3.0.
