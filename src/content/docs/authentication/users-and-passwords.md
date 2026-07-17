---
title: Users and passwords
description: Validated account construction and constant-time password verification with gouncer.
---

The primitives live in
[`gouncer`](https://pkg.go.dev/github.com/gopherium/gouncer) and never
touch a network or a database. You call them, then hand the results to
a store.

## Creating an account

```go
u, err := gouncer.NewUser("Ada@Example.com ", "Ada Lovelace", "correct horse battery")
if err != nil {
	// errors.Is against gouncer's Err* sentinels.
}
err = store.CreateUser(ctx, u)
```

`NewUser` normalizes and validates before anything is stored: the
email is lowercased, trimmed, and parsed as a single plain address,
the name is trimmed and bounded, and the password is length-checked
and hashed with argon2id. Each rejection is a distinct sentinel, so an
HTTP layer can map them to precise responses.
[`authkit.StatusForAuthError`](/authentication/sessions-over-http/#composing-error-responses)
does exactly that.

The returned `User` carries the hash, never the password. Store
implementations and API responses are expected to keep it that way:
listings built on `authkit` strip password hashes at the query level.

## Verifying a password

```go
if !gouncer.VerifyPassword(u.PasswordHash, candidate) || u.Disabled {
	// One generic answer for every failure.
}
```

`VerifyPassword` never panics and a malformed hash never matches. Two
behaviors matter for login flows:

- Reject unknown emails and wrong passwords with the same response.
- When the email is unknown, verify against a fixed dummy hash anyway,
  so both outcomes cost one hash computation and response timing does
  not reveal which emails exist. `authkit`'s login handler does this
  for you. If you write your own transport, this is your obligation,
  and the [security model](/authentication/security-model/) explains
  the attack it blocks.

## The Store contract

`gouncer.Store` is five methods: `CreateUser`, `UserByEmail`,
`CreateSession`, `UserBySession`, and `DeleteSession`, each documented
with the sentinel it returns. Implement it against any database, or
take [`authkit/postgres`](/authentication/persistence/) and skip the
work. The in-memory
[`testkit.Store`](https://pkg.go.dev/github.com/gopherium/gouncer/authkit/testkit)
implements the full contract for tests, including the semantics that
are easy to forget: expired sessions miss, disabled users' sessions
miss, and duplicate emails collide.
