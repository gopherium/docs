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

Every fresh deployment faces the same chicken-and-egg: user creation
sits behind a login. `CreateAdmin` is the answer, built for a
subcommand of your binary:

```go
err := authkit.CreateAdmin(ctx, store, email, name, os.Stdin, os.Stdout)
```

It prompts for the password on stdin, validates through
`gouncer.NewUser`, and stores the account. Because it is the app
binary itself, it works with `docker compose exec` in a distroless
image, with no shell and no extra tooling. The
[operations contract](/deployment/operations/#bootstrap-the-first-admin-through-the-binary)
shows the deployment shape.
