---
title: Screens and the page kit
description: Components for the layout every admin screen repeats, a title, some actions, and the content below.
---

Almost every admin screen has the same top: a title on the left,
maybe a button or two on the right, and the content below. The page
kit is that layout as components, so you stop re-typing it.

Each component's props interface is exported under its own name,
such as `PageProps` and `NavScreenProps`, for when you wrap one in
a component of your own.

## Page

```tsx
<Page title="Reports" actions={<Button>New report</Button>}>
	<ReportTable />
</Page>
```

`title` is required and becomes the page's single `h1` heading.
`subtitle` renders under it, `actions` renders top right, and
`className` and `children` do what they always do.

A screen that fills the canvas edge to edge builds its own layout
and uses `PageTitle` directly, so the page still gets exactly one
`h1`:

```tsx
<PageTitle>Conversations</PageTitle>
```

Pass `variant` to change the text size.

## NavScreen

`NavScreen` renders a drill-down screen: one you enter from a
parent screen and leave again, like a settings subsection.

```tsx
<NavScreen title="Conversations" back={<Link to="/" />}>
	<ConversationList />
</NavScreen>
```

`back` is the link that leads back up. You pass it as an element
rather than a path, because godmin does not know your router. The
kit renders your link with a chevron icon inside it and names it
with `backLabel` for assistive technology.

The remaining props are `description`, `actions` and `footer`. A
region you leave out renders nothing, not even empty spacing.

Two behaviors differ from `Page`:

- The title is an `h2`, not an `h1`, because a drill-down is a
  layer inside a section rather than a new page.
- The title takes keyboard focus when the screen mounts, so a
  screen reader user who followed the link hears where they landed,
  instead of being dropped back at the top of the document.

## ErrorNotice

```tsx
<ErrorNotice>Reports could not be loaded.</ErrorNotice>
```

It renders the design system's error notice and announces the
message to screen readers. Use it wherever you would otherwise
render a bare error string.

## LoadMore

`LoadMore` renders a load more button for a paginated list, and
nothing at all once every page is loaded:

```tsx
<LoadMore query={reports}>Load more reports</LoadMore>
```

`query` needs three members, `hasNextPage`, `isFetchingNextPage`
and `fetchNextPage`, a shape exported as `LoadMoreQuery`. That is
what a TanStack Query infinite query looks like, but nothing here
imports TanStack Query, so any object with those three works. The
button disables itself while a page is loading.

## Stylesheet helpers

`base.css` ships a few classes for layout jobs every admin screen
runs into:

| Class | For |
| --- | --- |
| `godmin-form` | A single column form at a readable width |
| `godmin-empty` | A centered empty state with breathing room |
| `godmin-table` | A full width table with collapsed borders |
| `godmin-table__actions` | The narrow trailing cell holding row actions |
| `godmin-table-scroll` | The box a wide table scrolls inside |

`godmin-table` and `godmin-table-scroll` are a pair, and they solve
a phone problem: a table wider than the screen drags the whole page
sideways. Wrapped like this, the table scrolls inside its own box
instead:

```tsx
<div className="godmin-table-scroll" role="region" aria-label="Reports" tabIndex={0}>
	<table className="godmin-table">…</table>
</div>
```

The scroll rule only activates below 640px. On a desktop the
wrapper does nothing, so you can mark up every table this way.

Two details in that snippet matter:

- `tabIndex={0}` makes the box focusable, so a keyboard user can
  scroll to the columns that are out of view. Without it they
  cannot reach them at all.
- The rule gives the box `position: relative`. Without that,
  absolutely positioned content inside the table escapes the box
  and widens the page, which is the exact bug the wrapper prevents.
