---
title: Lists with DataViews
description: Hosting a WordPress DataViews list in a godmin page, paging it on the server, bulk actions, its Spanish chrome, and the table look for lists that stay custom.
---

DataViews is the WordPress list component. It draws the search box,
the filters, the sort menus, the paging and the row actions you know
from the Posts screen. godmin never imports it. Your application
installs `@wordpress/dataviews` and loads its stylesheet, and godmin
makes the list sit well inside a page.

## A list page

Give `Page` the `list` flag when its content is a list:

```tsx
import { Page } from '@gopherium/godmin'
import { DataViews, filterSortAndPaginate } from '@wordpress/dataviews'
import type { View } from '@wordpress/dataviews'
import { useState } from 'react'

export function UsersScreen({ users }: { users: User[] }) {
	const [view, setView] = useState<View>({ type: 'table', titleField: 'name', fields: ['email'] })
	const { data, paginationInfo } = filterSortAndPaginate(users, view, fields)
	return (
		<Page title="Users" list>
			<DataViews
				data={data}
				fields={fields}
				view={view}
				onChangeView={setView}
				paginationInfo={paginationInfo}
				defaultLayouts={{ table: {} }}
			/>
		</Page>
	)
}
```

`fields` describes your columns, as the DataViews documentation
shows. DataViews needs `paginationInfo`, the item and page totals
its paging reads. For a list you hold whole, `filterSortAndPaginate`
searches, sorts and pages it, and answers the page of rows with those
totals. `defaultLayouts` names the layouts a reader may switch to.

DataViews pads its toolbar, its table and its footer by 24px on each
side. The canvas pads its content by 24px as well. Without help the
list starts 48px in, while the title starts at 24px. `list` takes the
content out to the canvas edges, so the list's own 24px lines up with
the title and its row lines run from edge to edge, as they do in
WordPress.

Below 640px the canvas pads by 16px and the list reaches out by 16px.
DataViews keeps its own 24px there, so on a phone a list page pads its
title row by the 8px between the two, and the title still lines up
with the list.

A page with an `aside` keeps its list inside the main column, because
the aside needs its own room.

The canvas names its side padding `--godmin-canvas-gutter`: 24px,
16px below 640px, and none on a full bleed canvas. Its top and bottom
padding is `--godmin-canvas-gutter-block`, 16px. Read them for
anything else that has to line up with the canvas edge.

## The list fills the page

A list page fills the canvas from the title down to the bottom edge.
The DataViews footer, with the item count and the select all box,
rests on the bottom edge of the canvas, the way the list already
reaches the side edges. With a few rows, the rows sit at the top,
the empty space sits under them, and no line closes the last row.
The next line is the footer's own, at the bottom.

When the list is longer than the screen, only the rows scroll. The
title, the tabs, the search box and the column headers stay where
they are, and the footer stays on the bottom edge. A toast floats
over the footer, as it does in WordPress.

A list that is not DataViews, such as a `godmin-table`, grows the
page instead, and the canvas scrolls as it does for any other page.

## Tabs above a list

Give the page `tabs` to show [page tabs](/admin-ui/screens/#pagetabs)
between the title and the list. On a list page the tab labels line up
with the title, the light line under them runs from edge to edge, and
the search box sits 16px under that line, as on a WordPress list. A
notice or a `godmin-table` right under the tabs keeps the same 16px
from that line.

## Notices above a list

Anything you put in a list page before the list itself, such as an
`ErrorNotice`, lines up with the title rather than the canvas edge,
and keeps 16px between itself and the list:

```tsx
<Page title="Users" list>
	{failure === undefined ? null : <ErrorNotice>{failure}</ErrorNotice>}
	<DataViews {...props} />
</Page>
```

## Paging on the server

`filterSortAndPaginate` needs every row in the browser. A long list
asks the server for one page at a time instead. The server needs two
numbers: the limit, how many rows to send, and the offset, how many
rows to skip first. `useServerPaging` works both out from the view:

```tsx
import { Page, paginationOf, useServerPaging } from '@gopherium/godmin'

export function OrdersScreen() {
	const [view, setView] = useState<View>({ type: 'table', page: 1, perPage: 20, fields: ['total'] })
	const paging = useServerPaging(view, 100)
	const { page, asked } = useOrderPage(paging.window)
	paging.record(page, asked)
	return (
		<Page title="Orders" list>
			<DataViews
				data={page?.items ?? []}
				paginationInfo={paginationOf(page)}
				fields={fields}
				view={view}
				onChangeView={setView}
				defaultLayouts={{ table: {} }}
			/>
		</Page>
	)
}
```

`useOrderPage` stands for your own request. On page 3 with 20 rows a
page, `paging.window` is `{ limit: 20, offset: 40 }`. The second
argument is the largest page your server sends. A bigger page size
is held under it. Leave it out when your server has no such limit.

The server answers with the rows, `total`, how many rows match in
all, and `limit`, the page size it used. Hand that page to
`paging.record` and to `paginationOf`, or `undefined` while it has
not arrived. `paginationOf` turns it into the totals DataViews shows.

`useOrderPage` also gives back `asked`, the limit of the request that
got this page. With urql, that is `result.operation?.variables.limit`.
Call `paging.record(page, asked)` in the same component, right after
your request, as the example does.

`paging.record` remembers the page size the server used for that
request. When the server used another size than you asked for, the
next pages step by the size it used, and no row goes missing or shows
twice. An answer to an older request, with another page size, never
changes the step. A view with no `perPage` asks with a `null` limit.
The server then picks the size, and the pages step by it once the
first one arrives.

`pageWindow(view, last, cap)` is the plain function behind the hook,
for code outside a component. `last` is the size the server last sent
together with the size it was asked for, or `undefined` before the
first page.

## Bulk actions

A bulk action runs on every row the reader picked. `runEach` makes one
call per row, all at once, and counts how they went:

```tsx
import { runEach, useToaster } from '@gopherium/godmin'
import type { Action } from '@wordpress/dataviews'

export function useArchiveAction(onFailure: (message: string) => void): Action<Order> {
	const toaster = useToaster()
	return {
		id: 'archive',
		label: 'Archive',
		supportsBulk: true,
		callback: async (orders) => {
			const { asked, done, failures } = await runEach(orders, (order) => archiveOrder(order.id))
			if (done > 0) {
				toaster.show(`Archived ${done} of ${asked}.`)
			}
			if (failures.length > 0) {
				onFailure(`Could not archive ${failures.length} of ${asked}.`)
			}
		},
	}
}
```

The action lives in a hook, because `useToaster` only works inside a
component. The screen passes `onFailure`, which shows the message in
its notice.

`asked` is how many rows `runEach` got and `done` is how many calls
worked. `failures` holds each row that failed with its error, in the
order of the rows. A call fails when its promise rejects, when it
throws, or when it answers an object whose `error` holds an error. An
`error` of `null` or `undefined` counts as done. Many GraphQL clients
report an error that way, so a call can hand back the client's result
as it is. `runEach` itself never fails, so one bad row
never hides the others.

Toast what worked. Show what failed in a notice above the list, as
in the part above, and as
[success toasts, failure notices](/admin-ui/loading-and-feedback/#success-toasts-failure-notices)
explains.

## The canvas colour

The canvas paints the strong surface colour of its theme, which is
white, like a WordPress page. It also sets
`--wp-dataviews-color-background` to that colour, so the list, its
sticky header and its footer stay the same white as the page around
them. You do nothing.

For the exact WordPress greys, give the canvas the design system
default background, `canvasColor={{ background: '#fcfcfc' }}`. The
row lines are then `#f0f0f0` and the muted text `#707070`, as in
WordPress. A white canvas background moves every grey a step
lighter.

## The accent colour

DataViews and `@wordpress/components` draw their accents, such as a
selected row or a focus ring, from `--wp-admin-theme-color`.
`AdminRoot` sets that variable from the `primary` colour you pass it.
It sets it on the document root, so menus and modals that render
outside your tree follow it too.

```tsx
<AdminRoot color={{ primary: '#c9356e' }}>
	<App />
</AdminRoot>
```

## The title field

Name the field that links to the record as the view's `titleField`:

```ts
const view = { type: 'table', titleField: 'name', fields: ['email', 'status'] }
```

DataViews then draws that field with a link that has no underline,
like the Posts list. A link in any other field keeps the browser's
underline.

Name a second field as `descriptionField` to show it under the title,
such as an email address under a name:

```ts
const view = { type: 'table', titleField: 'name', descriptionField: 'email', fields: ['status'] }
```

In a list page godmin sets the pair the way the WordPress subscriber
list does. The title is 13px in the regular weight, and the
description is a 12px muted line 4px under it. A row with both is
64px tall. A title on its own stays centered in a 32px line, level
with the other cells of its row.

## Avatars

`InitialsAvatar` draws a round avatar with the first letter of a
name, in white on a colour the name picks. Use it as the render of
the view's `mediaField`:

```tsx
import { InitialsAvatar } from '@gopherium/godmin'

const avatar = {
	id: 'avatar',
	label: 'Avatar',
	render: ({ item }) => <InitialsAvatar name={item.name} />,
	enableSorting: false,
}
const fields = [nameField, emailField, avatar]
const view = { type: 'table', titleField: 'name', mediaField: 'avatar', fields: ['status'] }
```

It is 32px wide with a 12px semibold white letter, and the name
starts 8px after it, as in the WordPress subscriber list. The capital
of the letter sits in the middle of the circle, as the WordPress
avatar draws it. godmin trims the letter's line to the capital and
the baseline with the CSS `text-box` property, so the letter stays
centred whatever font the page uses. A browser without `text-box`
draws it about a pixel low.

DataViews draws media in a square box with 4px corners and a thin
dark ring. godmin rounds that box and drops the ring when it holds an
avatar, in the table and in the list layout, because the WordPress
avatar has no dark edge. In the list layout the avatar fills the
larger box and its letter grows with it.

On a list page the media of a row sits in the middle of the row. Next
to a title with a description under it, the avatar is level with the
pair, as in the WordPress subscriber list, instead of with the title
alone.

The same name always gets the same colour, whatever its case. The six
colours start with the blue, raspberry and purple of the WordPress
subscriber avatars, then a green, an amber and a grey. All six reach
4.5 to 1 against the white letter, the contrast a screen needs for
small text. The avatar is hidden from screen readers, because the
name next to it already says who it is. It never loads a picture, so
no address leaves your application.

## Lists that stay custom

Some lists cannot be DataViews, such as a list the user orders by
hand with arrows. Keep those a `godmin-table`. It looks like the
DataViews table: 13px text on 20px lines, small capital headers, 12px
of padding in every cell, rows as tall as the DataViews rows, and a
light line between rows. Rows also tint under the pointer and while
keyboard focus is inside them, which DataViews does not do.

Mark the cell that names the record `godmin-table__title`. It draws
the name bold, and in the regular weight inside a list page, where
the DataViews titles are regular too. A link inside it has no
underline and turns the accent colour under the pointer, like a
DataViews title field:

```tsx
<td className="godmin-table__title">
	<Link to="/fields/$id" params={{ id: field.id }}>{field.label}</Link>
</td>
```

Inside a `list` page the table reaches the canvas edges too, and its
first and last cells pad by 24px, as DataViews does. A custom list
and a DataViews list then line up with each other and with the title.

## The list chrome in Spanish

DataViews speaks English until you load its translations. Its words,
such as Search, View options, Items per page and Next page, live in
the WordPress `default` text domain. godmin ships a Spanish catalogue
for them. Add it to the domains you load at startup:

```ts
import { LIST_CHROME_DOMAIN, listChromeCatalogFor } from '@gopherium/godmin'
import { startLocale } from '@gopherium/gottext'

await startLocale(resolveLocale, [
	{ domain: 'myapp', load: myappCatalog },
	{ domain: LIST_CHROME_DOMAIN, load: listChromeCatalogFor },
])
```

`listChromeCatalogFor` answers the catalogue for `es-ES`, and
`undefined` for a language godmin has none for, so those readers keep
the English chrome. The catalogue is its own small module, so a
bundler loads it only for a reader who needs it.

It covers every word DataViews shows around a list: the search box,
the view options, the filters, the column menus, the paging and the
bulk bar. It also covers the two words `@wordpress/components` shows
inside a list, the search reset button and the modal close button. It
does not cover DataForm.

The translations are machine made. They stay marked fuzzy in the
source, `src/list-chrome/es-ES.po` in the godmin repository, until a
translator checks them. A test holds every word against the DataViews
build, so a DataViews release that adds or renames one fails the
godmin tests instead of showing English.

Keep one copy of `@wordpress/i18n` on the page. `godminDedupe` lists
it for Vite. With two copies, the catalogue would land in one while
DataViews reads the other.
