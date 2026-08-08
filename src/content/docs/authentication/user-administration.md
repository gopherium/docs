---
title: User administration
description: Listing, creating, and disabling accounts, sweeping expired sessions, and bootstrapping the first admin.
---

Administration is the part of authentication most apps re-type worst:
account lists that leak hashes, disable flows that leave stolen
sessions alive, bootstrap scripts that bypass validation. authkit
ships it once.

## The admin surface

```go
admin := authkit.NewAdmin(store)

mux.Handle("GET /api/users", auth.RequireSession(http.HandlerFunc(admin.List)))
mux.Handle("POST /api/users", auth.RequireSession(http.HandlerFunc(admin.Create)))
mux.Handle("PATCH /api/users/{id}", auth.RequireSession(http.HandlerFunc(admin.SetDisabled)))
```

`NewAdmin` takes an `authkit.AdminStore`, which is `gouncer.Store`
plus `ListUsers` and `SetUserDisabled`.
[`authkit/postgres`](/authentication/persistence/) implements it. The
handlers read the target id from `r.PathValue("id")`, so they work on
the standard mux and on routers that populate path values.

Three behaviors worth knowing:

- Listings never carry password material. The Postgres store never
  even reads the hash column for a listing.
- Disabling an account deletes every session that account holds, in
  the same transaction as the flag. Re-enabling later cannot resurrect
  a stolen session.
- A signed-in admin cannot disable their own account. The guard runs
  against the request's `Identity`.

## The seams under the admin handlers

Like the session handlers, each admin handler is a thin wrapper
around a plain method you can also call directly, with no HTTP
request involved:

| Seam | Answers |
| --- | --- |
| `admin.ListAccounts(ctx)` | Every `Account`, ordered for display |
| `admin.CreateAccount(ctx, email, name, password)` | The created `Account` |
| `admin.SetAccountDisabled(ctx, actorID, id, disabled)` | An error, or nil |

`Account` is the administrative view of a user: `ID`, `Email`,
`Name`, `Disabled`, and `CreatedAt`. It carries no password field at
all, so a listing cannot leak a hash.

`SetAccountDisabled` takes two ids: `actorID` is whoever is doing
the disabling, and `id` is the account being disabled. When they
match it returns `ErrSelfDisable`, so nobody can lock themselves
out. Because the actor is an argument, calling the seam directly
still enforces that guard:

```go
err := admin.SetAccountDisabled(ctx, identity.ID, targetID, true)
if errors.Is(err, authkit.ErrSelfDisable) {
	return conflict()
}
```

## Sweeping expired sessions

Expired sessions miss on lookup either way, but the rows need
collecting. The reaper sweeps on an interval until stopped:

```go
reaper := authkit.NewReaper(store, authkit.ReaperConfig{})
reaper.Start()
defer reaper.Stop()
```

`Stop` cancels the loop and waits for an in-flight sweep to drain, so
call it before closing your database pool. Interval, per-sweep
timeout, and the logger are `ReaperConfig` fields with defaults.

## Bootstrapping the first admin

User creation sits behind a login, and a fresh database has no
users. Three entry points, layered by convenience.

`authkit.CreateAdmin` is the primitive. It prompts for a password on
stdin, validates, and stores against any `gouncer.Store`:

```go
err := authkit.CreateAdmin(ctx, store, email, name, os.Stdin, os.Stdout)
```

With `authkit/postgres`, `RunCreateAdmin` is the whole subcommand:
the `-email` and `-name` flags, the pool, the auth-schema migration,
then `CreateAdmin`:

```go
err := authkitpg.RunCreateAdmin(ctx, databaseURL, os.Args[2:], os.Stdin, os.Stdout)
```

As the app binary itself, it works with `docker compose exec` in a
distroless image. The
[operations contract](/deployment/operations/#3-create-the-first-admin-with-the-binary)
shows the deployment shape.

`EnsureAdmin` is for seeders: the password is an argument, an
existing email is a no-op, and the returned bool reports whether the
account was created. Running it twice is safe:

```go
created, err := authkit.EnsureAdmin(ctx, store, email, name, password)
```
