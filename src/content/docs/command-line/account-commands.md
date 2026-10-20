---
title: Account commands
description: Seven ready-made commands that create, list, change and disable the accounts of your program, and show who changed what.
---

[`gonsole/auth`](https://pkg.go.dev/github.com/gopherium/framework/gonsole/auth)
gives your program seven account commands. With them you create the
first admin of a fresh database, and change a role or disable an
account from a shell.

On PostgreSQL the commands run through
[`gonsole/auth/postgres`](https://pkg.go.dev/github.com/gopherium/framework/gonsole/auth/postgres).
The accounts then live in the
[`authkit/postgres` store](/authentication/persistence/). On SQLite
the commands run through `gonsole/auth/sqlite`, as
[On SQLite](#on-sqlite) shows. For PostgreSQL, add these three
modules, at versions that work together:

```sh
go get github.com/gopherium/framework/gonsole@v0.8.0
go get github.com/gopherium/framework/gonsole/auth@v0.9.0
go get github.com/gopherium/framework/gonsole/auth/postgres@v0.2.0
```

The package is named `auth`, like the authkit value in the
[Quickstart](/start/quickstart/). Import it as `accounts` to keep
the two apart. The package of `gonsole/auth/postgres` is named
`postgres`, like `authkit/postgres`. Import it as `accountpg`:

```go
import (
	accounts "github.com/gopherium/framework/gonsole/auth"
	accountpg "github.com/gopherium/framework/gonsole/auth/postgres"
)

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
		Stores:        accountpg.Stores,
	}
	return gonsole.Program{
		Name:     "myapp",
		Version:  "1.4.0",
		Env:      gonsole.Env{Prefix: "MYAPP_", Getenv: getenv},
		Database: "DATABASE_URL",
		Serve:    serve,
		Migrations: []gonsole.Step{
			accountpg.Migration(),
			accountpg.RecordMigration(),
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

`accountpg.Stores` opens a pool of database connections at the
database address. `Authorize`, the command and `Record` each get a
pool of their own, closed when they are done.

`accountpg.Migration` creates the `auth` schema, the tables the
accounts live in. `accountpg.RecordMigration` creates the `gonsole`
schema, which holds the records of who changed what and its own list
of applied migrations. Both go before your own
[schema steps](/command-line/writing-commands/#schema-steps).

A program that listed `accounts.Migration()` and
`accounts.RecordMigration()` moves to these steps as
[Upgrading from gonsole/auth 0.7.0](#upgrading-from-gonsoleauth-070)
shows.

`accountpg.RecordMigration` runs on goose, a migration tool, and takes
goose's lock first. So two `migrate` runs never apply it at once.
Leave `Program.Lock` unset, since one that takes the same lock would
block this step.

Keep pool keys such as `pool_max_conns` out of the database setting.
Only a pgx pool reads them, and neither schema step opens one. pgx
then sends each pool key to the server as a setting, and the server
refuses a setting it does not know.

`Stores` is required. Without it, every account command fails, and
so do `Authorize` and `Record`:

```text
$ myapp account:list
myapp: gonsole/auth: Config.Stores is nil, set it to the Stores of gonsole/auth/postgres or gonsole/auth/sqlite
```

`Roles` is required. Without it, every command but `account:list`
and `account:records` panics. It is a function that returns two lists
and a map. `Known` holds every role an account may hold. `Privileged`
holds the roles that at least one enabled account must always keep.
`Capabilities` maps each role to the permissions it carries. A role
left out carries none. The commands call it on each run, so it can
include the roles your plugins add.

When your plugins fill a registry of roles, such as a
[`goncierge`](/authorization/overview/) `Registry`, let
`DeclaredRoles` build this function instead of writing it by hand.
Set it as `Roles` in the `cfg` above, in place of `roles`:

```go
Roles: accounts.DeclaredRoles(registry, "manage_users"),
```

On each run it first registers your
[plugins](/command-line/plugin-commands/#loading-the-plugins), when
your program has them, so the roles they add are in the registry.
`Known` is then every role the registry holds, and `Capabilities`
holds what each of them carries. `Privileged` is every role that
carries the capability you name. `DeclaredRoles` takes any value
that answers `Roles()`, `CapabilitiesOf(role)` and
`HoldersOf(capability)`.

Every command that reads the roles fails when a
[plugin fails](/command-line/plugin-commands/#when-a-plugin-fails),
or when no role carries the capability, such as a misspelled one.
That is each account command but `account:list` and
`account:records`, and, through `Authorize`, every command that
names a capability, your own included:

```text
$ myapp account:role maria.perez@example.com editor -as admin@example.com
myapp: no role carries the capability "manage_user"
```

To name the privileged roles yourself, write the function with
`RolesFrom`. It reads the registry as it is, so call
`call.Plugins(ctx)` first when your plugins add roles. It takes the
registry and those roles:

```go
func roles(context.Context, gonsole.Call) (accounts.Roles, error) {
	return accounts.RolesFrom(registry, []string{"admin"}), nil
}
```

`Commands` returns six of the commands below. `Records` returns the
seventh, `account:records`.

## The seven commands

| Command | What it does | Writes |
| --- | --- | --- |
| `account:create-admin -email <address> -name <name> -role <role>` | creates an account under a role | at once |
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

`account:enable` refuses an account that holds no role, or a role
left out of `Known`, such as one from a removed plugin. It refuses
on dry runs too:

```text
$ myapp account:enable maria.perez@example.com -as admin@example.com
myapp: the account maria.perez@example.com holds the undeclared role reviewer, give it a declared role before enabling it
```

Give the account a role from `Known` with `account:role` first.

`account:role`, `account:disable` and `account:enable` write only
if the account still holds the role they checked. If someone
changed it in between, the run changes nothing and fails with
`the role of <email> changed after the check, run the command again`.

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

`account:create-admin` and `account:grant-role` stop at once when a
flag they need is missing:

```text
$ myapp account:grant-role -as maria.perez@example.com
myapp: account:grant-role wants -role <role>
```

`account:create-admin` needs `-email`, `-name` and `-role`, and
`account:grant-role` needs `-role`. A line that leaves one out, or
leaves it empty or spaces only, exits 2 and prints the help page. It
stops before any schema step or account check.

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

gonsole stops a missing or blank `-as` with exit 2. Otherwise
`accounts.Authorize` checks the acting account before the command
runs, dry runs included. It refuses these with exit 1:

- an address no account holds
- an account that is disabled or was never activated
- an account without a role, or whose role lacks the permission
- a database without the records table, with an error that says to
  run `migrate` first

It checks your own commands too. So list their permissions in
`Capabilities` as well, such as `manage_reports`.

The four commands also refuse three changes. A run that tries one
exits 1, on dry runs too, and leaves no record:

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

With `accountpg.Stores`, storing a record can take up to 15 seconds
past the record timeout when the database stops answering. pgx, the
PostgreSQL driver, waits that long for the connection to close.

## On SQLite

[`gonsole/auth/sqlite`](https://pkg.go.dev/github.com/gopherium/framework/gonsole/auth/sqlite)
runs the same seven commands on an SQLite file. The accounts and the
records then sit in the file that holds the rest of your data. Add it
in place of `gonsole/auth/postgres`:

```sh
go get github.com/gopherium/framework/gonsole/auth/sqlite@v0.2.0
```

Its package is named `sqlite`, like `dbkit/sqlite`. Import it as
`accountsqlite` in place of `accountpg`, to go with `accounts`.

Your program first needs an opener, as
[One database handle](/command-line/writing-commands/#one-database-handle)
shows. Then make three changes to the program above:

```go
import accountsqlite "github.com/gopherium/framework/gonsole/auth/sqlite"

lock := accountsqlite.MigrateOptions{
	LockWait: settings.MigrateLockWait,
	LockPoll: settings.MigrateLockPoll,
}
cfg := accounts.Config{
	Roles:         roles,
	Capability:    "manage_users",
	RecordTimeout: 5 * time.Second,
	RecordsLimit:  50,
	Stores:        accountsqlite.Stores,
}
```

```go
Migrations: []gonsole.Step{
	accountsqlite.Migration(lock),
	accountsqlite.RecordMigration(lock),
	{Name: "reports", RunOn: migrateReports},
},
```

- `Stores` in `accounts.Config` is set to `accountsqlite.Stores` in
  place of `accountpg.Stores`. Every command, `Authorize` and `Record`
  then run on the one handle the run opens.
- `accountsqlite.Migration` and `accountsqlite.RecordMigration` take
  the place of `accountpg.Migration()` and `accountpg.RecordMigration()`.
  Keep them first, before your own steps. Their `LockWait` and
  `LockPoll` come from your own settings, as on the
  [SQLite page](/database/sqlite/#migrations).
- Your own steps set `RunOn` in place of `Run`. So `migrateReports`
  gets the run's `*sql.DB` in place of the address, and no step opens
  a second handle.

SQLite has no schemas. The accounts go to the `auth_` tables of
[`authkit/sqlite`](/authentication/persistence/#on-sqlite). The
records go to `gonsole_records`, with their own list of applied
migrations in `gonsole_goose_db_version`.

Each step takes the migration lock file beside the database,
`<file>.migrate.lock`, for its own run. Leave `Program.Lock` unset. A
program lock on that lock file would make the accounts step wait until
`LockWait` runs out. The run then fails before the records step
starts.

On a file that does not exist yet, `migrate` and
`account:create-admin` fail unless your opener passes `Create` to
`sqlite.Open`. See [What Open refuses](/database/sqlite/#what-open-refuses).

For demo data, give `accounts.EnsureAccounts` the SQLite store over
the run's handle:

```go
import authkitsqlite "github.com/gopherium/gouncer/authkit/sqlite"

Seed: func(ctx context.Context, call gonsole.Call) error {
	db, err := call.DB(ctx)
	if err != nil {
		return err
	}
	return accounts.EnsureAccounts(ctx, authkitsqlite.NewUserStore(db), demo, call.Stdout)
},
```

With `dbkit/sqlite` 0.2.0 or later, storing a record stops waiting
when the record timeout runs out. On 0.1.0 it can wait up to the
`BusyTimeout` your opener gives `sqlite.Open`. See
[Waiting for a lock](/database/sqlite/#waiting-for-a-lock).

## Upgrading from gonsole/auth 0.8.0

`gonsole/auth` 0.9.0 removes nothing. But `account:enable` now
refuses an account that holds no role, or a role left out of
`Known`, on dry runs too. So a script that enabled such an account
now exits 1. Give those accounts a role first: `account:grant-role`
gives one to every account holding none, and `account:role` changes
one account at a time.

## Upgrading from gonsole/auth 0.7.0

`gonsole/auth` 0.8.0 holds no PostgreSQL code. It removed
`accounts.Migration`, `accounts.RecordMigration` and
`accounts.PostgresRecords`. `Stores` became required. On PostgreSQL,
make each change below that applies to your program:

- Run `go get github.com/gopherium/framework/gonsole/auth/postgres@v0.1.0`.
- Set `Stores: accountpg.Stores` in `accounts.Config`.
- List `accountpg.Migration()` and `accountpg.RecordMigration()` in
  place of `accounts.Migration()` and `accounts.RecordMigration()`.
- Call `accountpg.NewRecordStore(pool)` in place of
  `accounts.PostgresRecords(pool)`.

The steps keep their names and their lists of applied migrations, so
`migrate` applies nothing twice. Errors from the record store and the
records step now include `postgres:`, as in
`myapp: migrate records: postgres: apply the records schema: ...`.

`gonsole/auth/postgres` v0.1.0 works with `gonsole/auth` 0.7.0 too,
so your program keeps building while you make these changes. Then
take v0.2.0, which moves `gonsole/auth` to 0.8.0 as well:

```sh
go get github.com/gopherium/framework/gonsole/auth/postgres@v0.2.0
```

A program that already sets `Stores` and uses none of the removed
names only takes v0.2.0 of its engine module. A program on SQLite is
one of these:

```sh
go get github.com/gopherium/framework/gonsole/auth/sqlite@v0.2.0
```

Its build then no longer links the PostgreSQL driver.
