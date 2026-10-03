---
title: Account commands
description: Seven ready-made commands that create, list, change and disable the accounts of your program, and show who changed what.
---

[`gonsole/auth`](https://pkg.go.dev/github.com/gopherium/framework/gonsole/auth)
gives your program seven account commands over the accounts that the
[`authkit/postgres` store](/authentication/persistence/) keeps. With
them you create the first admin of a fresh database, and change a
role or disable an account from a shell. Add both modules, since
`gonsole/auth` alone would bring in an older `gonsole`:

```sh
go get github.com/gopherium/framework/gonsole@v0.4.0
go get github.com/gopherium/framework/gonsole/auth@v0.3.0
```

The package is named `auth`, like the authkit value in the
[Quickstart](/start/quickstart/). Import it as `accounts` to keep
the two apart:

```go
import accounts "github.com/gopherium/framework/gonsole/auth"

func roles(context.Context, gonsole.Call) (accounts.Roles, error) {
	return accounts.Roles{
		Known:      []string{"admin", "editor"},
		Privileged: []string{"admin"},
		Capabilities: map[string][]string{
			"admin":  {"manage_users", "manage_reports"},
			"editor": {"manage_reports"},
		},
	}, nil
}

func program(getenv func(string) string) gonsole.Program {
	cfg := accounts.Config{
		Roles:         roles,
		Capability:    "manage_users",
		RecordTimeout: 5 * time.Second,
		RecordsLimit:  50,
	}
	return gonsole.Program{
		Name:     "myapp",
		Version:  "1.4.0",
		Env:      gonsole.Env{Prefix: "MYAPP_", Getenv: getenv},
		Database: "DATABASE_URL",
		Serve:    serve,
		Migrations: []gonsole.Step{
			accounts.Migration(),
			accounts.RecordMigration(),
			{Name: "reports", Run: migrateReports},
		},
		Commands: append(
			[]gonsole.Command{createReport(), listReports, accounts.Records(cfg)},
			accounts.Commands(cfg)...,
		),
		Authorize: accounts.Authorize(cfg),
		Record:    accounts.Record(cfg),
	}
}
```

`Migration` creates the `auth` schema, the tables the accounts live
in. `RecordMigration` creates the `gonsole` schema, which holds the
records of who changed what and its own list of applied migrations.
Both go before your own
[schema steps](/command-line/writing-commands/#schema-steps).

`RecordMigration` runs on goose, a migration tool, and takes goose's
lock first. So two `migrate` runs never apply it at once. Leave
`Program.Lock` unset, since one that takes the same lock would block
this step.

`Roles` is required. Without it, every command but `account:list`
and `account:records` panics. It is a function that returns two lists
and a map. `Known` holds every role an account may hold. `Privileged`
holds the roles that at least one enabled account must always keep.
`Capabilities` maps each role to the permissions it carries. A role
left out carries none. The commands call it on each run, so it can
include the roles your plugins add.

`Commands` returns six of the commands below. `Records` returns the
seventh, `account:records`.

## The seven commands

| Command | What it does | Writes |
| --- | --- | --- |
| `account:create-admin` | creates an account under a role | at once |
| `account:grant-role -role <role>` | gives the role to every account holding none | dry run until `-yes` |
| `account:list` | lists every account and its role, offers `-json` | never |
| `account:role <email> <role>` | sets one account's role | dry run until `-yes` |
| `account:disable <email>` | disables one account and deletes its sessions | dry run until `-yes` |
| `account:enable <email>` | enables one disabled account | dry run until `-yes` |
| `account:records` | lists who changed what, newest first, offers `-json` | never |

A [dry run](/command-line/writing-commands/#writes-and-dry-runs)
misses one error. A change that would leave no enabled account under
a privileged role passes the dry run. With `-yes` it fails with
`<email> is the last enabled privileged account`.

`account:create-admin` is the command for an empty database. It
runs your `Migrations` itself and needs neither `-yes` nor `-as`.
It prints a `Password:` prompt, reads the password as one line on
stdin, then prints `created user <email>`. The password needs at
least 12 characters. A terminal shows the password as you type it,
so pipe it in:

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
Leave either one out and every run fails, even `version`. The module
ships both.

`accounts.Authorize` checks the acting account before the command
runs, dry runs included. A blank `-as` exits 2. It refuses these
with exit 1:

- an address no account holds
- an account that is disabled or was never activated
- an account without a role, or whose role lacks the permission
- a database without the records table, with an error that says to
  run `migrate` first

It checks your own commands too. So list their permissions in
`Capabilities` as well, such as `manage_reports`.

The four commands also refuse three changes. Each refusal exits 1,
on dry runs too, and is not recorded:

- giving a role, or changing an account under a role, when that role
  carries a permission the acting account's role lacks
- the acting account disabling itself
- the acting account changing its own role

Say you add a `support` role that carries only `manage_users`. An
account under `support` cannot give `editor` or `admin`, or change
an account under them, since both carry `manage_reports`:

```text
$ myapp account:role maria.perez@example.com editor -as support@example.com
myapp: the role editor carries manage_reports, which the account support@example.com lacks
```

Any acting account may give a role left out of `Capabilities`. Give
the role that manages accounts every permission the other roles
carry, as `admin` does here. Otherwise no account command can give a
role that carries a permission the managing role lacks, or change an
account under it.

The four commands look the acting account up themselves, so `-as`
must name an account even under an `Authorize` of your own.
`account:create-admin` checks none of this, so a fresh database can
always get its first admin. The
[admin HTTP handlers](/authentication/user-administration/) also
refuse disabling your own account and changing your own role.

`accounts.Record` stores one record for each applied change: the
acting address, its account id, the command, and the arguments and
flags as typed. `account:records` lists the latest records. A value
that is empty or holds a space or a quote prints in double quotes.

Two settings tune them. When one is empty, its fallback in `Config`
applies:

| Setting | Fallback | Sets |
| --- | --- | --- |
| `MYAPP_COMMAND_RECORD_TIMEOUT` | `RecordTimeout` | how long storing one record may take |
| `MYAPP_COMMAND_RECORDS_LIMIT` | `RecordsLimit` | how many records `account:records` lists |

Give both fallbacks a value above zero. A run that falls back to
zero fails. `Authorize` reads the record timeout too, so a bad one
stops the run before anything changes. `-limit` on `account:records`
sets the limit for one run. Call `cfg.Validate(call.Env)` from your
[`Program.Validate`](/command-line/overview/#settings), so
`myapp check` reads both settings.
