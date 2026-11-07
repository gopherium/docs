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
| `frontend` | The npm package name of the plugin's UI module, the same as the `name` in its own `package.json`, if it has one |
| `graphql` | Set to `true` to [extend the GraphQL API](/plugins/graphql-plugins/) |

`backend` and `frontend` are both optional on their own, but a
plugin needs at least one of them. A `screens` module, below, does
not count as either.

### Data about the plugin

A manifest can say more about the plugin than where its code lives.
Your application can read these keys and use them, for example to show
a plugin's version or to draw its settings form. Every key is optional,
and the generated wiring reads none of them:

```json
{
  "id": "events",
  "name": "Events",
  "backend": "github.com/you/myapp/plugins/events",
  "version": "2.0.0",
  "license": "Apache-2.0",
  "requires": { "app": ">=0.31.0", "shop": "^2.1" },
  "engines": ["postgres", "sqlite"],
  "hooks": ["content.changed"],
  "defines": ["shop.order-placed"],
  "jobs": [{ "name": "forget-old", "every": "24h" }],
  "settings": [{ "key": "max_seats", "type": "count", "default": "4", "min": 1 }],
  "menu": [{ "label": "Reservations", "screen": "reservations", "capability": "events.manage" }],
  "screens": "@myapp/plugin-events/screens",
  "screen_capabilities": { "seats": "events.manage" }
}
```

A hook here is a named moment, such as `content.changed`, where one part
of your application lets plugins run their own code.

| Key | Shape | An example of what it can mean |
| --- | --- | --- |
| `version` | String | The version of this release |
| `license` | String | An SPDX expression such as `Apache-2.0` |
| `did` | String | The package's identity once it is published |
| `requires` | Object of strings | The version ranges this plugin needs, of your application or of other plugins |
| `tested` | String | The newest version of your application it was tested with |
| `engines` | List of strings | The database engines its tables work on |
| `uninstall` | `true` or `false` | Whether deleting the plugin may drop its tables |
| `hooks` | List of strings | The hooks this plugin implements |
| `defines` | List of strings or objects | The hooks this plugin offers to others. An object needs `hook`, and can add `kind` to say whether it is an action or a filter, and `fires` to say when it fires, such as on a request or from a job. A plain string `"x"` means `{"hook": "x"}` |
| `jobs` | List of objects | Scheduled jobs. Each one needs `name` and `every` |
| `settings` | List of objects | The plugin's settings. Each one needs `key` and `type`, and can add `default`, `label` and `help` as strings, `min` and `max` as numbers, `options` as a list of strings with the answers of a choice setting, and `of` as a string naming the content type a picker setting offers |
| `menu` | List of objects | Admin menu entries. Each one needs `label`, `screen` and `capability`, and can add `parent` and `icon` as strings and `position` as a whole number |
| `screens` | String | The module your admin imports only when one of the plugin's screens opens, see [admin screens that load when opened](#admin-screens-that-load-when-opened) |
| `screen_capabilities` | Object of strings | The capability each screen needs when no menu entry names it |

`pluginkit` checks the shape of these keys and nothing more. It stops
with an error naming the manifest when a key has the wrong JSON type,
when a required key is missing or empty, or when a list holds an empty
string. A screen name must be one path segment, with no `/`. Two menu
entries may open one screen only when they ask for the same capability,
and `screen_capabilities` may not name a screen that a menu entry
names, because that screen takes the entry's capability. For example,
`pluginwire: plugins/events/plugin.json: jobs[0]: every is required`.
A `null` counts as leaving the key out, and inside `requires` it reads
as an empty range. What the values mean is up to your application.
`pluginkit` never checks that `2.0.0` is a valid version or that `24h`
is a valid interval.

Any other top-level key stays in the manifest's `Extra` field as raw
JSON. So your application can add keys of its own, and `graphql` works
this way. A later `pluginkit` release can give a key its own field. That
key then leaves `Extra` with no compile error, and the changelog names
it, so start your own keys with a prefix, such as `myapp_screens`. A key
inside a `jobs`, `settings` or `defines` entry that the table does not
list is dropped. The keys in the table match in any case, so `Version`
counts as `version`, while an `Extra` key keeps the spelling the manifest
used. Do not repeat a key. A repeated key can merge with the one before
it, and the check sees only the merged result.

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

`Run` reads every manifest and writes one Go file and one TypeScript
file, plus the optional registry, dependency list, screens map and index
described below.
`License` sets the SPDX header on the Go and TypeScript files, and
`TSLicense`, when set, replaces it on the TypeScript file. Every field is on
[pkg.go.dev](https://pkg.go.dev/github.com/gopherium/framework/pluginkit/wire).

### More than one plugin folder

By default the generator reads `plugins/`. `Roots` names the folders
to read instead, in order:

```go
Roots: []string{"plugins", "extra/plugins"},
```

Each folder is read in full before the next, and an id found in two
folders is an error.

### Reading the manifests yourself

To check keys of your own, read the manifests before you generate the
wiring. `checkOwnKeys` is your own function, and this program also
imports `fmt`:

```go
func main() {
	manifests, err := wire.Load(".", []string{"plugins"}, config.Reserved)
	if err != nil {
		panic(err)
	}
	for _, manifest := range manifests {
		if err := checkOwnKeys(manifest.Extra); err != nil {
			panic(fmt.Errorf("plugin %s: %w", manifest.ID, err))
		}
	}
	if err := wire.Run(".", config); err != nil {
		panic(err)
	}
}
```

`Load` reads every plugin under the folders you name, in order, with the
same checks as `Run`. Name the same folders as `Roots`. `Load` has no
default, so an empty list stops with
`wire: Load needs at least one root`. `Extra` is a
`map[string]json.RawMessage`, so look a key up with `ok` before you
decode it, because a plugin that left it out has nothing to decode.

To read one plugin from somewhere that is not a folder of plugins, such
as an unpacked archive, pass its files to `wire.Read`:

```go
manifest, err := wire.Read(os.DirFS("/tmp/unpacked-plugin"))
```

`Read` checks the manifest on its own and returns the same errors
without the path. It cannot compare the id with a folder name or know
which ids your application reserves, and it does not check the
[ids the generator refuses](#ids-the-generator-refuses). `Load` and
`Run` make those checks once the plugin sits in a plugin folder.

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

### The frontend dependency list

The generated TypeScript file imports each plugin's frontend, and
pnpm only finds it when your app's `package.json` lists it. Set
`PackageJSONPath` and `Run` keeps that list for you:

```go
PackageJSONPath: "frontend/package.json",
```

`Run` writes every plugin frontend, and the package of every `screens`
module, under `dependencies` as `"workspace:*"`, sorted by name, and
records the names it wrote under a top-level `pluginwire` key. On the
next run it drops a recorded name that no manifest names any more. A
dependency you add yourself is never touched, so leave the `pluginwire`
key to the generator. Every other key keeps its place, and the file is
written with tabs and a final newline. A missing or malformed
`package.json` stops `Run` before it writes anything.

`Run` does not touch the lock file. Run `pnpm install` after you add
or remove a plugin, and check that your pnpm workspace includes each
plugin's frontend folder.

### Admin screens that load when opened

The generated TypeScript file imports every plugin's frontend as soon
as your admin opens, so 200 plugins make that first download heavy. A
plugin can name its admin screens in `screens` instead. That module's
default export maps each screen name to the component that draws it.
Set `TSScreensPath` and `Run` writes one more TypeScript file:

```go
TSScreensPath: "frontend/src/plugins/screens.ts",
```

The file maps each plugin that names `screens` to a function that
imports that module, in wiring order:

```ts
export const screens: Readonly<Record<string, () => Promise<unknown>>> = {
	"events": () => import("@myapp/plugin-events/screens"),
}
```

Nothing downloads until your admin calls one of these functions, and a
bundler such as Vite builds each plugin's screens into a file of its
own. When no plugin names `screens`, the map is empty. A plugin can
keep its `frontend` while it moves its screens, and both still load.

With `PackageJSONPath` set, the package a `screens` module comes from,
such as `@myapp/plugin-events` for `@myapp/plugin-events/screens`,
joins the dependency list too. A `screens` value that names no package,
such as `./screens`, then stops `Run` before it writes anything,
because there is no package to list.

Each menu entry names one screen of the module and the capability a
person needs to see the entry and open its screen. A screen no menu
entry names, such as a detail page opened from a button, takes the
capability `screen_capabilities` names for it. Your admin should show
no access on a screen that has neither.

### An index of every manifest

Your server binary ships without the plugin folders, so it cannot read
a `plugin.json` when it boots. Set `ManifestIndexPath` and `Run` writes
every manifest into one JSON file, in wiring order:

```go
ManifestIndexPath: "internal/plugins/index.json",
```

The folder must already exist. Your server embeds the file and reads it
back when it starts:

```go
package plugins

import (
	_ "embed"
	"encoding/json"

	"github.com/gopherium/framework/pluginkit/wire"
)

//go:embed index.json
var index []byte

// Manifests returns every manifest in the index.
func Manifests() ([]wire.Manifest, error) {
	var loaded []wire.Manifest
	err := json.Unmarshal(index, &loaded)
	return loaded, err
}
```

Put this file in the same folder as `index.json`, and run the generator
once before the first build, because Go reads `index.json` while it
compiles.

The file uses the same keys as `plugin.json`, with `Extra` keys beside
the others. A key the manifest left out stays out, and so does an empty
list or object under a key in the table, so check those with `len`, not
against `nil`. Each entry of `defines` is always an object. Rerun the
generator when a manifest changes, so the index and the wiring come from
the same run.

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
