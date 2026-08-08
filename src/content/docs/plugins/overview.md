---
title: Overview
description: Compile-time plugins with a lifecycle host, a wiring generator, and route guarding, all framework-free.
---

`pluginkit` lets you build an application out of plugins, where a
plugin is an ordinary Go package compiled into your binary. Each one
can own its own HTTP routes and its own database tables.

These are compile-time plugins, not downloadable ones. Nothing is
loaded at runtime, so the compiler checks every plugin and there is
no dynamic loading to go wrong. Adding or removing a plugin means
rebuilding.

pluginkit ships three things: the host that starts and stops your
plugins, the generator that wires them in, and the guard that
protects their routes.

## One required interface, four optional capabilities

Every plugin implements `Plugin`, which is three methods: `ID`,
`Start` and `Stop`.

Everything beyond that is optional. A plugin implements the extra
interface only if it needs it, and the host finds out at runtime by
checking whether the plugin satisfies it:

- `Migrator` for plugins that own database schema, migrated before
  anything starts.
- `Seeder` for plugins that can fill their own schema with
  development data, asked outside the start path.
- `RouteProvider` for plugins that serve HTTP under their own
  namespace.
- `PublicPathProvider` for endpoints that must answer without a
  login, such as a signed webhook.

A plugin that serves a GraphQL API has a fifth option, described
under [GraphQL plugins](/plugins/graphql-plugins/). It is a separate
module, so applications without a graph never pull it in.

The exact signatures are on
[pkg.go.dev](https://pkg.go.dev/github.com/gopherium/pluginkit).

## Your application owns the seam

pluginkit depends only on the standard library, and it knows nothing
about your domain. So plugins do not import pluginkit directly.
Instead your application writes a small SDK package that re-exports
pluginkit's interfaces as type aliases, and defines what a plugin
receives when it starts:

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

A Go type alias is the same type under a second name, not a copy. So
a plugin written against your SDK satisfies the host without ever
importing pluginkit. `Deps` is entirely yours: put your database
URL, your services, whatever plugins need.

## Where it sits

pluginkit is a sibling of [authentication](/authentication/overview/),
extracted from a working product the same way, and it has no
third-party dependencies.

Read on with the [host lifecycle](/plugins/host-lifecycle/), then
the [wiring generator](/plugins/wiring-and-manifests/).
