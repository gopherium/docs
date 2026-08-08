---
title: Overview
description: What godmin is, what it ships, and the two lines of setup that get an admin app running.
---

`@gopherium/godmin` is the base layer for a React admin application
built on the WordPress Design System (WPDS). It takes care of the
groundwork such an application needs before its first screen can
render: loading the design tokens, ordering the CSS, keeping
overlays on top, and preparing your bundler and your test runner.

Why does that layer exist at all? The design system already ships
most of what an admin application is made of:

| Layer | What it is | Package |
| --- | --- | --- |
| Design tokens | Named values for colors, spacing and type | `@wordpress/theme` |
| Primitives | Buttons, menus, dialogs, text | `@wordpress/ui` |
| Data screens | Ready made list and table views | `@wordpress/dataviews` |
| Page chrome | The bars and panels around a page | `@wordpress/admin-ui` |

Inside WordPress, the glue underneath those packages comes from
WordPress itself, through PHP and `@wordpress/boot`. An application
that is not WordPress gets nothing, and ends up hand-writing that
glue. godmin is the glue as a package, and nothing more. It never
duplicates something the packages above already ship.

## The entry points

| Entry point | Contents |
| --- | --- |
| `@gopherium/godmin` | `AdminRoot`, `Frame`, `Page`, `PageTitle`, `NavScreen`, `ErrorNotice`, `LoadMore`, `LoadingScreen`, `LoadingRows`, `Toaster`, `useToaster`, `useMediaQuery`, `useTokenDocument`, the breakpoints, `SUPPORTED_WPDS` |
| `@gopherium/godmin/base.css` | Cascade layer order, design tokens, host rules, frame and screen styles |
| `@gopherium/godmin/router` | `useCanvas`, `useFrameLocation`, the `canvas` route static data |
| `@gopherium/godmin/testing` | `installTestEnvironment`, `renderAdmin`, `setViewport`, `getAnnouncement`, `clearAnnouncements`, `assertElementPatched`, `WPDS_IGNORE_SELECTOR` |
| `@gopherium/godmin/vite` | `godminDedupe`, `godminSingleCopy`, `duplicateCopies` |
| `@gopherium/godmin/stylelint` | The design system stylelint rules |
| `@gopherium/godmin/patches/*` | The React 19 patch file for `@wordpress/element`, copied at install time, temporary |

All the design system packages are peer dependencies. A peer
dependency is a package your application installs and pins itself.
You stay in control of the exact design system versions you run,
and godmin never redistributes them.

## Setup

Install:

```sh
pnpm add @gopherium/godmin
```

Then import the stylesheet once at your entry point and mount
`AdminRoot` around your tree:

```tsx
import '@gopherium/godmin/base.css'
import { AdminRoot } from '@gopherium/godmin'

createRoot(document.getElementById('app')!).render(
	<AdminRoot>
		<YourApp />
	</AdminRoot>,
)
```

That is the whole setup. Here is what those two lines do for you:

- Load the design tokens. You do not import
  `@wordpress/theme/design-tokens.css` yourself.
- Declare the CSS cascade layers in the order `wp-ui, godmin`. A
  cascade layer decides which stylesheet wins when two rules
  disagree, and this order lets godmin's rules build on the design
  system's.
- Isolate a stacking context. In plain words: popovers and dialogs
  will draw above your page instead of behind it.
- Enable the overlay slot that lets design system overlays stack
  above `@wordpress/components` ones.

`AdminRoot` also accepts the `color`, `cursor` and `cornerRadius`
theme settings, which it hands to the design system theme provider,
and `as` for when the host element should be something other than a
`div`.

## Changing the page appearance

`base.css` sets the page font, color and background from design
tokens. It does so inside the `godmin` CSS layer, and a rule inside
a layer loses to any plain rule outside one. So to change how the
page looks, write an ordinary rule in your own stylesheet and it
wins. No `!important`, no specificity tricks.

Two notes:

- One rule intentionally sits outside the layer:
  `body { position: relative }`. Overlays position themselves
  against it, so overriding it breaks their backdrops. Leave it in
  place.
- The documented class names on the [screens
  page](/admin-ui/screens/#stylesheet-helpers) are the stable
  styling seam. The stylesheet's other class names, such as the
  frame internals, are not, and can change in any release.

If you declare CSS layers of your own, include godmin's in your
order:

```css
@layer wp-ui, godmin, my-app;
```

## Styling an iframe or a popup

The design system injects its styles into the current document
only, so an iframe or a popup window starts out unstyled.
`useTokenDocument` registers the extra document and keeps it
supplied with styles, which is what an embedded editor canvas
needs:

```tsx
useTokenDocument(iframeRef.current?.contentDocument)
```

It accepts `null` and `undefined`, so you can call it before the
iframe exists.

## Where it sits

godmin is a TypeScript brick, unlike its Go siblings
[authkit](/authentication/overview/) and
[pluginkit](/plugins/overview/). It pairs with
[`@gopherium/react-auth`](/authentication/react-integration/),
whose login and user screens are built from the same design system.

Read [framing an application](/admin-ui/framing-an-application/)
next for the layout. And read
[build configuration](/admin-ui/build-and-versioning/) before your
first build, because the two install problems it covers are much
easier to avoid than to debug.
