---
title: Calling the plugins that implement a hook
description: Call every plugin that implements one interface, with a recover and a time budget.
---

A hook is a named moment where your application calls every plugin
that implements one interface, such as "a page was saved" or "the page
head is being written". WordPress calls these hooks too, with
`do_action()` and `apply_filters()`. Laravel calls them events and
Django calls them signals.

`pluginkit` gives you two kinds of call:

- An **action** tells each plugin that something happened. `Fire` calls
  the plugins one after another, in the order they were registered.
- A **filter** passes a value through each plugin. `Filter` hands the
  first plugin your value, then hands each next plugin what the one
  before it returned.

## Building a hook

Say your plugins can greet a visitor. You write the interface, and the
plugins that want to greet implement it:

```go
type Greeter interface {
	Greet(ctx context.Context, name string) error
}
```

At boot, build the hook once from your list of plugins. `NewHook` keeps
the plugins that implement `Greeter`, in registration order, and leaves
the others out:

```go
greeting, err := pluginkit.NewHook[Greeter]("greeting", registered, pluginkit.HookSettings{
	Budget:       2 * time.Millisecond,
	TimedFirings: 20,
	Report: func(failure pluginkit.HookFailure) {
		slog.Warn("a plugin failed", "hook", failure.Hook, "plugin", failure.ID, "error", failure.Err)
	},
})
if err != nil {
	return err
}
```

`registered` can be any slice of plugins with an `ID` method, so your
own plugin type works. Every setting is required, and `pluginkit` holds
no default for any of them. `NewHook` refuses an empty name, a budget or
a `TimedFirings` that is not above zero, a nil `Report`, a type
parameter that is not an interface, and two plugins with one id.

Then fire it wherever the moment happens:

```go
greeting.Fire(ctx, func(ctx context.Context, g Greeter) error {
	return g.Greet(ctx, "Maria Perez")
})
```

A filter works the same way. Build a hook such as `titles` over
`TitleChanger` with `NewHook`, like `greeting`, then pass it a value
that comes back out:

```go
type TitleChanger interface {
	ChangeTitle(ctx context.Context, title string) (string, error)
}

title := pluginkit.Filter(ctx, titles, "Hello",
	func(ctx context.Context, c TitleChanger, title string) (string, error) {
		return c.ChangeTitle(ctx, title)
	})
```

A hook with no plugin returns at once and costs nothing.

## When a plugin fails

Each call runs inside its own recover, Go's way to catch a panic. When
a plugin returns an error or panics, the next plugin still runs. In a
filter, the value the failing plugin got goes on to the next plugin
unchanged. A map, a slice or a pointer is shared by the plugins, so a
change a plugin made before it failed stays. Change a copy and return
it.

`Report` receives each error and each panic once, as a `HookFailure`
with the hook's name and the plugin's id. A panic also carries its
stack. The error reads like `pluginkit: search content.changed: index
unavailable`. `Report` can be called from many requests at the same
time, so it must be safe for that. It runs inside the firing, so its
time counts against the firing's budget. Keep it quick, for example by
handing the failure to a channel.

`Report` is your own code, so the hook does not recover it, and it
must not panic. A panic in it leaves `Fire` or `Filter`, the plugins
after the failing one are not called, and the firing's overrun is not
counted.

For an error, `failure.Err` wraps the plugin's own error, so
`errors.Is` or `errors.As` on it runs that plugin's methods outside the
hook's recover. A plugin that returns a nil pointer as its error can
make such a check panic, so recover around it if `Report` inspects
`failure.Err`. Printing a plugin's error or panic never stops the hook
either. A text method that panics shows up as fmt's `%!v(PANIC=...)`
note, and one that panics again while being printed is named by its
type.

## The time budget

One firing gets one budget for all its plugins together, not one per
plugin. Timing every plugin on every firing would cost more than the
firing itself. For 200 plugins that do nothing, a timed firing took
about 13 µs on one machine, against about 1.6 µs untimed.

Go cannot stop a running function, so the budget reaches each plugin
as the deadline of its `ctx`. Database calls and other context-aware
code obey it.

When a slow plugin uses up the budget, the plugins after it are still
called, with the ended context. Work they do in memory still happens.
A plugin whose database write then fails at once is not at fault: an
error that matches the ended context counts as `ContextEnded`, not as
an error of that plugin. Being called does not mean the work
succeeded, so a plugin that misses a write can catch up later, for
example from a job. Such an error reaches `Report` too, with
`failure.ContextEnded` set to true, so you can skip it or log it more
softly. The hook makes this check inside the plugin's recover, so when
the context has ended, an error whose own `Unwrap` or `Is` method
panics counts as a panic of that plugin.

Wrap errors with `%w`. A plugin that writes `fmt.Errorf("write: %v",
ctx.Err())` hides the context's error behind its own text, and is
counted an error.

## Naming the slow plugin

The hook times only the whole firing. When a firing runs over its
budget, the hook counts an overrun, then times each plugin for the next
`TimedFirings` firings. A timed firing whose plugins together run over
the budget is charged to its slowest plugin. A plugin's time covers its
call, the text of its error and the stack of its panic, and leaves out
the time `Report` takes. So a firing that only a slow `Report` pushed
over counts as an overrun of the hook with no plugin charged, and still
times the firings after it.

Two counters on the hook tell that case apart. `UnchargedOverruns`
counts the timed firings that ran over while their plugins together
kept the budget, and `TimedReportTime` adds up the time `Report` took
in timed firings. When `UnchargedOverruns` grows and `TimedReportTime`
is large, your own `Report` is what makes the page late, not a plugin.

The firing that opens this window is not timed itself. So a plugin that
is slow only now and then can raise the hook's overruns while no plugin
is charged yet. Show that as "late, no plugin named yet".

`Stats` returns every counter:

```go
for _, plugin := range greeting.Stats().Plugins {
	if plugin.Overruns > 0 {
		slog.Info("a plugin slows its hook down", "plugin", plugin.ID, "overruns", plugin.Overruns)
	}
}
```

A hook holds a fixed set of plugins. When a plugin is turned on or
off, build a new hook and swap it in through a `sync/atomic.Pointer`.
The counters live on the hook, so read the old hook's `Stats` after the
swap if you want to keep them.
