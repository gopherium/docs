---
title: Framing an application
description: The Frame component gives your app a navigation rail and a content canvas, and folds them for small screens.
---

`Frame` gives your application its layout: a navigation column on
the left, called the rail, and a content area beside it, called the
canvas.

```tsx
<Frame.Root location={pathname}>
	<Frame.Rail brand={<HomeLink />}>
		<YourNavigation />
	</Frame.Rail>
	<Frame.Canvas canvas={mode}>
		<YourScreen />
	</Frame.Canvas>
</Frame.Root>
```

A region exists because you render its element. There is no
`showRail` flag, so an application without navigation simply does
not render a `Frame.Rail`.

Every component's props interface is exported under its own name,
`FrameRootProps`, `FrameRailProps` and `FrameCanvasProps`, for when
you wrap one in a component of your own.

## What happens on a small screen

- Below 1024px the rail goes away. In its place you get a top bar,
  and its menu button opens your same navigation in a drawer that
  slides in.
- Below 640px the canvas also stretches to the screen edges and
  uses tighter padding.

You write the navigation once. The rail and the drawer render the
same `Frame.Rail` children.

Two `Frame.Rail` props exist for that top bar:

- `brand` is a small element such as a home link, shown beside the
  menu button. The top bar only exists on a small screen, so
  `brand` is not rendered at all on a wide one. Do not make it a
  heading: each screen owns the single `h1` on the page, and
  [`Page`](/admin-ui/screens/) renders it.
- `menuLabel` is the accessible name of the menu button and of the
  drawer it opens. It defaults to `Open navigation`, so set it when
  your application speaks another language.

The two widths are exported, so your own rules can change at the
same points:

| Export | Value |
| --- | --- |
| `RAIL_BREAKPOINT` | `1024` |
| `DENSE_BREAKPOINT` | `640` |
| `SMALL_VIEWPORT` | `(max-width: 1023px)` |

`useMediaQuery` answers any media query and re-renders your
component when the answer changes:

```tsx
const small = useMediaQuery(SMALL_VIEWPORT)
```

## The frame does not know your router

`Frame.Root` takes `location` as a plain string, and the only thing
it does with it is close the drawer when the string changes. That
is enough: click any link, the URL changes, the drawer closes. It
works for links a plugin added too, because nothing has to be
registered. This is also why the main entry point imports no
router.

## Coloring the regions

`chromeColor` sets the theme color of the whole frame, and
`canvasColor` overrides it for the canvas only. Note the nesting:
setting `chromeColor` alone tints the canvas too, because the
canvas inherits from the frame. Set both when the rail and the
canvas should differ. Each accepts the same color values as the
design system theme provider.

## Two canvas modes

`Frame.Canvas` takes `canvas`, typed as `CanvasMode`, with two
values:

- `padded`, the default, gives your screen comfortable padding.
- `bleed` removes it, for a screen that manages its own edges, such
  as a full height table or a two pane chat view.

## Letting routes choose the canvas

With TanStack Router, `@gopherium/godmin/router` lets each route
declare the canvas it wants:

```tsx
createRoute({ path: 'threads/$id', staticData: { canvas: 'bleed' } })
```

Read the declarations back with two hooks:

```tsx
const mode = useCanvas()            // hand this to Frame.Canvas
const pathname = useFrameLocation() // hand this to Frame.Root
```

When routes nest, the deepest match that declares a canvas wins,
and a route that declares nothing inherits from the routes above
it. So a section can declare `bleed` once and every screen inside
it gets it, and one child can still declare `padded` to opt back
out. Only when no matched route declares anything does `useCanvas`
fall back to `padded`.

`@tanstack/react-router` is an optional peer dependency, needed
only for this entry point. The main entry point never imports it,
so an application on another router just passes `location` itself.
