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
	CacheSize:   cfg.CacheSizeKiB,
	MaxConns:    cfg.MaxConns,
	Synchronous: sqlite.SynchronousFull,
	Functions:   functions,
	BaseFolder:  cfg.DataFolder,
})
```

`Open` connects to nothing. The first query opens the first
connection. Every connection writes ahead to a log, enforces foreign
keys, waits `BusyTimeout` for a lock, starts each write transaction
with `BEGIN IMMEDIATE`, and refuses edits of the schema table.

Every number is required. Each connection keeps its own page cache, so
`MaxConns` times `CacheSize` is what the caches may take.

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
get the transaction and must not commit it.

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

A busy checkpoint after the copy shows in `snap.Checkpoint.Busy` and
never fails a good copy.

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
