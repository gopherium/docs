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

`aside` adds a second column beside the content, for the details
that sit next to a record's main work:

```tsx
<Page title="Invoice 1042" aside={<InvoiceDetails />}>
	<InvoiceLines />
</Page>
```

On a wide page the aside is 320px wide and sits right beside the
content, which keeps a readable width of up to 720px. When the page
is too narrow for both, the aside moves below the content. No
breakpoint decides this, only the page's own width. An aside that
renders nothing takes no room.

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

## RepeatRows

`RepeatRows` edits a list of rows, such as visits with a date and a
note each. Every row gets move up, move down and remove buttons, and
an add button sits under the list.

```tsx
<RepeatRows
	rows={visits}
	onChange={setVisits}
	blank={() => ({ date: '', note: '' })}
	renderRow={(visit, update) => <VisitFields visit={visit} onChange={update} />}
	rowLabel={(at) => `Visit ${at + 1}`}
	labels={{ add: 'Add visit', empty: 'No visits yet.', moveUp: 'Move up', moveDown: 'Move down', remove: 'Remove' }}
	max={10}
/>
```

The list stays yours. The editor shows `rows` and hands every change
to `onChange` as a new array. `min` and `max` only limit remove and
add. They never trim or pad the rows you pass in.

Set the new array right away, not inside `startTransition`. A click
that lands before your render builds on the rows still shown, so the
change before it would be lost.

Keep each row object `onChange` gives you. The editor tells rows apart
by identity, so a row rebuilt as a new object counts as a new row and
its inputs start over.

When a keyboard user removes a row, focus moves to the row that took
its place, or to the row before it when the last row goes. When the
only row goes, focus moves to the add button. When the add button
makes a row, focus moves into it.

`RowControls` is the move and remove buttons alone, and `useRowKeys`
is the hook underneath, for a list that needs its own add step.

## keyFromLabel

`keyFromLabel` turns a label someone typed into a key for code.
`keyFromLabel('Birth date', { style: 'camel' })` answers `birthDate`,
and `kebab` style answers `birth-date`. Accents are dropped, and
letters such as ß and ø are spelled in plain a to z. When the key is
already in `taken`, the first free number is added, so `birthDate`
becomes `birthDate2`.

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
