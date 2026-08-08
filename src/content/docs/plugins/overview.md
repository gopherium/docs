---
title: Overview
description: Compile-time plugins with a lifecycle host, a wiring generator, and route guarding, all framework-free.
---

`pluginkit` runs a fixed set of compile-time plugins: ordinary Go
packages linked into your binary, each owning its own routes and
database schema. It ships the host that starts and stops them, the
generator that wires them in, and the guard that protects their
routes.

## One required interface, four optional capabilities

A plugin implements `Plugin`: an `ID`, a `Start`, and a `Stop`.
Everything else is an optional capability the host discovers by type
assertion:

- `Migrator` for plugins that own database schema, migrated before
  anything starts.
- `Seeder` for plugins that can fill their own schema with
  development data, asked outside the start path.
- `RouteProvider` for plugins that serve HTTP under their own
  namespace.
- `PublicPathProvider` for endpoints that must answer without a
  login, such as a signed webhook.

Signatures live on
[pkg.go.dev](https://pkg.go.dev/github.com/gopherium/pluginkit).

## Share the mechanism, never the seam

pluginkit depends only on the standard library and never sees your
domain. Your app owns the seam: a thin SDK package that re-exports
the lifecycle contract as type aliases and defines what plugins
receive:

```go
package sdk

import "github.com/gopherium/pluginkit"

type Plugin   = pluginkit.Plugin
type Migrator = pluginkit.Migrator

type Deps struct {
	DatabaseURL string
	Getenv      func(string) string
}
```

Aliases are identical types, so plugins import only your SDK and
still satisfy the host. `Deps` carries your domain services and
stays yours.

## Where it sits

A sibling brick to [authentication](/authentication/overview/),
extracted from production the same way, with zero third-party
dependencies. Continue with the
[host lifecycle](/plugins/host-lifecycle/) and the
[wiring generator](/plugins/wiring-and-manifests/).
