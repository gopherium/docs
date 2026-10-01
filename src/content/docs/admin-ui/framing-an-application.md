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

## The canvas on a wide screen

On a wide screen the canvas is a panel 16px from the top, right and
bottom of the window. On the rail side it has no margin of its own,
because the rail's 16px padding already parts the two, so the gap
from the rail's highlighted item to the panel is 16px as well. The
WordPress Site Editor frames its canvas the same way. When no rail
is on screen, the panel keeps its 16px on that side too.

## What happens on a small screen

- Below 1024px the rail goes away. In its place you get a top bar,
  and its menu button opens your same navigation in a drawer that
  slides in.
- Below 782px the canvas stretches to the screen edges, with no
  margin, no rounded corners and no shadow, the way a WordPress
  admin page meets the screen at that width.
- Below 640px the canvas also uses tighter padding, 16px instead of
  24px on each side.

The top bar is 46px tall, like the WordPress admin bar on a phone.
Its menu button is drawn like the admin bar menu toggle: three bars,
28px wide and 4px thick, in a 52px wide button at the start of the
bar. The bars take the text colour of the chrome theme at 60%, so
they follow your chrome colour and light up under the pointer. The
admin bar draws its icons in a fixed bluish white at 60%, which
looks almost the same on a dark bar.

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

The widths are exported, so your own rules can change at the same
points:

| Export | Value |
| --- | --- |
| `RAIL_BREAKPOINT` | `1024` |
| `EDGE_BREAKPOINT` | `782` |
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

The theme provider works out every grey from the background you
give it. The frame paints its chrome with the weak surface of that
theme, so a `#1e1e1e` chrome background draws the rail and the top
bar in `#171717`. The WordPress admin bar is `#1d2327`, a colour of
its own. godmin paints the colour your theme gives and never
replaces it.

The canvas paints the strong surface of its theme, which is white,
like a WordPress page. For the exact WordPress greys, give the canvas
the design system default background, `{ background: '#fcfcfc' }`.
A white background moves every grey a step lighter: the row lines
turn `#f3f3f3` instead of `#f0f0f0`, and muted text `#717171`
instead of `#707070`.

Dialogs, drawers, menus, popovers and selects you open inside the
frame do not take these colors. They use the `AdminRoot` color
instead. Tooltips still follow the frame colors. The navigation
drawer is an exception and keeps `chromeColor`.

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
