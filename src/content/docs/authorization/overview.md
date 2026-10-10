---
title: Roles and capabilities
description: What goncierge is, how a program grants capabilities to roles, and what the registry never holds.
---

[`goncierge`](https://pkg.go.dev/github.com/gopherium/framework/goncierge)
answers one question: may this role do this? It keeps a registry of
roles, such as `admin` or `editor`, and the capabilities each one
carries, such as `manage_users`. A capability is the name of one thing
an account may do.

Authentication and authorization are separate bricks.
[`gouncer`](/authentication/overview/) checks who an account is and
stores the name of its role. goncierge decides what that role may
do. If you know WordPress, this is `add_role` and `current_user_can`.

```sh
go get github.com/gopherium/framework/goncierge@v0.1.0
```

## Grant, then ask

```go
registry := goncierge.New()
if err := registry.Grant("core", "admin", "manage_users", "manage_settings"); err != nil {
	return err
}
if err := registry.Grant("core", "member"); err != nil {
	return err
}

registry.Can("admin", "manage_users")  // true
registry.Can("member", "manage_users") // false
```

Always check a capability, never a role name. A check like
`role == "admin"` breaks the day a plugin adds a role that may also
manage users.

## Sources

Every grant belongs to a source: your program's core, or the id of a
plugin. `Withdraw("events")` removes exactly what the `events` plugin
added, and leaves the rest. A role or a capability that two sources
granted stays until both withdraw.

`Revoke(source, role, capabilities...)` removes some capabilities from
one source's grant. Name none, or pass an empty slice, and it removes
the whole grant. So check a slice you build before you pass it.

`Replace(source, roles)` swaps everything one source granted in one
step. Use it to load many grants at once, since each `Grant` rebuilds
the registry's answers.

## Names

Role and capability names are lowercase ASCII letters, digits, `_`,
`.` and `-`. They start with a letter and hold at most 64 characters.
A `Grant` or `Replace` that breaks the rule returns `ErrInvalidName`
and changes nothing.

## Reading the registry

| Method | Answers |
| --- | --- |
| `Can(role, capability)` | whether the role carries the capability |
| `CapabilitiesOf(role)` | every capability the role carries |
| `Roles()`, `Capabilities()` | every role and every capability, sorted |
| `Known(role)` | whether any source created the role |
| `HoldersOf(capability)` | the roles that carry the capability |
| `Outranks(caller, target)` | whether the target exists and the caller carries every capability it carries |
| `Grantable(caller)` | the roles the caller outranks, those with most capabilities first |

`caller` and `target` are role names. `Outranks` and `Grantable`
tell you which roles an account may give: those its own role
outranks. The [account commands](/command-line/account-commands/)
can read their roles from the registry through `RolesFrom`.

`New()` and a plain `var registry goncierge.Registry` both work.
Every method is safe to call from many goroutines at once, and a
check never sees a change half done.

## What it never holds

goncierge stays small on purpose. It does not hold:

- **Role inheritance.** Give a role every capability it needs instead.
- **Several roles per account.** An account holds one role. Keep
  narrower rights, such as moderating one forum, in your plugin's
  own tables.
- **Roles that differ per tenant.** A tenant is one customer that
  shares your program with others. Every tenant sees the same roles.
  Keep the role an account holds in each tenant in your own tables.
- **Rules about one record.** "The author may edit their own post"
  stays Go code in the plugin that owns the post.
- **Storage.** A plugin that keeps roles in its tables loads them
  with `Replace` under its own source when it starts. A plugin that
  also declares roles adds the stored ones to its `Declare` instead.

Next, [Roles from plugins](/authorization/plugin-roles/) shows how a
plugin declares its own roles and capabilities.
