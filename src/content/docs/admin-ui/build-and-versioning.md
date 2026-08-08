---
title: Build configuration and versioning
description: Bundler setup, the React 19 patch, stylesheet linting, and how godmin tracks design system versions.
---

This page is the setup checklist for your build:

- make sure shared packages end up in your bundle exactly once
- patch `@wordpress/element` so it loads on React 19
- turn on the design system's stylesheet linting
- know which design system versions godmin supports

The first two are worth doing before your first build. Getting them
wrong stops the application from booting, and the errors you get do
not point at the cause.

## One copy of each shared package

Some packages break when a bundle contains two copies of them. Two
copies of React fail loudly: the first hook call throws. Two copies
of `@wordpress/theme` fail quietly: you get a second theme context
and components that render unthemed.

Duplicates creep in easily, usually because two dependencies pin
slightly different versions of the same package.
`@gopherium/godmin/vite` guards against this in two parts:

```ts
import { godminDedupe, godminSingleCopy } from '@gopherium/godmin/vite'

export default defineConfig({
	resolve: { dedupe: godminDedupe },
	plugins: [godminSingleCopy()],
})
```

- `godminDedupe` lists the packages that must stay single: `react`,
  `react-dom`, `@wordpress/element`, `@wordpress/theme` and
  `@wordpress/ui`. Spreading it into `resolve.dedupe` makes Vite
  always pick one copy of each. It is plain data because Vite only
  reads this setting from your own config file.
- `godminSingleCopy()` is the safety net. At the end of the build
  it checks that each of those five packages resolved to one place,
  and fails the build naming the package and every copy it found.
  Packages outside the list are not checked.

On a bundler that is not Vite or Rollup the plugin does not fit,
but the check itself is exported as
`duplicateCopies(moduleIds, packages)` for wiring into whatever
hook your bundler offers.

Deduping picks one copy at build time, but it cannot stop a second
copy being installed in the first place. `@wordpress/element` up to
8.4.0 declares React 18 as a regular dependency, so a fresh install
puts React 18 right next to your React 19. Close that hole by
pinning React in your `package.json`:

```json
{
  "pnpm": {
    "overrides": { "react": "^19.2.0", "react-dom": "^19.2.0" }
  }
}
```

## The React 19 patch

`@wordpress/element` up to and including 8.4.0 imports APIs that
React 19 removed, so it fails the moment it loads.

The fix is a pnpm patch. Patches apply at install time, before
`node_modules` exists, which is why no npm package can apply one
for you: the patch file has to live in your own repository. godmin
ships the file for you to copy:

```sh
cp node_modules/@gopherium/godmin/patches/*.patch patches/
```

```yaml
patchedDependencies:
  '@wordpress/element@8.4.0': patches/@wordpress__element@8.4.0.patch
```

Then assert the outcome in your test suite with
[`assertElementPatched`](/admin-ui/testing/#asserting-the-react-19-patch)
rather than comparing patch files.

This is temporary. The fix is already merged upstream. Once a fixed
`@wordpress/element` release is the one your design system packages
resolve, the patch goes away, and so does this section.

godmin itself never imports `@wordpress/element` at runtime and
does not constrain its version. That version is chosen by
`@wordpress/ui` and `@wordpress/theme`, which depend on it
directly.

## Linting your stylesheets

`@wordpress/theme` ships three stylelint rules, but you have to
know they exist to turn them on. `@gopherium/godmin/stylelint` is
that configuration, ready to extend:

```js
export default { extends: ['@gopherium/godmin/stylelint'] }
```

It catches three mistakes:

- Using a design token that does not exist. This is the quiet one,
  because a mistyped token does not error in the browser, it just
  renders nothing.
- Redefining a `--wpds-` custom property, which belongs to the
  design system.
- Writing a hand typed fallback value next to a token.

`stylelint` is an optional peer dependency, needed only for this
entry point.

## The design system version window

godmin supports one design system version window at a time. The
`@wordpress/ui`, `@wordpress/theme` and `@wordpress/style-runtime`
peer ranges are written out in full, for example
`>=0.19.0 <0.20.0`, and the window moves with each design system
release train. It never widens, so no godmin release accepts two
incompatible design system generations at once.

Why written out in full: `@wordpress/ui` is below 1.0, and for a
package below 1.0 a caret range such as `^0.19.0` covers only one
minor version. Ranges that look wider than they really are silently
break consumers, so godmin avoids them for the design system.

The window is also exported as a value, so an application can
assert against it:

```ts
import { SUPPORTED_WPDS } from '@gopherium/godmin'
```

## License

godmin is Apache-2.0. The design system packages are
GPL-2.0-or-later, and they are peer dependencies: your application
installs them, and godmin never redistributes them. Your built
bundle combines both, and the bundle is conveyed under the terms of
the WordPress packages. godmin's own source stays plain Apache-2.0.
