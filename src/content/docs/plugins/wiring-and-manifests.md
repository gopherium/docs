---
title: Wiring and manifests
description: The plugin.json manifest and the generator that compiles plugins in.
---

To add a plugin you create a directory under `plugins/` and rerun
the generator. There is no central list of plugins to edit, because
the generator writes it.

## The manifest

Every plugin directory holds a `plugin.json` describing itself:

```json
{
  "id": "webhooks",
  "name": "Webhooks",
  "backend": "github.com/you/myapp/plugins/webhooks",
  "frontend": "@myapp/plugin-webhooks"
}
```

| Field | Meaning |
| --- | --- |
| `id` | Lowercase, matching the directory name, and not a [refused id](#ids-the-generator-refuses) |
| `name` | The human readable name |
| `backend` | The plugin's Go import path |
| `frontend` | The plugin's UI module, if it has one |
| `graphql` | Set to `true` to [extend the GraphQL API](/plugins/graphql-plugins/) |

`backend` and `frontend` are both optional on their own, but a
plugin needs at least one of them.

## The generator

Your application carries a small command of its own: one
`wire.Config` value and one call.

```go
package main

import "github.com/gopherium/framework/pluginkit/wire"

var config = wire.Config{
	SDKImport:    "github.com/you/myapp/sdk",
	FrontendSDK:  "@myapp/frontend-sdk",
	GoWiringPath: "cmd/myapp/plugins_gen.go",
	TSWiringPath: "frontend/src/plugins/index.ts",
	License:      "Apache-2.0",
}

func main() {
	if err := wire.Run(".", config); err != nil {
		panic(err)
	}
}
```

`Run` reads every manifest and writes two files: one Go, one
TypeScript. `License` sets the SPDX header on both, and `TSLicense`,
when set, replaces it on the TypeScript file. Every field is on
[pkg.go.dev](https://pkg.go.dev/github.com/gopherium/framework/pluginkit/wire).

### More than one plugin folder

By default the generator reads `plugins/`. `Roots` names the folders
to read instead, in order:

```go
Roots: []string{"plugins", "extra/plugins"},
```

Each folder is read in full before the next, and an id found in two
folders is an error.

### A registry for tests

Test code sometimes needs every plugin at once, not the wired
application. Set `GoRegistryPath` and `GoRegistryPackage` together
and `Run` writes one more Go file:

```go
GoRegistryPath:    "internal/registry/registry_gen.go",
GoRegistryPackage: "registry",
```

The file holds one function, `All(deps sdk.Deps) ([]sdk.Plugin, error)`,
returning every plugin in registration order. Like `registerPlugins`
below, it still returns the ones that registered when some fail.
Setting only one of the two fields is an error.

### Ids the generator refuses

Each plugin id becomes an import name in the generated files, so a
few ids cannot work there. `Run` stops with an error naming the
manifest when a plugin uses one:

- A plugin with a `backend` cannot use a Go keyword, or `errors`,
  `fmt`, `sdk`, `deps`, `plugins`, `failed`, `err`, `make`,
  `append`, `nil`, `error`, `init` or `main`.
- A plugin with a `frontend` cannot use a JavaScript reserved word
  such as `class` or `let`, or `eval`, `arguments` or `plugins`.

`Reserved` lists more ids that no plugin may take, such as the
names of your own commands. On [`gonsole`](/command-line/plugin-commands/),
pass `gonsole.BaseCommands()` and your own namespaces, and add
`github.com/gopherium/framework/gonsole` to the generator's imports:

```go
Reserved: append(gonsole.BaseCommands(), "account", "report"),
```

An id can also clash with a name your own code declares in the
same package as the generated Go file, such as a function called
`run`. Your compiler reports that one.

## What each plugin must provide

The generator writes calls, and your compiler checks that the
plugins answer them.

The generated Go file calls a function in each backend package:

```go
func Register(deps sdk.Deps) (*Plugin, error)
```

The returned value has to satisfy `sdk.Plugin`. Every result is
gathered into a generated `registerPlugins` function. When some
plugins fail to register, it still returns the ones that did, along
with a single error that names every failure. The file imports your
SDK under the name `sdk`, whatever your package is called.

The generated TypeScript file imports an export named `plugin` from
each frontend module and collects them into a typed array.

## Closing the loop

Your server builds a `Deps`, passes it to the generated
`registerPlugins`, and gives the result to the
[host](/plugins/host-lifecycle/):

```go
registered, err := registerPlugins(sdk.Deps{DatabaseURL: url, Getenv: os.Getenv})
host := pluginkit.NewHost(registered...)
if err != nil {
	return errors.Join(err, host.Stop(ctx))
}
```

When a plugin fails to register, the example still stops the ones
that did, so nothing they built is left behind. On
[`gonsole`](/command-line/plugin-commands/), call
`gonsole.StopHost(ctx, host, stopGrace)` instead of `host.Stop(ctx)`.
It gives the stop its own time limit. The plugins get a context that
has not ended, even when `ctx` has.
