---
title: What is Gopherium
description: A set of composable Go and React building blocks that grow into a framework without ever becoming one.
---

Gopherium is a set of building blocks for products that pair a Go
backend with a React frontend. It aims to give you what a full-stack
framework gives you, without being one.

## Bricks, not a framework

Go developers tend to avoid large frameworks, and the Go libraries
that succeed usually look the same: one module, one job, adopted on
its own, and composed by the application that uses it. Gopherium
follows that pattern deliberately. Each capability is a small module
with its own version number.

In practice that means three things:

- Your application owns its `main`, its router, and its wiring. No
  brick takes those over.
- No brick mounts routes, reads configuration files, or expects a
  particular project layout. The HTTP bricks hand you handlers and
  middleware and let you decide the URLs.
- Bricks talk to each other through ordinary Go interfaces, so
  swapping one out does not strand the rest.

The result reads like a framework in the documentation and like
plain Go in your editor.

## Extracted, not designed

Every brick starts inside a real product. It only becomes a brick
after it has run in production, and only once a second product needs
it, because one consumer is not enough to tell a good API from a
convenient one.

That is a slow way to build a library, and it is the point. Nothing
here was designed speculatively, and every guide on this site
describes code that is running in production today.

## What exists today

Three capabilities are on the shelf.

**[Authentication](/authentication/overview/)** is the largest, and
is five modules so you can stop at whichever layer suits you:

| Brick | What it is |
| --- | --- |
| [`gouncer`](https://pkg.go.dev/github.com/gopherium/gouncer) | Pure authentication primitives: users, passwords, sessions |
| [`authkit`](https://pkg.go.dev/github.com/gopherium/gouncer/authkit) | Session authentication over HTTP |
| [`authkit/postgres`](https://pkg.go.dev/github.com/gopherium/gouncer/authkit/postgres) | The persistence brick, owning its own schema |
| [`authkit/ratelimit`](https://pkg.go.dev/github.com/gopherium/gouncer/authkit/ratelimit) | Login rate limiting behind reverse proxies |
| [`@gopherium/react-auth`](https://www.npmjs.com/package/@gopherium/react-auth) | The React client, from hooks to ready-made screens |

**[Plugins](/plugins/overview/)** lets you build an application out
of compile-time plugins:

| Brick | What it is |
| --- | --- |
| [`pluginkit`](https://pkg.go.dev/github.com/gopherium/pluginkit) | A compile-time plugin host, a wiring generator, and a route guard |
| [`pluginkit/graphwire`](https://pkg.go.dev/github.com/gopherium/pluginkit/graphwire) | Generates a GraphQL resolver root so plugins can extend one graph |

**[Admin UI](/admin-ui/overview/)** is the React side of an admin
application:

| Brick | What it is |
| --- | --- |
| [`@gopherium/godmin`](https://www.npmjs.com/package/@gopherium/godmin) | The base layer for an admin app on the WordPress Design System |

Pick whichever you need, or jump straight to the
[Quickstart](/start/quickstart/), which builds a working login.

## How these docs relate to the API reference

This site explains what each brick is for, how the pieces fit
together, and the operational details that no package can carry
inside itself.

It is not the API reference. Function signatures and types live
where Go and npm developers already look for them, on
[pkg.go.dev](https://pkg.go.dev/github.com/gopherium/gouncer) for
the Go modules and in each npm package's own types.

If this site and the reference ever disagree, the reference is
right, and we would like to hear about it.
