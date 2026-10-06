---
title: Build configuration and versioning
description: The Vite config godmin needs and the design system versions it supports.
---

Most of what godmin needs from your build is this config:

```ts
import { godminDedupe, godminSingleCopy, godminStylesheetFirst } from '@gopherium/godmin/vite'

export default defineConfig({
	resolve: { dedupe: godminDedupe },
	plugins: [godminSingleCopy(), godminStylesheetFirst()],
})
```

This page explains what each part does, then covers stylesheet
linting and versioning.

## One copy of each shared package

Your bundle must contain exactly one copy of React and of each
package `godminDedupe` lists. Two copies of React crash on the first
hook. Two copies of these fail with no error:

- `@wordpress/theme` renders components unthemed.
- `@wordpress/i18n` renders English. [One copy of the
  runtime](/translations/health/#one-copy-of-the-runtime) explains why.
- `@gopherium/react-auth` keeps a
  [configured transport](/authentication/react-integration/#one-setting-for-the-whole-module)
  that half the app cannot see.

The config handles this twice:

- `godminDedupe` makes Vite resolve each listed package once.
- `godminSingleCopy()` fails the build, naming the package and both
  paths, if a duplicate got through anyway.

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
in full in its peer ranges, for example `>=0.23.0 <0.24.0`. The
window moves forward with the design system and never widens, so no
release accepts two incompatible generations at once.

The window is exported for your tests:

```ts
import { SUPPORTED_WPDS } from '@gopherium/godmin'
```

`SUPPORTED_WPDS` names the `@wordpress/ui` and `@wordpress/theme`
windows only. The other design system peers, `@wordpress/icons`,
`@wordpress/a11y` and `@wordpress/style-runtime`, have their windows
in the peer ranges of godmin's `package.json`.

## Upgrading from godmin 0.7.0

godmin 0.7.0 and older asked you to copy a patch for
`@wordpress/element`. Newer releases support design system versions
that bring `@wordpress/element` 8.7.0 or newer, which needs no patch.

Delete the patch file, its `patchedDependencies` entry and any build
step that copies it. If your `package.json` lists
`@wordpress/element`, move it to 8.7.0 too. A leftover entry makes
`pnpm install` stop with `ERR_PNPM_UNUSED_PATCH`.

## License

godmin is Apache-2.0. The design system packages are
GPL-2.0-or-later and are peer dependencies: your application
installs them, godmin never redistributes them. Your built bundle
combines both and is conveyed under the WordPress packages' terms.
