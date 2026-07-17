---
title: Security model
description: The claims the authentication bricks make, and exactly how each one is kept.
---

Security features that live in prose tend to rot. Every claim on this
page is enforced in code and pinned by tests in the bricks themselves.
This page exists so you know what you are getting, and what remains
yours.

## Credentials

**Passwords are stored as argon2id hashes**, produced during
`gouncer.NewUser` with the library's cost parameters. Verification is
constant-time and a malformed stored hash never verifies.

**Login timing does not reveal which emails exist.** When a login
names an unknown email, the handler verifies the password against a
fixed dummy hash anyway, so known and unknown emails cost the same
hash computation and return the same `401`.

**Password material never travels upward.** The request context
carries an `Identity` of id, email, and name. Admin listings never
read the hash column.

## Sessions

**Tokens are opaque and stored only as digests.** A session token is
random bytes, handed to the client once. The store persists a SHA-256
digest, so a database leak leaks no usable tokens.

**The cookie is `__Host-` prefixed, `HttpOnly`, `Secure`, and
`SameSite=Lax`.** Browsers enforce host scoping and secure origins,
scripts cannot read it, and cross-site POSTs do not carry it, which is
the bulk of CSRF defense for a JSON API.

**Expiry is enforced at lookup and by collection.** An expired session
misses at the query level immediately, and the reaper deletes the rows
on an interval.

**Disabling an account revokes its sessions transactionally.** The
flag and the session deletions commit together, so re-enabling an
account later cannot resurrect a token stolen while it was disabled.

## The login surface

**Failed logins are rate limited per client IP**, counting only
`401` responses, failing closed when the counter errors, and honoring
`X-Forwarded-For` only from explicitly trusted proxy ranges.

**Request bodies are bounded.** The JSON decoder caps body size ahead
of any credential work and rejects trailing content, so the
unauthenticated login route cannot be used to exhaust memory.

**Backend details never leak.** Recognized domain errors map to
deliberate, generic messages, and everything unrecognized masks as
`internal error`.

## What remains the application's responsibility

- TLS termination in front of the app. The cookie's `Secure` flag
  makes this a functional requirement, not advice.
- Configuring the trusted proxy ranges truthfully, per the
  [operations contract](/deployment/operations/).
- Authorization. These bricks authenticate. Who may do what once
  authenticated is your domain logic.
- Anything beyond `SameSite=Lax` your threat model demands for
  state-changing GET requests, of which the bricks define none.

Report vulnerabilities privately through the
[gouncer security policy](https://github.com/gopherium/gouncer/blob/main/SECURITY.md).
