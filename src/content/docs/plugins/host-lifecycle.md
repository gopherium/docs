---
title: The host and its lifecycle
description: How the host migrates, starts, guards, and stops a fixed set of plugins.
---

The host starts your plugins in a safe order, gives you what they
declare, and shuts them down again once your server stops:

```go
host := pluginkit.NewHost(registered...)
if err := host.Start(ctx, stopGrace); err != nil {
	return err
}
serveErr := serve(ctx)
stopCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), stopGrace)
defer cancel()
return errors.Join(serveErr, host.Stop(stopCtx))
```

`stopGrace` is how long plugins get to stop. It comes from your own
settings. `NewHost` panics if two plugins share an id, so that
wiring mistake shows at startup.

## What a plugin does at each step

- `Register` is the function the
  [wiring generator](/plugins/wiring-and-manifests/#what-each-plugin-must-provide)
  calls in each plugin's package. It checks the plugin's settings
  and builds the plugin. It never touches the network or the
  database.
- `Start` connects to what the plugin needs, and returns by the time
  its context ends. It may run again after `Stop`, so it must not count
  on being called only once. Work that keeps running after `Start`
  belongs to the plugin, not to that context, so `Stop` is what ends it.
- `Migrate` runs before `Start`, and `Seed` runs without it, so
  neither can use anything `Start` sets up.
- `Stop` releases what the plugin holds. It must work even when
  `Start` never ran, work again when `Stop` already ran, and return
  by the time its context ends.
- `Routes` and `PublicPaths` return what the plugin declares, whether
  or not `Start` ran or worked, so they must not use anything `Start`
  sets up.

## Start

`Start` gives you four guarantees:

- Every database migration runs before any plugin starts, so no
  plugin ever runs against a schema that is not ready.
- Plugins start in the order they were registered.
- If one fails to start, the host stops the ones already started, in
  reverse order, then returns the original failure along with any
  errors from stopping. Those stops get `stopGrace`, even when `ctx`
  has already ended. You never end up half started.
- If a plugin panics, the host turns it into an ordinary error
  naming the plugin and what it was doing. One bad plugin cannot
  bring down the process.

`Start` returns an error when `stopGrace` is zero or less, before
any migration runs.

To keep your server up when one plugin fails, use
[`StartEach`](#starting-each-plugin-on-its-own) instead.

## Migrate and Seed

Two calls work on the database without starting any plugin:

```go
if err := host.Migrate(ctx); err != nil {
	return err
}
if err := host.Seed(ctx); err != nil {
	return err
}
```

`Migrate` runs the same migrations that `Start` runs first. Use it
in a command that only prepares the database. `Seed` fills in
sample data. `Start` never calls it, so call it from a development
command, never when your server starts. On
[`gonsole`](/command-line/plugin-commands/), the `migrate` and
`seed -yes` commands make both calls for you.

Both go through the plugins in registration order, stop at the
first failure, and turn a panic into an error as `Start` does.
`Migrate` skips plugins that are not a `Migrator`, and `Seed` skips
those that are not a `Seeder`.

## Skipping migrations that already ran

`Migrate` asks every plugin to migrate on every start. Each plugin's
migration tool then reads its own version table and finds nothing to
do, but asking still costs a few milliseconds per plugin. With many
plugins, that adds up on every boot.

A migration store lets the host skip that work. Your application keeps
a record of the migration version each plugin last applied. On the next
start the host reads every recorded version in one call, and asks a
plugin to migrate only when its version changed:

```go
host, err := pluginkit.NewHostWithMigrationStore(store, nil, registered...)
if err != nil {
	return err
}
```

A plugin takes part by implementing `MigrationVersioner` beside
`Migrator`. Its `MigrationVersion` returns any string that changes
when its schema changes, such as the name of its newest migration file:

```go
func (p *Plugin) MigrationVersion() (string, error) {
	return "00004_add_reminders", nil
}
```

The store is yours, because pluginkit knows no SQL. Keep the versions
wherever your application keeps its data. A store over a map shows the
two methods it needs:

```go
type memoryStore struct {
	versions map[string]string
}

func (s *memoryStore) Versions(context.Context) (map[string]string, error) {
	return maps.Clone(s.versions), nil
}

func (s *memoryStore) Record(_ context.Context, id, version string) error {
	s.versions[id] = version
	return nil
}
```

For each plugin, in registration order, the host does this:

- A plugin whose version equals the recorded one is skipped.
- A plugin with a new version, or one the store has never seen,
  migrates, then the host calls `Record` with that version.
- A `Migrator` that has no `MigrationVersion` migrates on every
  start, as it does under `NewHost`.
- An empty version, or an error from `MigrationVersion`, stops
  `Migrate` with an error naming the plugin.
- A panic in `MigrationVersion`, `Record`, `Versions` or the lookup
  below becomes an ordinary error, as a panic in `Migrate` does.

The host compares versions as plain strings and nothing more, so
`00010` and `10` are different versions.

If `Record` fails, the plugin's schema has already moved, so the next
start migrates that plugin again. So write migrations that are safe to
run twice, as those run through the goose migration library are, and
keep `Migrate` to schema work only, because the host may skip it.

`Start` calls the same `Migrate`, so the skip applies when your server
boots too. `NewHostWithMigrationStore` returns an error, where
`NewHost` panics, when two plugins share an id, and also when the store
is nil.

The second argument, a `MigratorOf`, is for an application that
applies a plugin's migrations itself, for example when each plugin
ships a folder of SQL files. It returns the `Migrator` for that plugin,
or `false` to let the plugin's own `Migrate` run. To be skipped, the
`Migrator` it returns must implement `MigrationVersioner`, because the
host asks that one and not the plugin. Pass `nil` when every plugin
migrates itself.

## Starting each plugin on its own

`Start` is all or nothing. One plugin that fails keeps your whole
server down. That suits a few plugins you ship together. When many
authors write the plugins you compile into one binary, one bad release
should not take the others with it. `StartEach` goes on past a failure
and tells you what happened to each plugin:

```go
outcome, err := host.StartEach(ctx)
if err != nil {
	return err
}
for _, plugin := range outcome.Started {
	slog.Info("plugin started", "id", plugin.ID, "took", plugin.Took)
}
for _, failure := range outcome.Failed {
	slog.Error("plugin failed", "id", failure.ID, "step", failure.Step, "error", failure.Err)
}
```

`StartEach` works on any host, and on a host with a migration store it
skips the plugins that store records as current. Both lists keep
registration order. It goes through two passes:

- Every plugin migrates first, so no plugin runs against a schema that
  is not ready. A plugin whose migration failed does not start. The
  others carry on.
- Then every remaining plugin starts. `Took` is how long its `Start`
  ran, so you can compare it with a limit of your own. The host sets no
  limit.

Each `Failure` holds the plugin's `ID`, its `Step`, its `Err`, and
`Panicked`, which is true when that step panicked. The `Err` has the
same text an error from `Start` has, such as
`pluginkit: beta start: connection refused`. `Step` is one of three
values:

- `StepMigrate` means the migration failed, so the plugin did not
  start.
- `StepRecord` means the migration ran but `Record` failed. The schema
  is ready, so the plugin still starts, and the next boot migrates it
  again. That plugin is in `Failed` and also in `Started`. If its
  `Start` fails too, it is in `Failed` twice.
- `StepStart` means `Start` failed.

The error `StartEach` itself returns has one cause: it could not read
the migration store. It calls no plugin in that case, because it cannot
tell which ones are current.

If the context ends during the boot, usually because your server is
shutting down, the host calls no further plugin. Each plugin still
waiting goes in `Failed` with the context's error, at the pass it was
waiting in, so a plugin with no migrations can show `StepMigrate` here.
If your store notices the ended context first, you get that store's
error from `StartEach` instead, and both lists stay empty.

Check `ctx.Err()` before you act on a failure. If it is set, the boot
was cut short, so do not judge a plugin by that run. Reading the error
alone is not enough: a plugin may hide the context's error by wrapping
it with `%v`, and a timeout of its own reads the same as yours.

The host calls plugins one after another and sets no time limit, so a
`Migrate` or a `Start` that ignores its context holds up every plugin
behind it. Every `Migrate` runs before any `Start`, so a `Migrate` that
hangs keeps them all from starting.

`StartEach` stops nothing and takes no `stopGrace`. Call it once, then
call `host.Stop` at shutdown as usual. `Stop` reaches every plugin,
including the ones that failed, which is why it must work when `Start`
never ran.

`Routes` and `PublicPaths` still include every plugin that declares
them, failed ones too, so mount only the ones in `outcome.Started`. A
failed plugin's handler may rely on something its `Start` never set up.

## Routes and public paths

```go
routes := host.Routes()      // map[string]http.Handler
public := host.PublicPaths() // map[string][]string
```

Both maps are keyed by plugin id, and only contain the plugins that
declare them. The host does not mount anything itself, so you stay
in charge of your router and your URL layout.

## Guarding a namespace

Most plugin routes should require a login, but a few, such as an
incoming webhook, cannot have one. `Protect` wraps a plugin's
routes in your authentication middleware while letting its declared
public paths through:

```go
for id, handler := range host.Routes() {
	prefix := "/api/plugins/" + id
	guarded := pluginkit.Protect(handler, host.PublicPaths()[id], auth.RequireSession)
	mux.Handle(prefix+"/", http.StripPrefix(prefix, guarded))
}
```

The pattern ends with a slash, so the mux sends every path under the
prefix to the plugin.

A public path must match exactly, so nothing is exposed by
accident. A match lets every HTTP method through, not only the one
your webhook uses. Write the path relative to the plugin's
namespace, so `/webhook` and not the full URL. `StripPrefix` has
already removed the prefix by the time `Protect` sees the request.

The middleware is any `func(http.Handler) http.Handler`. The
example above uses `RequireSession` from
[authkit](/authentication/sessions-over-http/).

## Stop

`Stop` shuts every plugin down in reverse registration order, even
one that never started. If one fails it keeps going and returns
every error together, so a single bad shutdown never leaves the rest
running.

Call it once your server has stopped, cleanly or with an error.
Call it before you close anything your plugins use, such as your
database pool. By then `ctx` is often cancelled, and a plugin handed
it may skip its cleanup. So the example builds a new context.
`context.WithoutCancel` copies `ctx` without its cancel, and
`context.WithTimeout` gives that copy a limit of `stopGrace`.

[`gonsole.Serve`](/command-line/serving/) builds that context for
you. Pass it `host.Stop` and it calls it once the server is down.
For a failure before the server starts,
`gonsole.StopHost(ctx, host, stopGrace)` builds the same context and
stops the host.
