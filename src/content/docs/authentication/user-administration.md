---
title: User administration
description: Listing, creating, ranking and disabling accounts, sweeping expired sessions, and bootstrapping the first admin.
---

Administration is the part of authentication most apps re-type worst:
account lists that leak hashes, disable flows that leave stolen
sessions alive, bootstrap scripts that bypass validation. authkit
ships it once. This page covers the admin routes, the rank every
account holds, the guard that keeps the last administrator standing,
and the three ways to create the first account.

## The admin surface

```go
admin := authkit.NewAdmin(authkit.AdminConfig{
	Store:      store,
	Privileged: gouncer.Ranks{"admin"},
})

mux.Handle("GET /api/users", auth.RequireSession(http.HandlerFunc(admin.List)))
mux.Handle("POST /api/users", auth.RequireSession(http.HandlerFunc(admin.Create)))
mux.Handle("PATCH /api/users/{id}", auth.RequireSession(http.HandlerFunc(admin.SetDisabled)))
mux.Handle("PUT /api/users/{id}/rank", auth.RequireSession(http.HandlerFunc(admin.SetRank)))
```

`NewAdmin` takes an `AdminConfig`. `Store` is an `authkit.AdminStore`,
which is `gouncer.Store` plus `ListUsers`, `SetUserDisabledUnderCover`
and `SetUserRank`.
[`authkit/postgres`](/authentication/persistence/) implements it.
`Privileged` names the ranks allowed to administer accounts. Every
admin route refuses any other rank with the code `rank_insufficient`.
Leave `Privileged` empty and every signed-in account is admitted, which
is how an application behaves before it adopts ranks.

The handlers read the target id from `r.PathValue("id")`, so they work
on the standard mux and on routers that populate path values.

Four behaviors worth knowing:

- Listings never carry password material. The Postgres store never
  even reads the hash column for a listing.
- Disabling an account deletes every session that account holds, in
  the same transaction as the flag. Re-enabling later cannot resurrect
  a stolen session.
- A signed-in admin cannot disable their own account or change their
  own rank. Both guards run against the request's `Identity`.
- The last enabled account holding a privileged rank can be neither
  disabled nor demoted. The store checks this under a row lock, so two
  admins trying to remove each other at the same moment cannot both
  succeed.

## Ranks

Every account holds a rank, stored as plain text. authkit does not
know what the names mean. Your application picks them, decides which
of them count as privileged, and decides what each one may do. A rank
the application does not recognise should get the least authority,
never the most, so an account created outside the app cannot gain the
keys by accident.

`gouncer.Ranks` is a set of rank names the application treats alike.
Its `Holds` method answers whether a rank is in the set, and an empty
rank is never in any set:

```go
privileged := gouncer.Ranks{"admin"}
privileged.Holds("admin")  // true
privileged.Holds("editor") // false
privileged.Holds("")       // false, an unranked account is never privileged
```

A new account starts under the rank the create request names, and
`PUT /api/users/{id}/rank` changes it. Both take the rank as plain
text in a `rank` field. The rank reaches the browser on every listed
account and on the session, so a screen can hide what the signed-in
account cannot do. Hiding is a convenience for the reader. The refusal
below is the enforcement.

The admin routes answer these refusal codes. Each comes with a message
in English, and the code is the part a client should match on:

| Code | Status | When |
| --- | --- | --- |
| `rank_insufficient` | 403 | The actor holds no privileged rank |
| `self_disable_refused` | 422 | An account disabling itself |
| `self_rank_refused` | 422 | An account changing its own rank |
| `last_privileged_refused` | 422 | A change that would leave no enabled privileged account |

## The seams under the admin handlers

Like the session handlers, each admin handler is a thin wrapper
around a plain method you can also call directly, with no HTTP
request involved:

| Seam | Answers |
| --- | --- |
| `admin.ListAccounts(ctx)` | Every `Account`, ordered for display |
| `admin.CreateAccount(ctx, email, name, password, rank)` | The created `Account` |
| `admin.SetAccountDisabled(ctx, actorID, id, disabled)` | An error, or nil |
| `admin.SetAccountRank(ctx, actorID, id, rank)` | An error, or nil |

`Account` is the administrative view of a user: `ID`, `Email`,
`Name`, `Disabled`, `Rank` and `CreatedAt`. It carries no password
field at all, so a listing cannot leak a hash.

`SetAccountDisabled` and `SetAccountRank` take two ids: `actorID` is
whoever is making the change, and `id` is the account being changed.
When they match the seams return `ErrSelfDisable` and `ErrSelfRank`,
so nobody can lock themselves out or promote themselves. Because the
actor is an argument, calling a seam directly still enforces the
guard:

```go
err := admin.SetAccountRank(ctx, identity.ID, targetID, "editor")
switch {
case errors.Is(err, authkit.ErrSelfRank):
	return conflict()
case errors.Is(err, gouncer.ErrLastPrivileged):
	return conflict()
}
```

`gouncer.ErrLastPrivileged` is the store refusing to remove the last
cover. The HTTP handlers translate it to `last_privileged_refused`.

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
users. Three entry points, layered by convenience. All three take the
rank the account starts under, and all three refuse an empty one, so
a fresh installation never holds an account nobody can administer
with.

`authkit.CreateAdmin` is the primitive. It prompts for a password on
stdin, validates, and stores against any `gouncer.Store`:

```go
err := authkit.CreateAdmin(ctx, store, email, name, "admin", os.Stdin, os.Stdout)
```

With `authkit/postgres`, `RunCreateAdmin` is the whole subcommand:
the `-email`, `-name` and `-rank` flags, the pool, the auth-schema
migration, then `CreateAdmin`:

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
created, err := authkit.EnsureAdmin(ctx, store, email, name, password, "admin")
```

## Giving a rank to accounts that hold none

An installation that existed before it adopted ranks has accounts with
an empty rank. Once the admin routes name a privileged set, those
accounts can no longer administer anything, including themselves.
`RunGrantRank` is the subcommand that brings them across. It gives the
named rank to every account holding none, leaves every ranked account
alone, and reports how many it changed:

```go
err := authkitpg.RunGrantRank(ctx, databaseURL, os.Args[2:], os.Stdout)
```

Run as `myapp grantrank -rank admin`, it is safe to run twice. The
second run finds no unranked account and grants nothing. Behind it
sits `UserStore.GrantRankToRankless(ctx, rank)`, which returns the
count and refuses an empty rank.

This is deliberately a command an operator runs, not a migration that
runs itself. A migration would fire again on every fresh deploy, and
an account an administrator had demoted on purpose would find itself
promoted back.
