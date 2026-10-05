---
title: Operator conventions
description: How to run a program built on gonsole, read what it prints, and apply changes safely.
---

This page is for the operator, the person who runs the binary, not
the one who writes it. Every program built on
[`gonsole`](https://pkg.go.dev/github.com/gopherium/framework/gonsole)
follows these rules. The examples use a program called `myapp`.

With no command, the program lists every command and exits 0. A
program can be built to run `serve` instead. The listing looks like
this:

```text
myapp Version 1.4.0

Usage:
  myapp <command> [flags] [arguments]

Every command answers -h. A command that offers -json answers one JSON document. A command that offers -yes is a dry run until -yes.

Available commands:
  check          check every setting, every plugin and every command name
  help           print the help of one command
  list           list every command
  serve          run the server
  version        print the version
 report
  report:create  create a report
  report:list    list every report
```

A program lists `serve`, `migrate` and `seed` only when it offers
them. Every command answers `-h` with its help page. A line that
holds `-h` only prints help, even with `-yes` on it.

## Reading the answer

A command prints its answer on stdout. With `-json`, on a command
that offers it, the answer is one JSON document for scripts to read.
Progress, warnings and errors go to stderr, and every error line
starts with `myapp:`.

| Exit code | Means |
| --- | --- |
| 0 | the command finished, printed help, or made a dry run that changed nothing |
| 1 | the command ran and failed, a panic included |
| 2 | the program could not read the command line |

Each of these lines exits 2:

```text
$ myapp reprot
myapp: unknown command "reprot", run "myapp list" to see every command
$ myapp report
myapp: unknown command "report", want report:create or report:list
$ myapp report:list extra
myapp: report:list takes no arguments, got 1
$ myapp report:create Q3
myapp: report:create wants -owner <email>
```

The last two also print the help page on stderr, left out here. The
last one names a flag the command cannot run without. Pass it with a
value. An empty value or spaces alone count as missing, and nothing
runs until you set it.

A 2 with no `myapp:` line is different. It is a crash the program
could not catch, such as a stack overflow or a panic in background
work the command started.

Flags and arguments may come in any order. Everything after `--` is
an argument, even when it starts with a dash, so a title like `-Q3`
goes after it.

## Changing things safely

A command that offers `-yes`, such as `report:create`, is a dry run
until you pass it. It prints what it would change, writes nothing,
and ends with `myapp: dry run, nothing changed, pass -yes to apply`.
A command whose help page lists no `-yes` has no dry run.

A command that needs a permission wants `-as <email>`, the account
you act as. The program checks that account before it runs, dry runs
included, and records who applied the change. When the listing shows
`account:records`, that command lists who applied which change,
newest first. A missing `-as` exits 2, and an account without the
permission exits 1. An account command also exits 1, dry runs
included, when the role it gives, or the role of the account it
changes, carries a permission your own role lacks. It does the same
when you try to disable your own account or change your own role.
If recording fails, the run exits 1 even though the change was made.
Check before you run it again.

An old spelling with a space may still run, after a warning such as
`myapp: "report create" is deprecated, use "report:create"`.

## Running it in production

Before you deploy a new release, run `myapp check` with its
settings. It checks every setting, plugin and command name without
starting the server. On a problem it exits 1 and names it, such as
`myapp: MYAPP_REGION is required`.

Run `myapp migrate` before a release that changes the database
schema. It applies every change at once and has no dry run. Never
run `myapp seed -yes` against production, because seed stores demo
data.

The first Ctrl-C, or the SIGTERM a deployment sends, asks the
command to stop. `serve` then gives running requests time to finish,
as [Serving](/command-line/serving/) explains. A second Ctrl-C ends
the program at once.
