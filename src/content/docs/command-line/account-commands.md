---
title: Account commands
description: Six ready-made commands that create, list, change and disable the accounts of your program.
---

[`gonsole/auth`](https://pkg.go.dev/github.com/gopherium/framework/gonsole/auth)
gives your program six account commands over the accounts that the
[`authkit/postgres` store](/authentication/persistence/) keeps. With
them you create the first admin of a fresh database, and change a
role or disable an account from a shell. Add both modules, since
`gonsole/auth` alone would bring in an older `gonsole`:

```sh
go get github.com/gopherium/framework/gonsole@v0.2.0
go get github.com/gopherium/framework/gonsole/auth@v0.1.0
```

The package is named `auth`, like the authkit value in the
[Quickstart](/start/quickstart/). Import it as `accounts` to keep
the two apart:

```go
import accounts "github.com/gopherium/framework/gonsole/auth"

func roles(context.Context, gonsole.Call) (accounts.Roles, error) {
	return accounts.Roles{Known: []string{"admin", "editor"}, Privileged: []string{"admin"}}, nil
}

func program(getenv func(string) string) gonsole.Program {
	return gonsole.Program{
		Name:       "myapp",
		Version:    "1.4.0",
		Env:        gonsole.Env{Prefix: "MYAPP_", Getenv: getenv},
		Database:   "DATABASE_URL",
		Serve:      serve,
		Migrations: []gonsole.Step{accounts.Migration(), {Name: "reports", Run: migrateReports}},
		Commands: append(
			[]gonsole.Command{createReport(), listReports},
			accounts.Commands(accounts.Config{Roles: roles})...,
		),
	}
}
```

`Migration` creates the `auth` schema, the tables the accounts live
in. It goes before your own
[schema steps](/command-line/writing-commands/#schema-steps).

`Roles` is required. Without it, every command but `account:list`
panics. It is a function that returns two lists. `Known` holds every
role an account may hold. `Privileged` holds the roles that at least
one enabled account must always keep. The commands call it on each
run, so it can include the roles your plugins add.

## The six commands

| Command | What it does | Writes |
| --- | --- | --- |
| `account:create-admin` | creates an account under a role | at once |
| `account:grant-role -role <role>` | gives the role to every account holding none | dry run until `-yes` |
| `account:list` | lists every account and its role, offers `-json` | never |
| `account:role <email> <role>` | sets one account's role | dry run until `-yes` |
| `account:disable <email>` | disables one account and deletes its sessions | dry run until `-yes` |
| `account:enable <email>` | enables one disabled account | dry run until `-yes` |

A [dry run](/command-line/writing-commands/#writes-and-dry-runs)
misses one error. A change that would leave no enabled account under
a privileged role passes the dry run. With `-yes` it fails with
`<email> is the last enabled privileged account`.

`account:create-admin` is the command for an empty database. It
runs your `Migrations` itself and needs neither `-yes` nor `-as`.
It prints a `Password:` prompt, reads the password as one line on
stdin, then prints `created user <email>`. The password needs at least 12
characters. A terminal shows the password as you type it, so pipe
it in:

```sh
printf '%s\n' "$PASSWORD" | myapp account:create-admin \
  -email maria.perez@example.com -name "Maria Perez" -role admin
```

`account:grant-role -yes` also runs your `Migrations` before it
writes. The other commands expect them to have run, so on a new
database run `myapp migrate` first.

For demo data, call `accounts.EnsureAccounts` from your
`Program.Seed`. It takes a store, such as
`authkitpg.NewUserStore(pool)` over a pool opened on
`call.DatabaseURL()`, the accounts, and a writer for its `created`
and `kept` lines. It creates the missing accounts and keeps the
rest. A kept account that holds no role gets the one you list.

Programs without gonsole use `RunCreateAdmin` and `RunGrantRole`
from `authkit/postgres`, as
[User administration](/authentication/user-administration/) shows.

## An acting account

Set `Capability` in `accounts.Config` to a permission, such as
`manage_users`. The four commands that change existing accounts then
want `-as <email>`, and your program needs
[`Authorize` and `Record`](/command-line/writing-commands/#an-acting-account).
Leave either one out and every run fails, even `version`. Two
details matter in `Record`:

- `Call.Args` is nil for `account:grant-role`, which takes no
  arguments. A driver such as pgx stores a nil list as NULL. Store
  `append([]string{}, call.Args...)` instead.
- The commands trim and lower-case the address before they act, but
  `Call.Args` keeps it as typed. `Record` sees `Editor@Example.com`
  where the command changed `editor@example.com`.
