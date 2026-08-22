---
title: Letting plugins extend a GraphQL API
description: graphwire generates the gqlgen resolver root from your plugin manifests, so a plugin can add fields to a shared graph.
---

If your application serves a GraphQL API, you probably want plugins
to add to it: a new query, a new mutation, an extra field on a type
the core already defines.

The problem is that [gqlgen](https://gqlgen.com/), the Go GraphQL
library, wants a single `ResolverRoot` value holding every resolver
for the whole schema. Someone has to build that value, and doing it
by hand means editing a central file every time a plugin is added or
removed, which is exactly what [the plugin
generator](/plugins/wiring-and-manifests/) exists to avoid.

`graphwire` writes that file for you. It reads your plugin
manifests, reads the schema each plugin ships, and generates a
resolver root that stitches them together.

It is a separate Go module, `github.com/gopherium/pluginkit/graphwire`,
tagged `graphwire/vX.Y.Z`. It lives beside pluginkit rather than
inside it because it needs a GraphQL parser, and pluginkit's own
promise is that it depends on nothing but the standard library.
Applications with no GraphQL API never pull the parser in.

## Marking a plugin as a graph contributor

Add `"graphql": true` to the plugin's manifest:

```json
{
  "id": "whatsapp",
  "name": "WhatsApp",
  "backend": "github.com/you/myapp/plugins/whatsapp",
  "graphql": true
}
```

A plugin that sets this must also have a `backend`, since its
resolvers are Go code, and must put its schema in
`plugins/<id>/graph/` in files ending `.graphqls`. The generator
fails with a clear message if either is missing.

## What the plugin writes

For each GraphQL type it touches, the plugin defines a type named
`<TypeName>Resolvers` and a method returning it. To add a query and
a mutation, that is:

```go
// QueryResolvers serves the plugin's Query root fields.
type QueryResolvers struct {
	plugin *Plugin
}

// QueryResolvers returns the plugin's Query resolver set.
func (p *Plugin) QueryResolvers() QueryResolvers {
	return QueryResolvers{plugin: p}
}
```

The actual resolver methods hang off that struct, and gqlgen decides
their signatures from your schema as usual.

You do not write an interface or register anything. The generator
reads your schema, works out which sets you must provide, and
generates an interface listing them. Miss one and the build fails
naming it.

## Which types need a resolver set

The generator only asks for a set where gqlgen actually generates a
resolver interface:

- `Query`, `Mutation` and `Subscription`, whenever they have at
  least one field.
- Any other object type with a field that takes arguments, or a
  field marked `@goField(forceResolver: true)`.

Plain data fields do not need resolvers, so a type made only of
those gets no set and is not your responsibility.

## Running the generator

The generator is a small command inside your application, usually
the same one that runs the [plugin
wiring](/plugins/wiring-and-manifests/):

```go
var graphConfig = graphwire.Config{
	ExecImport:      "github.com/you/myapp/graph",
	CoreImport:      "github.com/you/myapp/internal/graphres",
	CoreSchemaGlobs: []string{"graph/schema/*.graphqls"},
	WiringPath:      "internal/graphroot/graphroot_gen.go",
	License:         "Apache-2.0",
	Package:         "graphroot",
	SDKImport:       "github.com/you/myapp/sdk",
	Roots:           []string{"plugins"},
}

func main() {
	if err := graphwire.Run(".", graphConfig); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
```

`Roots` names the plugin folders to read, in order, and may be left
out to read `plugins/` alone. Each plugin's schema is read from the
folder its manifest came from. Keep the list the same as the one you
give the [wiring generator](/plugins/wiring-and-manifests/#more-than-one-plugin-folder),
so both see the same plugins.

What each field is for:

| Field | Meaning |
| --- | --- |
| `ExecImport` | The package gqlgen generated, the one declaring `ResolverRoot` |
| `CoreImport` | The package holding your core resolver sets, the ones that are not from a plugin |
| `CoreSchemaGlobs` | Where your core schema files live, relative to the project root |
| `WiringPath` | Where to write the generated file |
| `License` | The SPDX identifier for the generated file header |
| `Package` | The name of the generated package |
| `SDKImport` | Your SDK package, the one declaring the `Plugin` interface |

`Package` and `SDKImport` go together, and leaving both out
generates a `package main` file with unexported names instead. A
named package is the usual choice, because only that form generates
`FromPlugins`, described below.

## What you get back

Given a core and two graph plugins, the generated file contains:

**One interface per contributor**, listing the resolver sets that
contributor owes:

```go
// WhatsappGraphResolvers lists the resolver sets the whatsapp plugin contributes to the graph.
type WhatsappGraphResolvers interface {
	ContactResolvers() whatsapp.ContactResolvers
	MutationResolvers() whatsapp.MutationResolvers
	QueryResolvers() whatsapp.QueryResolvers
}
```

This is where the compiler does the checking. A plugin claiming
`graphql` that forgets a set no longer satisfies its interface, and
the build stops.

**A merged struct for every shared type.** When the core and a
plugin both add fields to `Mutation`, both resolver sets are
embedded in one struct, so the graph sees a single `Mutation`
resolver made of both halves.

**`FromPlugins`**, which assembles everything:

```go
func FromPlugins(core CoreGraphResolvers, plugins []sdk.Plugin) (graph.ResolverRoot, error)
```

Give it your core resolvers and the plugins your binary registered.
It walks the list, picks out the ones that satisfy each graph
interface, and returns the finished `ResolverRoot`:

```go
root, err := graphroot.FromPlugins(coreResolvers, registered)
if err != nil {
	return err
}
```

Notice that it searches the list rather than being told which plugin
is which. That is what keeps the ordering of your plugin
registration a detail the graph does not care about.

If a plugin the schema expects is missing from the list,
`FromPlugins` returns an error naming it. The alternative would be
serving a graph whose fields have no resolver behind them.

## How it fits the rest of the wiring

The [plugin generator](/plugins/wiring-and-manifests/) gives you
`registerPlugins`, which returns every plugin your binary compiled
in. Hand that same slice to `FromPlugins` and to the
[host](/plugins/host-lifecycle/):

```go
registered, err := registerPlugins(sdk.Deps{DatabaseURL: url, Getenv: os.Getenv})
if err != nil {
	return err
}

root, err := graphroot.FromPlugins(coreResolvers, registered)
if err != nil {
	return err
}

host := pluginkit.NewHost(registered...)
```

Adding a GraphQL plugin is then the same as adding any other: a
directory, a manifest, and a rerun of the generator.
