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
- `Start` connects to what the plugin needs.
- `Migrate` runs before `Start`, and `Seed` runs without it, so
  neither can use anything `Start` sets up.
- `Stop` releases what the plugin holds. It must work even when
  `Start` never ran, and return by the time its context ends.

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
command, never when your server starts.

Both go through the plugins in registration order, stop at the
first failure, and turn a panic into an error as `Start` does.
`Migrate` skips plugins that are not a `Migrator`, and `Seed` skips
those that are not a `Seeder`.

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
