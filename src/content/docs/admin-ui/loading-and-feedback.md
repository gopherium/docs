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

A toast is a short message that appears, waits, and removes itself.
`Toaster` renders the region that holds them. Wrap your tree once:

```tsx
<Toaster>
	<YourApp />
</Toaster>
```

Then raise messages from any component inside it:

```tsx
const toaster = useToaster()

toaster.show('Post moved to trash', { label: 'Undo', onAct: restore })
```

The second argument is optional and adds one action button, given
as a `label` and an `onAct` callback. That covers undo, the main
reason to prefer a toast over a notice. `Toaster` accepts
`dismissAfter` when messages need longer on screen than the
default. The handle's type is exported as `ToasterHandle`, for
holding one in a context or a test.

One rule of thumb: a toast disappears on its own, so never put
something in it the user still has to act on. A failure that
belongs to the screen should be an
[`ErrorNotice`](/admin-ui/screens/#errornotice) instead.
