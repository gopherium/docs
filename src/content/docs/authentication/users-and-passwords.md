---
title: Users and passwords
description: Creating accounts and checking passwords with gouncer, including its constant-time verification.
---

[`gouncer`](https://pkg.go.dev/github.com/gopherium/gouncer) is the
bottom layer: it creates user accounts and checks passwords. It never
touches a network or a database. You call a function, you get a value
back, and you decide where to store it.

That makes it the piece to use directly if you are building your own
storage or your own HTTP layer. If you want the batteries included
version, the layers above do this for you.

## Creating an account

```go
u, err := gouncer.NewUser("Maria@Example.com ", "Maria Perez", "correct horse battery")
if err != nil {
	// compare with errors.Is against gouncer's Err values
}
err = store.CreateUser(ctx, u)
```

`NewUser` cleans up and checks the input before anything reaches your
database:

- The email is lowercased, trimmed, and parsed to confirm it is a
  single plain address. Note the messy input above works fine.
- The name is trimmed and length checked.
- The password is length checked, then hashed.

Each kind of rejection returns its own named error value, so your
HTTP layer can tell them apart and answer precisely. If you use
`authkit`, [`StatusForAuthError`](/authentication/sessions-over-http/#composing-error-responses)
already maps them to status codes.

Passwords are hashed with argon2id, a password hashing algorithm
designed to be slow and memory hungry so that guessing at scale is
expensive. The `User` you get back holds only the hash. The plain
password is never stored in it and never leaves the function.

Keep it that way in your own code. The listings that `authkit` builds
never even read the hash column from the database.

## Checking a password

```go
if !gouncer.VerifyPassword(u.PasswordHash, candidate) || u.Disabled {
	// answer the same way for every failure
}
```

`VerifyPassword` compares in constant time, meaning it takes the same
time whether the very first character is wrong or only the last one
is. A comparison that stopped early would let an attacker recover the
answer piece by piece from timing alone.

It also never panics, and a corrupted hash in the database simply
fails to match rather than causing an error.

Two rules matter when you write a login:

**Answer identically for an unknown email and a wrong password.** If
the two responses differ, an attacker can discover which email
addresses have accounts.

**Hash something even when the email is unknown.** Verify against a
fixed dummy hash so both cases cost the same work. Otherwise the
unknown-email case returns noticeably faster, and the timing alone
reveals which accounts exist.

`authkit` does both for you in its login handler. If you write your
own transport, they become your job, and the
[security model](/authentication/security-model/) describes the
attack in more detail.

## The Store contract

`gouncer` defines what storage must do, without caring how. That is
the `Store` interface, and it is five methods:

| Method | Does |
| --- | --- |
| `CreateUser` | Saves a new account |
| `UserByEmail` | Finds an account for login |
| `CreateSession` | Saves a new session |
| `UserBySession` | Finds who a session token belongs to |
| `DeleteSession` | Removes one session |

Each one documents the specific error value it returns when it cannot
do the job.

You can implement these five against any database. Or take
[`authkit/postgres`](/authentication/persistence/) and skip the work
entirely.

For tests there is
[`testkit.Store`](https://pkg.go.dev/github.com/gopherium/gouncer/authkit/testkit),
an in-memory implementation. It is worth using rather than writing
your own fake, because it reproduces the behaviours that are easy to
forget: expired sessions are not found, sessions of disabled users
are not found, and a duplicate email is rejected.
