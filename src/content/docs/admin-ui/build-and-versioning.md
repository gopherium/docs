---
title: Build configuration and versioning
description: The Vite config godmin needs, the React 19 patch, and which design system versions it supports.
---

Most of what godmin needs from your build is this config:

```ts
import { godminDedupe, godminSingleCopy, godminStylesheetFirst } from '@gopherium/godmin/vite'

export default defineConfig({
	resolve: { dedupe: godminDedupe },
	plugins: [godminSingleCopy(), godminStylesheetFirst()],
})
```

This page explains what each part does, then covers the React 19
patch, stylesheet linting, and versioning.

## One copy of each shared package

Your bundle must contain exactly one copy of React and of each design
system package. Two copies of React crash on the first hook. Two
copies of `@wordpress/theme` or `@gopherium/react-auth` fail
silently: components render unthemed, or a
[configured transport](/authentication/react-integration/#one-setting-for-the-whole-module)
that half the app cannot see.

The config handles this twice:

- `godminDedupe` makes Vite resolve each of those packages once.
- `godminSingleCopy()` fails the build, naming the package and both
  paths, if a duplicate got through anyway.

One duplicate Vite cannot prevent: `@wordpress/element` up to 8.4.0
installs its own React 18 next to your React 19. Close that hole by
pinning React:

```json
{
  "pnpm": {
    "overrides": { "react": "^19.2.0", "react-dom": "^19.2.0" }
  }
}
```

## Paint sooner

Nothing renders until your stylesheet arrives, and bundlers request
it after the JavaScript. `godminStylesheetFirst()` moves it first.

How much that helps depends on how much JavaScript competes with it.
In one app with eight preloads it cut the blank page from 1.9s to
1.3s. In another with two preloads it changed nothing, because
nothing was queueing. It costs nothing at runtime, so leave it on
and let it matter as your bundle grows.

On a bundler that is not Vite or Rollup, the underlying functions
`duplicateCopies` and `hoistStylesheet` are exported so you can wire
both checks into whatever hooks it offers.

## The React 19 patch

`@wordpress/element` up to 8.4.0 does not load on React 19. The fix
is a pnpm patch, and it has to live in your repository, because pnpm
applies patches before `node_modules` exists. Copy godmin's:

```sh
cp node_modules/@gopherium/godmin/patches/*.patch patches/
```

```yaml
patchedDependencies:
  '@wordpress/element@8.4.0': patches/@wordpress__element@8.4.0.patch
```

Then assert the outcome in your tests with
[`assertElementPatched`](/admin-ui/testing/#asserting-the-react-19-patch).
This is temporary: the fix is merged upstream, and once a fixed
release ships, the patch goes away.

## Lint your stylesheets

`@wordpress/theme` ships three stylelint rules. This turns them on:

```js
export default { extends: ['@gopherium/godmin/stylelint'] }
```

They catch design tokens that do not exist (a typo renders nothing,
with no error), redefined `--wpds-` properties, and hand typed
fallback values.

## Design system versions

Each godmin release supports one design system window, written out
in full in its peer ranges, for example `>=0.19.0 <0.20.0`. The
window moves with each design system release and never widens, so no
release accepts two incompatible generations at once.

The window is exported for your tests:

```ts
import { SUPPORTED_WPDS } from '@gopherium/godmin'
```

## License

godmin is Apache-2.0. The design system packages are
GPL-2.0-or-later and are peer dependencies: your application
installs them, godmin never redistributes them. Your built bundle
combines both and is conveyed under the WordPress packages' terms.
