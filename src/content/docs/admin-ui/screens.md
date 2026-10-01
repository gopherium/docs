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

On a wide page the content keeps a 560px column and the aside takes
the rest of the width, so the aside is the part that grows with the
screen. Put the record's own details in the content and its longer
lists, such as a history, in the aside. When the page is too narrow
for both, the aside moves below the content and both fill the page.
No breakpoint decides this, only the page's own width. An aside that
renders nothing takes no room.

A screen that fills the canvas edge to edge builds its own layout
and uses `PageTitle` directly, so the page still gets exactly one
`h1`:

```tsx
<PageTitle>Conversations</PageTitle>
```

Pass `variant` to change the text size.

## SectionTitle

`SectionTitle` heads a section inside a page, one size step above
the field labels, so a section never reads like another label:

```tsx
<SectionTitle>Identities</SectionTitle>
```

It renders an `h2`. Pass `level={3}` for a section inside a section,
which renders an `h3` a size smaller. `id` and `tabIndex` pass through
to the heading, so a screen can name a list after it or move focus to
it.

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

## LogList

`LogList` shows items one under the other, such as the dated notes
kept on a record. Each `LogItem` has a header line, with a label at
the start and room for actions at the end, then its text, then
anything else you add:

```tsx
<h3 id="notes-heading">Notes</h3>
<LogList aria-labelledby="notes-heading">
	{notes.map((note) => (
		<LogItem
			key={note.id}
			aria-label={`Note from ${note.shownAt}`}
			label={<LogTime dateTime={note.at}>{note.shownAt}</LogTime>}
			actions={
				<Button
					variant="minimal"
					size="compact"
					aria-label={`Edit the note from ${note.shownAt}`}
					onClick={() => edit(note.id)}
				>
					Edit
				</Button>
			}
			body={note.text}
		/>
	))}
</LogList>
```

`aria-labelledby` takes the id of the heading above the list, and
a screen reader names the list after that heading.

`LogTime` shows a date or time as small muted text inside a `time`
element. Give it the value in machine readable form as `dateTime`,
and the words your reader sees as children. godmin formats nothing.

The list keeps your order and never sorts, so pass the newest item
first when the log reads that way. `body` is plain text and keeps its
line breaks. Put anything richer, such as small "Label: value" lines,
in the children under it.

In a narrow column the actions move under the label and stay at the
end of the line. No breakpoint decides this, so the list looks right
in an aside and in the main column alike.

A list with no items takes no room, so show your own empty sentence
beside it. An item with no label and no actions has no header line,
so you can swap a form in as its only child while someone edits it.

An item's `aria-label` names the item, not the buttons inside it. A
screen reader that lists the buttons on the page still shows every
one of them as just Edit. So give each action its own name that says
which item it acts on, as the example does.

The list holds no state. Which item is being edited or waiting for a
confirmation is yours to track, and so is focus.

## RepeatRows

`RepeatRows` edits a list of rows, such as visits with a date and a
note each. Every row sets its inputs on one line with a move up
arrow, a move down arrow and a trash icon at the end, and an add
button sits under the list. In a narrow list the arrows and the
trash drop under the inputs, still at the end. Wrap a row's inputs
in a `godmin-form__row` to set them side by side as well.

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
is the hook underneath, for a list that needs its own add step. The
trash sits a little apart from the arrows, so a press that lands
slightly off does not remove a row.

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
| `godmin-form` | A single column form, up to 560px wide |
| `godmin-form--inline` | A form that is one row, filling its column |
| `godmin-form__row` | Short fields side by side inside a form |
| `godmin-form__grow` | The field of a row that takes most of the free room |
| `godmin-empty` | A centered empty state with breathing room |
| `godmin-table` | A full width table with collapsed borders |
| `godmin-table__actions` | The narrow trailing cell holding row actions |
| `godmin-table-scroll` | The box a wide table scrolls inside |

A form row puts short fields and a button on one line:

```tsx
<form className="godmin-form godmin-form--inline">
	<div className="godmin-form__row">
		<InputControl className="godmin-form__grow" label="Title" />
		<InputControl label="Due date" type="date" />
		<Button type="submit">Add</Button>
	</div>
</form>
```

Each field starts from 160px and they share the rest of the line. The
button keeps its own width. When the line is too narrow, the fields
wrap onto the next line, and a button left alone sits at the end of
its line. A form that is only one row takes `godmin-form--inline`, so
it fills its column instead of stopping at 560px. In a stacked form,
a button keeps its own width instead of stretching across the form.

`godmin-table` and `godmin-table-scroll` are a pair, and they solve
a phone problem: a table wider than the screen drags the whole page
sideways. Wrapped like this, the table scrolls inside its own box
instead:

```tsx
<div className="godmin-table-scroll" role="region" aria-label="Reports" tabIndex={0}>
	<table className="godmin-table">…</table>
</div>
```

The scroll rule only activates below 640px. There the actions
column, the cell marked `godmin-table__actions`, stays pinned to the
right edge, so a row's buttons are in view before any scroll. On a
desktop the wrapper only draws a focus ring when a keyboard user
reaches it, so you can mark up every table this way.

Every `godmin-table` row takes a light tint under the pointer and
while keyboard focus is inside it, so a reader can tell which row a
button belongs to. `RowControls` in the actions cell sit at its right
edge, so they stay put when the column widens.

Two details in that snippet matter:

- `tabIndex={0}` makes the box focusable, so a keyboard user can
  scroll to the columns that are out of view. Without it they
  cannot reach them at all.
- The rule gives the box `position: relative`. Without that,
  absolutely positioned content inside the table escapes the box
  and widens the page, which is the exact bug the wrapper prevents.
