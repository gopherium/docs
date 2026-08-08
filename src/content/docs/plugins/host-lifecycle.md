---
title: The host and its lifecycle
description: How the host migrates, starts, guards, and stops a fixed set of plugins.
---

The host brings plugins up in a safe order, exposes what they
declare, and shuts them down:

```go
host := pluginkit.NewHost(registered...)
if err := host.Start(ctx); err != nil {
	return err
}
defer host.Stop(ctx)
```

`NewHost` panics on a duplicate plugin id. That is a wiring mistake,
caught at construction.

## Start

Four guarantees, in order:

- Every `Migrator` runs before any plugin starts.
- Plugins start in registration order.
- A failed start stops the already-started plugins in reverse order
  and returns the failure with any stop errors joined.
- A panicking plugin becomes an error tagged with its id and
  operation. It cannot crash the host.

## Seed

Sample data is not part of booting. `Seed` is a separate call, so a
production start never writes it:

```go
if err := host.Seed(ctx); err != nil {
	return err
}
```

Every `Seeder` runs in registration order and the first failure stops
the sweep, with the same panic isolation `Start` gives. Plugins
without the capability are skipped, so a partially seeded set of
plugins is normal. Wire it into a development subcommand of your
binary, never into the serve path.

## Routes and public paths

```go
routes := host.Routes()      // map[string]http.Handler
public := host.PublicPaths() // map[string][]string
```

Both are keyed by plugin id and carry only the plugins that declare
them. Mounting is yours.

## Guarding a namespace

`Protect` serves a plugin's declared public paths raw and passes
everything else through your middleware:

```go
for id, handler := range host.Routes() {
	prefix := "/api/plugins/" + id
	guarded := pluginkit.Protect(handler, host.PublicPaths()[id], auth.RequireSession)
	router.Mount(prefix, http.StripPrefix(prefix, guarded))
}
```

Matching is exact and method-agnostic. Public paths are
namespace-relative, `/webhook` rather than the full URL, because
`StripPrefix` runs first. Any `func(http.Handler) http.Handler`
works as the middleware. Above it is `RequireSession` from
[authkit](/authentication/sessions-over-http/).

## Stop

Reverse registration order, continuing past failures, all errors
joined. Call it before closing the resources your plugins use, in
both your shutdown path and your serve-error path.
