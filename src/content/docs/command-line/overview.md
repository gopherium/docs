---
title: Overview
description: What gonsole gives your program's command line, and the smallest program built on it.
---

[`gonsole`](https://pkg.go.dev/github.com/gopherium/framework/gonsole)
runs your program's command line. It reads the arguments and runs
the right command. It also gives you a listing of every command, a
help page for each one, settings from the environment, a server
that stops cleanly, and seven base commands. Every program built on
it follows the same
[operator conventions](/command-line/operator-conventions/).

## The smallest program

```go
func main() {
	os.Exit(gonsole.Main(program(os.Getenv)))
}

func program(getenv func(string) string) gonsole.Program {
	return gonsole.Program{
		Name:     "myapp",
		Version:  "1.4.0",
		Env:      gonsole.Env{Prefix: "MYAPP_", Getenv: getenv},
		Database: "DATABASE_URL",
		Serve:    serve,
		Commands: []gonsole.Command{listReports},
	}
}

var listReports = gonsole.Command{
	Name:    "report:list",
	Summary: "list every report",
	Run: func(_ context.Context, call gonsole.Call) error {
		_, err := fmt.Fprintln(call.Stdout, "quarterly")
		return err
	},
}
```

`Main` runs the program and returns the exit code for `os.Exit`: 0
when the run finished, 1 when a command failed, and 2 when the
program could not read the command line.

A setting is an environment variable whose name starts with
`Prefix`. `Database` names the setting that holds the database
address, so this program reads `MYAPP_DATABASE_URL`. `serve` is your
server function, shown under [Serving](/command-line/serving/).

gonsole reads settings only through `Getenv`, never from the
environment directly. So `main` passes `os.Getenv`, and a
[test](/command-line/testing/) passes one that reads a map. Leave
`Getenv` out and every setting reads as empty.

A command name is plain, such as `status`, or a namespace and a
command joined by a colon, such as `report:list`. A namespace
groups related commands in the listing. Each part holds lowercase
letters, digits and hyphens, and starts with a letter.

## Base commands

gonsole adds these commands to every program. The last column says
when each one is shown.

| Command | What it does | Shown |
| --- | --- | --- |
| `help` | prints the help of one command | always |
| `list` | lists every command | always |
| `version` | prints the version | always |
| `check` | checks every setting, every plugin and every command name | always |
| `serve` | runs the server | with `Serve` |
| `migrate` | applies every schema step, the functions that build your tables | with `Migrations` or `Plugins` |
| `seed` | stores demo data for development, only with `-yes` | with `Seed` or `Plugins` |

A base command that is not shown fails like an unknown command.
Your own commands can never use these seven names.
`gonsole.BaseCommands()` returns them.

Running `myapp` with no command prints the listing. So a container
image that should start the server sets `CMD ["serve"]`.

## Settings

`call.Env.Value("ADDR")` reads `MYAPP_ADDR`, with spaces trimmed
from both ends. `Duration`, `Count` and `Counts` read a setting as a
length of time, a number, or a list of numbers. Each takes a
fallback, the value to use when the setting is empty. Each refuses a
bad value, zero and below included.

`Counts` reads numbers split by commas, such as `10,20,50`. Each
number must be bigger than the one before it.

Bounds after the fallback change what a setting accepts:

```go
sizes, err := call.Env.Counts("PAGE_SIZES", []int{10, 20, 50},
	gonsole.AtMost(100), gonsole.Entries(2, 6))
toast, err := call.Env.Duration("TOAST_DURATION", 6*time.Second,
	gonsole.WholeMilliseconds())
```

| Bound | Effect |
| --- | --- |
| `gonsole.AllowZero()` | accepts zero too |
| `gonsole.AtMost(100)` | refuses a number above 100 |
| `gonsole.WholeMilliseconds()` | refuses a duration with a part millisecond, such as `1500us` |
| `gonsole.Entries(2, 6)` | refuses a list of fewer than 2 or more than 6 numbers |

The [`gonsole/locale`](https://pkg.go.dev/github.com/gopherium/framework/gonsole/locale)
package reads a setting that names a language, such as
`MYAPP_FORMAT_LOCALE=es-ES`. It answers the tag in its standard
spelling, so `en-gb` reads as `en-GB`, and refuses a value that
names no language:

```go
tag, err := locale.Tag(call.Env, "FORMAT_LOCALE", "es-ES")
```

Set `Program.Validate` to a function that reads every setting the
program needs, such as `call.Env.Required("REGION")`. Only the
`check` command runs it, and it starts no server. So run
`myapp check` before you deploy, and a missing setting fails there,
as `myapp: MYAPP_REGION is required`. Have your `serve` call the
same function first, so the server refuses a bad setting too.

## Where it sits

gonsole depends only on the standard library. Its `locale` package
also uses `golang.org/x/text`, built only into a program that imports
it. Add gonsole with:

```sh
go get github.com/gopherium/framework/gonsole@v0.7.0
```

Read on with [Writing commands](/command-line/writing-commands/),
then [Serving](/command-line/serving/).
