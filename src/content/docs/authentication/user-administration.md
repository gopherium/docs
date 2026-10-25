---
title: User administration
description: Listing, creating, promoting and disabling accounts, telling a screen which accounts it may edit, sweeping expired sessions, and bootstrapping the first admin.
---

Administration is the part of authentication most apps re-type worst:
account lists that leak hashes, disable flows that leave stolen
sessions alive, bootstrap scripts that bypass validation. authkit
ships it once. This page covers the admin routes, the role every
account holds, the guard that keeps the last administrator standing,
and the ways to create the first account.

## The admin surface

```go
admin := authkit.NewAdmin(authkit.AdminConfig{
	Store:      store,
	Privileged: gouncer.Roles{"admin"},
	Roles:      registry,
	Avatars:    &avatar.Options{Mode: avatar.ModeInitials},
	AvatarSize: 96,
})

mux.Handle("GET /api/users", auth.RequireSession(http.HandlerFunc(admin.List)))
mux.Handle("POST /api/users", auth.RequireSession(http.HandlerFunc(admin.Create)))
mux.Handle("PATCH /api/users/{id}", auth.RequireSession(http.HandlerFunc(admin.SetDisabled)))
mux.Handle("PUT /api/users/{id}/role", auth.RequireSession(http.HandlerFunc(admin.SetRole)))
```

`NewAdmin` takes an `AdminConfig`. `Store` is an `authkit.AdminStore`,
which is `gouncer.Store` plus `ListUsers`, `SetUserDisabledUnderCover`,
`SetUserRole`, and their checked twins `SetUserDisabledFrom` and
`SetUserRoleFrom`.
[`authkit/postgres`](/authentication/persistence/) implements it.
`Privileged` names the roles allowed to administer accounts. Every
admin route refuses any other role with the code `role_insufficient`.
Leave `Privileged` empty and every signed-in account is admitted, which
is how an application behaves before it adopts roles. `Roles` is
optional, a role registry that checks every role the routes write, as
[Checking roles against a registry](#checking-roles-against-a-registry)
explains. `Avatars` and `AvatarSize` are optional too, and give each
listed account its picture, as
[Avatars on listed accounts](#avatars-on-listed-accounts) explains.

The handlers read the target id from `r.PathValue("id")`, so they work
on the standard mux and on routers that populate path values.

Four behaviors worth knowing:

- Listings never carry password material. The Postgres store never
  even reads the hash column for a listing.
- Disabling an account deletes every session that account holds, in
  the same transaction as the flag. Re-enabling later cannot resurrect
  a stolen session.
- A signed-in admin cannot disable their own account or change their
  own role. Both guards run against the request's `Identity`.
- The last enabled account holding a privileged role can be neither
  disabled nor demoted. The store checks this under a row lock, so two
  admins trying to remove each other at the same moment cannot both
  succeed.

## Roles

Every account holds a role, stored as plain text. On its own, authkit
does not know what the names mean. Your application picks them, decides which
of them count as privileged, and decides what each one may do. A role
the application does not recognise should get the least authority,
never the most, so an account created outside the app cannot gain the
keys by accident.

`gouncer.Roles` is a set of role names the application treats alike.
Its `Holds` method answers whether a role is in the set, and an empty
role is never in any set:

```go
privileged := gouncer.Roles{"admin"}
privileged.Holds("admin")  // true
privileged.Holds("editor") // false
privileged.Holds("")       // false, an account with no role is never privileged
```

A new account starts under the role the create request names, and
`PUT /api/users/{id}/role` changes it. Both take the role as plain
text in a `role` field. The role reaches the browser on every listed
account and on the session, and each listed account also says whether
the signed-in account may edit it, so a screen can hide what the
signed-in account cannot do. Hiding is a convenience for the reader.
Refusing the write below is the enforcement.

The admin routes answer these error codes. Each comes with a message
in English, and the code is the part a client should match on:

| Code | Status | When |
| --- | --- | --- |
| `role_insufficient` | 403 | The actor holds no privileged role |
| `role_unknown` | 422 | No role source declares the role, `meta.field` is `role` |
| `user_not_editable` | 403 | The account's current role carries a capability the actor's role lacks |
| `role_not_grantable` | 403 | The role handed out carries a capability the actor's role lacks, or the account to enable holds no role or an undeclared one |
| `role_changed` | 409 | The account's role changed before the write landed |
| `self_disable_refused` | 422 | An account disabling itself |
| `self_role_refused` | 422 | An account changing its own role |
| `last_privileged_refused` | 422 | A change that would leave no enabled privileged account |

The two codes follow WordPress's REST API, which splits
`rest_cannot_edit` from `rest_user_invalid_role` the same way. Their
messages are WordPress's own sentences: "Sorry, you are not allowed to
edit this user." and "Sorry, you are not allowed to give users that
role."

## Checking roles against a registry

A role registry such as goncierge knows which roles exist and what
each may do. [Roles and capabilities](/authorization/overview/)
explains it. Pass one as `AdminConfig.Roles` and the routes check
every role they write:

- A role the registry does not know gets a 422 with the code
  `role_unknown`. So does an empty role, because `EnsureAdmin` and
  `account:grant-role` give a role to accounts holding none.
- An actor may change or disable an account holding a declared role
  only when its own role outranks that role, meaning it carries every
  capability that role carries. Any other such account gets a 403 with
  the code `user_not_editable`, whatever the write.
- An actor may hand out only a role its own role outranks. Any other
  declared role gets a 403 with the code `role_not_grantable`.
- An account that holds no role, or one no source declares any more,
  such as one from a removed plugin, can still be given a new role or
  disabled. Enabling it gets a 403 with the code `role_not_grantable`
  until it holds a declared role.
- The write lands only if the account still holds the role that was
  checked. If another admin changed it in between, the write gets a
  409 with the code `role_changed`. Reload the account and try again.

Give your administrator role every capability your plugins add.
Otherwise it cannot hand out their roles.

## Which accounts the reader may edit

Every listed account carries `editable`. It is true when the reader may
change or disable that account, by the same rule the writes use: the
account holds no role or one no source declares, or the reader's role
carries every capability of the account's role. Without a role
registry every account is editable.

```json
{
  "id": "01920c3e-7a4b-7c1d-9f2e-3b5a6c7d8e9f",
  "email": "maria.perez@example.com",
  "name": "Maria Perez",
  "disabled": false,
  "confirmed": true,
  "role": "editor",
  "created_at": "2026-10-25T09:00:00Z",
  "editable": true,
  "avatar": "data:image/svg+xml;base64,PHN2Zy..."
}
```

The reader's own account is editable too, since a role carries every
capability of itself. The self guards still refuse a change to your own
role and a disable of your own account, so a screen also compares the
account's `id` with the session's.

An account created through `POST /api/users` comes back with
`editable` and `avatar` as well, so a screen can add it to its list
without reading the list again.

## Avatars on listed accounts

Set `AdminConfig.Avatars` and every listed account carries `avatar`,
the address the [`avatar`](/authentication/avatars/) package builds
from the account's name and email. The options are the ones your
application reads from its own settings. `AvatarSize` is the size in
pixels, 96 when you leave it at zero. Draw at twice the size a screen
shows, so the picture stays sharp on dense screens.

Leave `Avatars` nil, or set its mode to `off`, and no account carries
an `avatar` field at all. A screen can then draw a letter from the
name, or nothing.

`NewAdmin` copies the options, so changing your own value afterwards
changes nothing. Build a new `AdminHandlers` to change them.

## The seams under the admin handlers

Like the session handlers, each admin handler is a thin wrapper
around a plain method you can also call directly, with no HTTP
request involved:

| Seam | Answers |
| --- | --- |
| `admin.ListAccounts(ctx)` | Every `Account`, ordered for display, with `Editable` judged for the reader in `ctx` |
| `admin.CreateAccount(ctx, email, name, password, role)` | The created `Account`, judged the same way |
| `admin.SetAccountDisabled(ctx, actorID, id, disabled)` | An error, or nil |
| `admin.SetAccountRole(ctx, actorID, id, role)` | An error, or nil |
| `admin.SetAccountDisabledFrom(ctx, actorID, id, held, disabled)` | An error, or nil |
| `admin.SetAccountRoleFrom(ctx, actorID, id, held, role)` | An error, or nil |

`Account` is the administrative view of a user: `ID`, `Email`,
`Name`, `Disabled`, `Confirmed`, `Role`, `CreatedAt`, `Editable` and
`Avatar`. It carries no password field at all, so a listing cannot
leak a hash. `Confirmed` is false for an invited account until the
person activates it, which is how a screen tells a pending invitation
from an active account.

`ListAccounts` and `CreateAccount` read the reader from the
`Identity` in the context, which `RequireSession` puts there. Outside
a request, put one there yourself with `authkit.WithIdentity`. With
none, the reader holds no role. With a role registry, only accounts
whose role carries no capability, or that hold no declared role, are
then editable.

`SetAccountDisabled`, `SetAccountRole` and their `From` twins take
two ids: `actorID` is whoever is making the change, and `id` is the
account being changed.
When they match the seams return `ErrSelfDisable` and `ErrSelfRole`,
so nobody can lock themselves out or promote themselves. Because the
actor is an argument, calling a seam directly still enforces the
guard:

```go
err := admin.SetAccountRole(ctx, identity.ID, targetID, "editor")
switch {
case errors.Is(err, authkit.ErrSelfRole):
	return conflict()
case errors.Is(err, gouncer.ErrLastPrivileged):
	return conflict()
}
```

`gouncer.ErrLastPrivileged` is the store refusing to remove the last
cover. The HTTP handlers translate it to `last_privileged_refused`.

With a role registry, `CreateAccount`, `SetAccountRole` and
`SetAccountRoleFrom` also refuse an unknown or empty role with
`authkit.ErrUnknownRole`. They take no acting role, so they never
check whether an actor may edit the account or give the role. A caller
acting for an account asks the registry's `Outranks` first.

The two seams ending in `From` are the ones the routes call. Call
them too from your own code that changes accounts outside HTTP.
They take one more argument, `held`, the role the account held when
you checked it. With a role registry they refuse in two cases:

- The account no longer holds `held`. They return
  `authkit.ErrRoleChanged`.
- `SetAccountDisabledFrom` would enable an account whose `held` role
  is empty or one the registry does not declare. It returns
  `authkit.ErrRoleNotGrantable`.

Like the other seams, they never check whether an actor may edit the
account or give the role. For an acting account,
ask the registry's `Outranks` about `held` first, and for
`SetAccountRoleFrom` about the new role too. Without a role registry
they work like `SetAccountDisabled` and `SetAccountRole`.

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
users. A program whose command line runs on
[`gonsole`](/command-line/overview/) gets a ready command from the
[account commands](/command-line/account-commands/):

```sh
printf '%s\n' "$PASSWORD" | myapp account:create-admin \
  -email maria.perez@example.com -name "Maria Perez" -role admin
```

Without gonsole there are three entry points, layered by
convenience. All three take the role the account starts under, and
all three refuse an empty one, so a fresh installation never holds
an account nobody can administer with.

`authkit.CreateAdmin` is the primitive. It prompts for a password on
stdin, validates, and stores against any `gouncer.Store`:

```go
err := authkit.CreateAdmin(ctx, store, email, name, "admin", os.Stdin, os.Stdout)
```

With `authkit/postgres`, `RunCreateAdmin` is the whole command:
the `-email`, `-name` and `-role` flags, the pool, the auth-schema
migration, then `CreateAdmin`:

```go
err := authkitpg.RunCreateAdmin(ctx, databaseURL, os.Args[2:], os.Stdin, os.Stdout)
```

As the app binary itself, it works with `docker compose exec` in a
distroless image. The
[operations contract](/deployment/operations/#3-create-the-first-admin-with-the-binary)
shows the deployment shape.

`EnsureAdmin` is for seeders: the password is an argument, an
existing email keeps its password and its role, and the returned bool
reports whether the account was created. One repair rides along: an
existing account holding no role is stamped with the asked one, so a
seed run brings a pre-roles installation's account across. Running it
twice is safe:

```go
created, err := authkit.EnsureAdmin(ctx, store, email, name, password, "admin")
```

An owner with no shell can run none of these. They read a one-time
setup code from a file and create the account in the browser, as
[The first account](/authentication/first-account/) explains.

## Giving a role to accounts that hold none

An installation that existed before it adopted roles has accounts with
an empty role. Once the admin routes name a privileged set, those
accounts can no longer administer anything, including themselves.
The `account:grant-role` command brings them across. It gives the
named role to every account holding none, leaves every account that
already holds one alone, and reports how many it changed:

```sh
myapp account:grant-role -role admin -yes
```

Without `-yes` it only reports how many it would change. If your
account commands set a `Capability`, it also wants `-as <email>`, and
[`Authorize`](/command-line/account-commands/#an-acting-account)
checks that account first, even on a dry run. It refuses an account
without a role. Then create an admin with `account:create-admin` and
act as it. The command also refuses to give a role that carries a
permission the acting account's role lacks.

A program without gonsole calls `RunGrantRole` from its own command
instead:

```go
err := authkitpg.RunGrantRole(ctx, databaseURL, os.Args[2:], os.Stdout)
```

Both are safe to run twice. The second run finds no account without
a role and grants nothing. Behind both sits
`UserStore.GrantRoleToRoleless(ctx, role)`, which returns the count
and refuses an empty role.

This is deliberately a command an operator runs, not a migration that
runs itself. A migration would fire again on every fresh deploy, and
an account an administrator had demoted on purpose would find itself
promoted back.
