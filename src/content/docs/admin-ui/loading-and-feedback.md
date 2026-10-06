---
title: Loading and feedback
description: Ghost placeholders while data loads, a fade for the content that replaces them, and toasts for messages.
---

While a screen waits for its data, show a ghost: grey shapes where
the content is about to appear. When the data arrives, fade the
real content in. godmin ships both halves, plus the toast region
for short messages.

## The ghosts

`LoadingScreen` stands in for a whole screen. `LoadingRows` stands
in for a list inside a screen whose surroundings are already
visible:

```tsx
if (reports.isPending) {
	return <LoadingRows label="Loading reports." rows={8} />
}
return <ReportTable className="godmin-arrival" />
```

`label` is required on both. Write the sentence you would have
shown as text, like `Loading reports.` Sighted users see the
shapes, and screen reader users hear the label, announced from a
visually hidden status region. The shapes themselves are hidden
from assistive technology.

`LoadingRows` takes `rows`, which defaults to 5. `LoadingScreen`
draws a title bar and three text lines, with no count to set.

## Why a ghost does not appear immediately

A ghost stays invisible for its first 150ms. If the data arrives
faster, which it usually does, the user never sees it. Without that
delay every fast load would flash grey for a moment, and the flash
reads as something being wrong.

The delay lives in the stylesheet, so there is nothing to manage in
your code. Render the ghost from the pending flag and you are done.
No timers, no extra state.

If you are coming from 0.4.0: the `useLoadingGate` hook is gone as
of 0.5.0. It held ghosts on screen for a minimum time after the
data arrived, which made fast screens feel slow. Render from the
pending flag and let the stylesheet do the rest.

## Fading the content in

Give the content that replaces a ghost the `godmin-arrival` class
and it fades in instead of snapping in:

```tsx
return <ReportTable className="godmin-arrival" />
```

The fade is a short opacity ramp with no delay, so the content
starts appearing the moment it is ready. Together with the ghost's
own fade, the swap reads as one motion.

## Toasts

A toast is a short message that confirms something worked, then
removes itself. godmin draws it like the WordPress snackbar: a dark,
slightly see-through box with white 13px text, 32px above the bottom
edge. It sits at the center of the canvas, so beside the rail it
lines up with your content, and it sits at the center of the window
when no rail is on screen.

The numbers are the snackbar's own:

- 12px of padding above and below the text and 20px on each side.
  A one line toast is 42px tall, with or without an action.
- 4px rounded corners and the small WordPress shadow under it.
- As wide as its message, up to 560px. On a screen narrower than
  600px it spans the width, with a 16px gap on each side, and still
  stops at 560px.
- 8px between two toasts on screen at once.
- On a toast with an action, the action sits at least 32px after the
  message and the close button at least 24px after the action. On a
  phone, where the toast spans the width, the snackbar spreads the
  spare room between the three, and godmin does the same.
- The close button is the snackbar's own cross, the ✕ character in
  the toast's text. When a message wraps, the action and the cross
  stay on its first line.
- The action is a white underlined link that loses its underline
  under the pointer. Keyboard focus draws a dotted white line around
  it, and a white inner line with a blue ring around a plain toast,
  as the snackbar does.

On a list page the toast floats over the list footer, as it does in
WordPress.

`Toaster` renders the region that holds the toasts. Wrap your tree
once:

```tsx
<Toaster>
	<YourApp />
</Toaster>
```

Then raise messages from any component inside it:

```tsx
const toaster = useToaster()

toaster.show('Post moved to trash.', { label: 'Undo', onAct: restore })
```

The second argument is optional and adds one action, given as a
`label` and an `onAct` callback. It shows as a white link after the
message. That covers undo, the main reason to offer an action at
all. The handle's type is exported as `ToasterHandle`, for holding
one in a context or a test.

### How a toast behaves

- It stays 6 seconds, then fades out. Every toast keeps its own
  timer, so a toast a screen raises as it mounts leaves on time even
  under React strict mode, which mounts the screen twice in
  development.
- At most three are on screen at once. The newest sits at the
  bottom, and when a fourth arrives the oldest leaves.
- A toast with no action goes away when you click anywhere on it.
  A toast with an action shows a small close button instead, so
  there is never a button inside another button.
- Screen readers hear each message once, politely, through `speak`
  from `@wordpress/a11y`. The toast region itself is not a live
  region, so nothing is read twice.
- When a toast that holds keyboard focus goes away, focus moves to
  the toast region instead of falling back to the top of the page.
  The next Tab carries on from there.
- The fades stop when the system asks for reduced motion.

`@wordpress/a11y` is a peer dependency, so install it next to
godmin. `godminDedupe` lists it, which makes `godminSingleCopy` stop
the build if a second copy slips into your bundle. One copy means
one live region on the page.

`Toaster` takes four props:

- `dismissAfter`, how many milliseconds a toast stays. The default
  is 6000.
- `limit`, how many toasts stay on screen at once. The default is 3.
- `nameLength`, how many characters of a name a toast shows before
  an ellipsis. The default is 45. See
  [naming an item in a toast](/admin-ui/lists/#naming-an-item-in-a-toast).
- `dismissLabel`, the name of the close button. On a toast with no
  action it is the hint a screen reader reads after the message. No
  tooltip shows when the pointer rests on the toast, as in WordPress.
  It defaults to `Dismiss`, and it is the only text godmin puts in a
  toast, so set it if your application is not in English.

### Success toasts, failure notices

Use a toast to confirm a change that worked and could otherwise go
unnoticed: a record saved, a task completed, a file uploaded. Keep
the message short and in the past tense, like `Post moved to trash.`

Never use a toast for a failure. A toast goes away on its own, and
a failure usually needs the user to do something: fix a field, try
again, or read why it failed. Show the failure as an
[`ErrorNotice`](/admin-ui/screens/#errornotice) next to the form or
button it belongs to, so the user sees what failed and where.

Skip the toast in three more cases:

- The next screen already says what happened.
- The user still has to act on the result, like copying a link.
  Keep that on the screen.
- The change happens right under the pointer and repeats fast, like
  moving a row up. A toast for every press piles up.
