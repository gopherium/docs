---
title: Overview
description: How five bricks divide authentication work, and which ones your app needs.
---

Gopherium's authentication is five bricks with one dependency
direction. Each layer consumes the one below it and none of them knows
your application exists.

```text
@gopherium/react-auth      React client: gate, hooks, screens, test harness
        │  speaks JSON to
authkit                    HTTP transport: handlers, middleware, cookie
        │  persists through
authkit/postgres           gouncer.Store in a schema of its own
        │  implements
gouncer                    pure primitives: users, passwords, sessions

authkit/ratelimit          wraps the login route, independent of all of them
```

## The division of labor

**[`gouncer`](https://pkg.go.dev/github.com/gopherium/gouncer)** is
the pure core: validated user construction, argon2id password hashing
and verification, session issuance, token hashing, and the `Store`
interface with its sentinel errors. Its dependencies are the standard
library, `google/uuid`, and `golang.org/x/crypto`, enforced by a lint
rule. It owns none of your HTTP layer.

**[`authkit`](https://pkg.go.dev/github.com/gopherium/gouncer/authkit)**
is that HTTP layer, shared instead of re-typed: login, logout, and
session handlers, the `RequireSession` middleware, the `__Host-`
cookie, the [user administration surface](/authentication/user-administration/),
a session garbage collector, and a bootstrap helper. It exports
handlers and middleware, never a router.

**[`authkit/postgres`](https://pkg.go.dev/github.com/gopherium/gouncer/authkit/postgres)**
implements the store in PostgreSQL, inside [a schema it owns
outright](/authentication/persistence/), so it composes into your
database without touching your migrations.

**[`authkit/ratelimit`](https://pkg.go.dev/github.com/gopherium/gouncer/authkit/ratelimit)**
budgets failed logins per client IP, with the
[reverse-proxy trust model](/authentication/rate-limiting/) that makes
per-IP meaningful behind a proxy.

**[`@gopherium/react-auth`](https://www.npmjs.com/package/@gopherium/react-auth)**
is the browser side: a session-aware gate, hooks, typed errors, a
WordPress-Design-System skin, an admin UI, and an msw-based
[test harness](/authentication/react-integration/#testing-components-that-authenticate).

## Adopt what you need

The layering exists so you can stop at any line:

- Bring your own transport and take only `gouncer`. Its README
  documents the integrator obligations the higher bricks otherwise
  absorb.
- Take `authkit` with your own database by implementing the five-method
  `gouncer.Store` against anything that persists.
- Take everything, and your integration is the
  [Quickstart](/start/quickstart/).

## The contract in one paragraph

A login exchanges credentials for an opaque token, delivered once in a
`__Host-` cookie and stored only as a digest. Every protected request
resolves the cookie to a user through the store, and everything
downstream of `RequireSession` sees an `Identity` carrying no
credential material. Disabling a user revokes their sessions in the
same transaction. Expired sessions are swept on an interval. Failed
logins are rate limited per client IP and cost the same for known and
unknown emails. The [security model](/authentication/security-model/)
page walks each of those claims.
