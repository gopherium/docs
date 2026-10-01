---
title: Plugin commands
description: How a plugin offers commands of its own, and how your program loads them through pluginkit.
---

A plugin can ship its own commands, such as `export:run`, that run
like any other command. This page shows how a plugin declares them
and how your program loads them into
[`gonsole`](https://pkg.go.dev/github.com/gopherium/framework/gonsole).

## A plugin declares its commands

A plugin offers commands by implementing `gonsole.Provider`, whose
one method is `Commands() []gonsole.Command`. Each command name
starts with the plugin's id as its namespace. Plugins import only
your [SDK package](/plugins/overview/#your-application-owns-the-seam),
so add four aliases to it:

```go
type Command = gonsole.Command
type Call = gonsole.Call
type CommandProvider = gonsole.Provider

var Misuse = gonsole.Misuse
```

The plugin with id `export` can then offer `export:run`:

```go
var _ sdk.CommandProvider = (*Plugin)(nil)

func (p *Plugin) Commands() []sdk.Command {
	return []sdk.Command{{Name: "export:run", Summary: "export every report", Run: p.export}}
}
```

gonsole skips a plugin that has no `Commands` method, and says
nothing. The `var _` line turns a missing or misspelled method into
a build error instead.

The fields and `sdk.Misuse` work as in
[Writing commands](/command-line/writing-commands/), with two
differences. A plugin command may not set `Migrates`, which runs
your program's own schema steps. One that sets `Capability` needs
your program's `Authorize` and `Record`, or gonsole drops only that
command.

## Loading the plugins

`Program.Plugins` is a function you write. It registers the compiled
plugins with pluginkit and starts none of them. `call.Describe` is
true when gonsole only needs the listing or a help page. The example
then skips the database, so `myapp list` works without one:

```go
func loadPlugins(_ context.Context, call gonsole.Call) (gonsole.Loaded, error) {
	stopGrace, err := call.Env.Duration("SHUTDOWN_STOP_GRACE", 5*time.Second)
	if err != nil {
		return gonsole.Loaded{}, err
	}
	url := call.Env.Value("DATABASE_URL")
	if !call.Describe {
		if url, err = call.DatabaseURL(); err != nil {
			return gonsole.Loaded{}, err
		}
	}
	registered, failed := registerPlugins(sdk.Deps{DatabaseURL: url, Getenv: call.Env.Getenv})
	host := pluginkit.NewHost(registered...)
	return gonsole.Hosted(registered, host, failed, stopGrace, nil), nil
}
```

Set it as `Plugins: loadPlugins`. `registerPlugins` comes from the
[wiring generator](/plugins/wiring-and-manifests/).
`gonsole.Hosted` builds the `gonsole.Loaded` from the plugins and a
host. The host is any `gonsole.PluginHost`, a type with `Migrate`,
`Seed` and `Stop` methods, and `*pluginkit.Host` is one. Its
`Migrate` and `Seed` let the `migrate` and `seed` commands run the
plugins' schema and demo data after your own.

gonsole calls `Release` at the end of every run that loaded the
plugins, `list` and help pages included, so they can stop and clean
up. The run puts no time limit on it, so the `Release` of `Hosted`
has its own, the stop grace. The example reads it from
`MYAPP_SHUTDOWN_STOP_GRACE`. Once the host stops, or fails to,
`Release` calls the last argument. Pass a function that closes what
registering opened, such as a database pool, or `nil` when it opened
nothing, as here. If `Release` fails, the run prints
`myapp: release the plugins:` and the error, and exits 1.

gonsole does not load the plugins for `serve`. Your `serve` function
registers them itself, starts the host and mounts its routes, as the
[host lifecycle](/plugins/host-lifecycle/) shows. It then passes
`host.Stop` to [`gonsole.Serve`](/command-line/serving/) as `stop`.

## When a plugin fails

A broken plugin never takes the program down. `Failed` holds the
plugins that failed to register or panicked in `Commands`. While it
holds any:

- `myapp list` shows each failure under `Not loaded:` and exits 0.
- A command of a failed plugin exits 1.
- Other plugin commands still run, after one `myapp: warning:` line
  on stderr per failure.
- `migrate` and `seed -yes` apply your own schema steps, then exit 1
  without the plugins' schema or any demo data.
- `myapp check` prints every failure and exits 1.

gonsole also drops a plugin command that breaks the rules above.
`list` and `check` report it, and running it exits 1. The plugin's
other commands still run without a warning, and `migrate` and
`seed -yes` still apply its schema and demo data.

A plugin whose id is a base command or one of your own namespaces,
such as `report`, loses all its commands. `list` and `check` report
it, and each of its commands exits 2, like an unknown command. The
plugin still registers, so `migrate` and `seed -yes` still apply its
schema and demo data. To catch that earlier, list those names in
`wire.Config.Reserved`, as the
[wiring page](/plugins/wiring-and-manifests/#ids-the-generator-refuses)
shows. The wiring generator then refuses such an id.
