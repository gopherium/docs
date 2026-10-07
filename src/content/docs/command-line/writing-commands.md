---
title: Writing commands
description: Declaring a command, its arguments and flags, dry runs until -yes, JSON answers, schema steps and an acting account.
---

A command is one job your program does from the terminal, such as
`myapp report:create`. This page builds one that checks its input
and previews a change before it makes it. The last section adds who
is running it.

```go
func createReport() gonsole.Command {
	var owner string
	return gonsole.Command{
		Name:    "report:create",
		Summary: "create a report",
		Args:    []string{"title"},
		Flags: func(fs *flag.FlagSet) {
			fs.StringVar(&owner, "owner", "", "`email` address of the report's owner")
		},
		Needs:  []string{"owner"},
		Writes: true,
		Run: func(_ context.Context, call gonsole.Call) error {
			if !strings.Contains(owner, "@") {
				return gonsole.Misuse(fmt.Errorf("report:create: %q is not an email address", owner))
			}
			title := call.Args[0]
			if !call.Apply {
				_, err := fmt.Fprintf(call.Stdout, "would create %q for %s\n", title, owner)
				return err
			}
			_, err := fmt.Fprintf(call.Stdout, "created %q for %s\n", title, owner)
			return err
		},
	}
}
```

Add `createReport()` to `Program.Commands`. `Name` is the full name,
and `Summary` is its line in the command list. `Run` does the work.
The `Call` it receives holds everything about this run, such as the
arguments, the settings and the output streams. Every field is on
[pkg.go.dev](https://pkg.go.dev/github.com/gopherium/framework/gonsole).

`Name`, `Summary` and `Run` are required. A command that breaks a
rule, such as a missing summary or a name used twice, stops the
whole program. Every run then exits 1 with a `myapp: gonsole:` line.

`Args` names the positional arguments, the values given by their
place on the line. Each one is required, and extra ones are refused.
So a line without a title exits 2 with
`myapp: report:create wants <title>` and the help page.

`Flags` declares the command's own flags with Go's standard `flag`
package. gonsole may call it more than once, so it must only declare
flags. It must not declare `-h`, `-help`, `-yes`, `-json` or `-as`,
which gonsole owns.

`Needs` names the flags the line must set. A line that leaves
`-owner` out, or leaves it empty or spaces only, exits 2 with
`myapp: report:create wants -owner <email>` and the help page.
gonsole checks this once it has read the line, before any schema
step, [`Authorize`](#an-acting-account) or `Run`.
`myapp report:create -h` prints the help page without `-owner`.

The placeholder `email` is the word in backquotes in the flag's
usage, the last argument of `fs.StringVar` above. Without backquotes
it names the kind of value, such as `string` or `int`, or just
`value` for a flag of your own type.

Each name in `Needs` must be a flag that `Flags` declares and that
takes a value, unlike a `bool` flag. Otherwise the command breaks a
rule, like a missing summary. gonsole checks the text the line types
for the flag, not the value it reads back. So a flag declared with
`fs.Func` works in `Needs` too. If the line gives the flag twice, the
last text counts.

`Needs` only checks that a value is there. To refuse a bad value,
such as an owner without `@`, `Run` returns `gonsole.Misuse`. It
marks the error as a mistake on the command line, so the run exits
2 the same way.

The first Ctrl-C cancels the `ctx` that `Run` gets. A long command
watches it and stops. Otherwise it runs on until a second Ctrl-C
ends the program.

## Writes and dry runs

`Writes: true` gives the command `-yes`. Without `-yes` the run is a
dry run, a preview that changes nothing. `call.Apply` is false, and
`Run` only prints what it would change. When `Run` returns nil,
gonsole adds `myapp: dry run, nothing changed, pass -yes to apply`
on stderr and exits 0. A command without `Writes` has no dry run,
and its `call.Apply` is always true.

gonsole cannot stop `Run` from writing in a dry run. Check
`call.Apply` before every change, and prove it in a
[test](/command-line/testing/).

`JSON: true` gives the command `-json`. When `call.JSON` is true,
`Run` answers with `call.Encode`, which writes one indented JSON
document. A command that also writes puts `"applied": false` in its
dry run answer, so a script can tell a preview from a change.
gonsole does not add that field for you.

## Schema steps

`Program.Migrations` lists the steps that bring the database schema
up to date. Each is a `gonsole.Step`, a name and a function that
gets the database address, such as
`{Name: "reports", Run: migrateReports}`. `myapp migrate` runs them
in order and prints `migrated reports`. `Migrates: true` runs them
before a command too, but never on a dry run.

A step that runs
[goose](https://pkg.go.dev/github.com/pressly/goose/v3), a
migration tool, turns on goose's session locker. The locker holds a
database lock on the connection that runs the migrations, so a
second `migrate` run waits its turn. Pass `goose.WithSessionLocker`
a locker from goose's `lock.NewPostgresSessionLocker`.

`Program.Lock` is for a program whose steps take no lock of their
own. It takes a lock and returns its release, and gonsole holds it
around every migration. Never set both, or a step can wait on the
program's own lock.

## Renamed commands

`Program.Renamed` keeps an old spelling with a space working after
you rename a command. With `"report create": "report:create"`,
gonsole warns on stderr that `report create` is deprecated and runs
`report:create`. The new name must be one of your own commands, and
the old spelling cannot start with a base command such as `list`.

## An acting account

The acting account is the account of the person who runs the
command. Set `Capability` to a permission it must hold, such as
`manage_reports`. The command then wants `-as <email>`, which `Run`
reads as `call.Actor`. gonsole does not look the account up. Your
program does, in two functions it sets on `Program`.

A program whose accounts live in the
[`authkit/postgres` store](/authentication/persistence/) takes both
from `gonsole/auth`, imported as `accounts`:

```go
Migrations: []gonsole.Step{
	accounts.Migration(),
	accounts.RecordMigration(),
	{Name: "reports", Run: migrateReports},
},
Authorize: accounts.Authorize(cfg),
Record:    accounts.Record(cfg),
```

`cfg` is the `accounts.Config` of your account commands.
`Authorize` lets an account act only when it is enabled and its role
carries the capability in `Roles.Capabilities`. `Record` stores each
change in a table that the `RecordMigration` step creates.
[Account commands](/command-line/account-commands/#an-acting-account)
has the details.

A program with its own accounts writes both functions.
`Authorize(ctx, call, capability)` runs before `Run`, on dry runs
too. `Record(ctx, call, command)` runs once `Run` has applied the
change, so a failing `Record` exits 1 but the change stays.
`call.Actor` arrives exactly as typed, so trim it and lower-case it
before a lookup.

`call.Flags` holds only the flags the line set, without their
defaults and without `-yes`, `-json` or `-as`. Flags declared with
`fs.Func` or `fs.BoolFunc` read empty there. Take a secret, such as
a password, only on `call.Stdin`, since flags reach the shell
history and `Record`.

Once one of your own commands names a capability, set both
functions, or every run exits 1.
