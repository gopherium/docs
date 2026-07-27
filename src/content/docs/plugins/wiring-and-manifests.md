---
title: Wiring and manifests
description: The plugin.json manifest and the generator that compiles plugins in.
---

Adding a plugin is a directory under `plugins/` and a rerun of the
generator. No central list is edited by hand.

## The manifest

```json
{
  "id": "webhooks",
  "name": "Webhooks",
  "backend": "github.com/you/myapp/plugins/webhooks",
  "frontend": "@myapp/plugin-webhooks"
}
```

`backend` is the plugin's Go import path, `frontend` its optional UI
module. At least one is required. The `id` is lowercase and must
match the directory name.

## The generator

Your app carries a small command: a `wire.Config` and one call.

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

`Run` reads every manifest and writes the two wiring files.
`License` sets their SPDX header, and `TSLicense` overrides it for
the TypeScript file when your frontend ships under a different
license. Field docs are on
[pkg.go.dev](https://pkg.go.dev/github.com/gopherium/pluginkit/wire).

## The author contracts

The generated Go file calls each backend's
`Register(deps sdk.Deps) (T, error)` where `T` satisfies
`sdk.Plugin`, and collects the results into a `registerPlugins`
function. The generated TypeScript file imports each frontend's
exported `plugin` into a typed array. The generator writes the
calls, the compiler checks the answers.

## Closing the loop

Your server builds a `Deps`, hands it to the generated
`registerPlugins`, and feeds the result to the
[host](/plugins/host-lifecycle/):

```go
registered, err := registerPlugins(sdk.Deps{DatabaseURL: url, Getenv: os.Getenv})
if err != nil {
	return err
}
host := pluginkit.NewHost(registered...)
```
