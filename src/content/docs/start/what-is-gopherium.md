---
title: What is Gopherium
description: A set of composable Go and React building blocks that grow into a framework without ever becoming one.
---

Gopherium is a set of building blocks for products that pair a Go
backend with a React frontend. The ambition is what a full-stack
framework provides. The delivery is deliberately not a framework.

## Bricks, not a framework

Go culture rejects monolithic frameworks for good reasons, and the
successful Go libraries all follow the same pattern: a focused module
that does one thing, adopted independently, composed by the
application. Gopherium follows that pattern on purpose. Each capability
ships as a small, separately versioned module:

- The application owns its `main`, its router, and its wiring.
- Every brick works against the standard library. None of them mounts
  routes, owns configuration files, or dictates project layout.
- Bricks compose through plain interfaces, so replacing one never
  strands the others.

The result reads like a framework in the documentation and like plain
Go in the code.

## Extracted, not designed

Every brick starts its life inside a shipping product. It gets
extracted only after real production use, and only when a second
consumer exists to shape its public API. That discipline keeps the
APIs honest: nothing here is speculative, and every guide on this site
describes code that runs in production today.

## What exists today

Authentication is the first capability on the shelf:

| Brick | What it is |
| --- | --- |
| [`gouncer`](https://pkg.go.dev/github.com/gopherium/gouncer) | Pure authentication primitives: users, passwords, sessions |
| [`authkit`](https://pkg.go.dev/github.com/gopherium/gouncer/authkit) | Session authentication over HTTP |
| [`authkit/postgres`](https://pkg.go.dev/github.com/gopherium/gouncer/authkit/postgres) | The persistence brick, owning its own schema |
| [`authkit/ratelimit`](https://pkg.go.dev/github.com/gopherium/gouncer/authkit/ratelimit) | Login rate limiting behind reverse proxies |
| [`@gopherium/react-auth`](https://www.npmjs.com/package/@gopherium/react-auth) | The React client, from hooks to ready-made screens |

Start with the [Authentication overview](/authentication/overview/),
or jump straight to the [Quickstart](/start/quickstart/).

## How these docs relate to the API reference

This site owns the narrative: what each brick is for, how the pieces
compose, and the operational knowledge that no package can carry. The
bricks' API reference lives where Go and npm developers expect it (i.e. on
[pkg.go.dev](https://pkg.go.dev/github.com/gopherium/gouncer) and in
each package's typed exports). When this site and a godoc disagree, the
godoc wins, and we would like to hear about it.
