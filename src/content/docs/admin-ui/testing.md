---
title: Testing
description: The test setup a design system app needs, and how to assert what it announces.
---

The design system expects a real browser, and the simulated one
most test runners use, jsdom, is missing pieces it calls. Without
help, otherwise fine component tests throw in confusing places.
`@gopherium/godmin/testing` fills the gaps. Call it once from your
test setup file:

```ts
import { installTestEnvironment } from '@gopherium/godmin/testing'

installTestEnvironment()
```

`@testing-library/react` and `vitest` are optional peer
dependencies, needed only for this entry point.

## What it installs

Three browser APIs jsdom leaves out, each of which throws when a
component calls it:

- `window.matchMedia`, used by any component that reads a media
  query.
- `CSS.supports`, called while a dialog locks body scroll. Without
  it, opening a menu that leads to a dialog throws.
- `ResizeObserver`, the element resize API.

It also clears the rendered tree after each test. A runner
configured without globals never registers that cleanup itself, so
trees would pile up and a test could find an element some earlier
test rendered.

## Announcements

The design system talks to screen readers through `@wordpress/a11y`,
which adds two live regions and an intro paragraph to the page
body. In a test this breaks two things. A query for text that was
also announced finds two elements instead of one. And the last
announcement of one test is still in the DOM during the next.

`installTestEnvironment` fixes both. Queries skip the announcement
elements, and they are emptied after each test.
`WPDS_IGNORE_SELECTOR` is the selector used for the skipping,
exported in case you configure queries of your own.

Since queries can no longer see announcements, read them directly
when a test needs one:

```ts
import { getAnnouncement } from '@gopherium/godmin/testing'

speak('Draft saved')
expect(getAnnouncement()).toBe('Draft saved')
```

`getAnnouncement()` reads polite announcements, and takes
`'assertive'` for urgent ones. `clearAnnouncements()` empties both,
for a test that must assert nothing was announced.

## Rendering inside the host

`renderAdmin` renders a tree wrapped in `AdminRoot`, so components
that read design tokens behave like they do in the application. It
accepts the usual testing library options plus the host theme
settings, and returns the normal render result. It supplies the
wrapper itself, so do not pass a `wrapper` of your own.

## Simulating a small screen

jsdom evaluates no media queries, so a component asking "is this a
small screen?" always hears no. `setViewport` changes the answer:

```ts
import { setViewport } from '@gopherium/godmin/testing'

setViewport({ matches: true })
```

Every media query now matches, listeners are told, and components
re-render. That is how a test renders
[the narrow shell](/admin-ui/framing-an-application/). The setting
resets itself before the next test.

Note that it is one global yes or no, not a width. Every query
reports the same answer, so a component that distinguishes two
breakpoints in a single render cannot be tested this way.

## Checking a design system look

The design system class names change between releases, so a test
should not type them. `textClasses`, `badgeClasses` and
`buttonClasses` draw a text, a badge or a button and answer the
classes it got. Compare your element with them:

```ts
import { badgeClasses, buttonClasses } from '@gopherium/godmin/testing'

expect([...badge.classList]).toEqual(badgeClasses('none'))
expect([...button.classList]).toEqual(buttonClasses('solid', 'compact'))
```

They take the variant, the intent, and for a button the size.

## Checking the element package on React 19

`@wordpress/element` 8.4.0 and older do not load on React 19. The
design system versions godmin supports install a newer one. This
test fails if an old copy comes back:

```ts
import { assertElementPatched } from '@gopherium/godmin/testing'

test('element works on React 19', async () => {
	await assertElementPatched()
})
```

The assertion checks that the APIs React 19 removed are gone and
that `createRoot` and `createPortal` are still there. By default it
imports `@wordpress/element` itself. Pass a loader to point it at a
specific copy. The name comes from when a patch was needed.
