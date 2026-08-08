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
| `id` | Lowercase, and must match the directory name |
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

import "github.com/gopherium/pluginkit/wire"

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
TypeScript. `License` sets the SPDX header on both. Add `TSLicense`
when your frontend ships under a different license than your
backend, and it applies to the TypeScript file only. Every field is
documented on
[pkg.go.dev](https://pkg.go.dev/github.com/gopherium/pluginkit/wire).

## What each plugin must provide

The generator writes calls, and your compiler checks that the
plugins answer them.

The generated Go file calls a function in each backend package:

```go
func Register(deps sdk.Deps) (*Plugin, error)
```

The returned value has to satisfy `sdk.Plugin`. Every result is
gathered into a generated `registerPlugins` function.

The generated TypeScript file imports an export named `plugin` from
each frontend module and collects them into a typed array.

## Closing the loop

Your server builds a `Deps`, passes it to the generated
`registerPlugins`, and gives the result to the
[host](/plugins/host-lifecycle/):

```go
registered, err := registerPlugins(sdk.Deps{DatabaseURL: url, Getenv: os.Getenv})
if err != nil {
	return err
}
host := pluginkit.NewHost(registered...)
```
