---
title: The host and its lifecycle
description: How the host migrates, starts, guards, and stops a fixed set of plugins.
---

The host starts your plugins in a safe order, gives you what they
declare, and shuts them down again:

```go
host := pluginkit.NewHost(registered...)
if err := host.Start(ctx); err != nil {
	return err
}
defer host.Stop(ctx)
```

`NewHost` panics if two plugins share an id. That is a wiring
mistake rather than a runtime condition, so it fails immediately at
startup instead of misbehaving later.

## Start

`Start` gives you four guarantees:

- Every database migration runs before any plugin starts, so no
  plugin ever runs against a schema that is not ready.
- Plugins start in the order they were registered.
- If one fails to start, the host stops the ones already started, in
  reverse order, then returns the original failure along with any
  errors from stopping. You never end up half started.
- If a plugin panics, the host turns it into an ordinary error
  naming the plugin and what it was doing. One bad plugin cannot
  bring down the process.

## Seed

Sample data is not part of booting. `Seed` is a separate call, so a
production start never writes it:

```go
if err := host.Seed(ctx); err != nil {
	return err
}
```

Plugins seed in registration order, and the first failure stops the
run. A plugin that panics becomes an error naming it, the same
protection `Start` has. Plugins without the capability are simply
skipped. Call `Seed` from a development subcommand of your binary,
never from the serve path.

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
	router.Mount(prefix, http.StripPrefix(prefix, guarded))
}
```

Three things to know about the matching:

- A public path must match exactly. There is no prefix or wildcard
  matching, so nothing is accidentally exposed.
- A match applies to every HTTP method.
- Public paths are written relative to the plugin's namespace, so
  `/webhook` and not the full URL. That is because `StripPrefix`
  has already removed the prefix by the time `Protect` sees the
  request.

The middleware is any `func(http.Handler) http.Handler`. The
example above uses `RequireSession` from
[authkit](/authentication/sessions-over-http/).

## Stop

`Stop` shuts plugins down in reverse registration order. If one
fails it keeps going and returns every error together, so a single
bad shutdown never leaves the rest running.

Call it before you close anything your plugins use, such as your
database pool. Call it on both paths out of your program: the
normal shutdown, and the one where your server returned an error.
