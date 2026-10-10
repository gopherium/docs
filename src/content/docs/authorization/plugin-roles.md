---
title: Roles from plugins
description: How a plugin declares its roles and capabilities with Declare, and the two rules every declaration follows.
---

A plugin often needs roles and capabilities of its own. An events
plugin might add an `organizer` role that carries `events.manage`.
`Declare` adds them under the plugin's id, and checks two rules first.

## Declare a plugin's roles

Grant the core's roles first. Then declare each plugin's roles.
Declare a plugin before any plugin that reuses its capabilities:

```go
registry := goncierge.New()
if err := registry.Grant("core", "admin", "manage_users", "manage_settings"); err != nil {
	return err
}

rules := goncierge.Rules{Admin: "admin"}
err := goncierge.Declare(registry, rules, "events", []goncierge.Role{
	{Name: "organizer", Capabilities: []string{"events.manage", "events.publish"}},
	{Name: "moderator", Capabilities: []string{"events.publish"}},
})
if err != nil {
	return fmt.Errorf("plugin events: %w", err)
}
```

`Declare` replaces everything the plugin declared before, in one step.
`Withdraw("events")` removes it all when the plugin goes away.

## The prefix rule

A new capability, one no other source granted yet, must start with
the plugin's id and a dot, such as `events.manage`. So two plugins
never claim the same capability by accident.

A plugin may still grant a capability that already exists. The
`events` plugin may give `organizer` the core's `manage_users`, and
a `tickets` plugin declared after it may grant `events.manage`.

So `tickets` depends on `events`. If `events` drops `events.manage`
or goes away, the next `tickets` declaration is refused.

Role names take no prefix. Two plugins that both declare `moderator`
widen one shared role.

## The administrator rule

With `Rules.Admin` set, that role also receives every capability a
plugin declares, so the administrator can always hand out the
plugin's roles. The copy sits under the plugin's id, so `Withdraw`
takes it back too. Another source, usually the core, must create
the administrator role first. Leave `Admin` empty to turn the rule
off.

## When a declaration is refused

A refused declaration changes nothing. Its error names what broke,
and `errors.Is` matches it to one of these:

| Error | When |
| --- | --- |
| `ErrEmptySource` | the plugin id is empty |
| `ErrInvalidName` | a name or the plugin id breaks the [name rule](/authorization/overview/#names), or the id holds a dot |
| `ErrOutsidePrefix` | a new capability lacks the plugin's prefix |
| `ErrUnknownAdmin` | no other source created the administrator role |

On any of them, stop your program and name the plugin in the error.

## Change a plugin's roles only with Declare

A later `Grant`, `Revoke` or `Replace` under a declared plugin's id
skips both rules. Declare again instead.

If your own grants use the source `core`, a plugin with that id
could replace them. Add `core` to the wiring generator's
[`Reserved`](/plugins/wiring-and-manifests/#ids-the-generator-refuses)
list.
