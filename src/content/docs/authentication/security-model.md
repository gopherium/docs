---
title: Security model
description: What the authentication bricks protect you from, how each protection works, and what is left to you.
---

This page lists what the authentication bricks actually protect you
from, and how.

Every claim here is enforced in code and pinned by a test in the
brick itself. That matters because security promises written only in
prose drift out of date quietly. The other reason this page exists is
the last section: some things are still your job, and you should know
which.

## Passwords

**Stored as argon2id hashes.** Hashing happens inside
`gouncer.NewUser`, using cost parameters the library fixes, so there
is nothing for you to choose or tune. argon2id is deliberately slow
and memory hungry, which makes guessing passwords at scale expensive.
A password is never stored, only its hash.

**Checking is constant-time.** Comparing takes the same time whether
the first character is wrong or only the last one is. A comparison
that bailed out early would leak the answer bit by bit. A corrupted
hash in the database never matches anything.

**Login timing does not reveal which emails exist.** When someone logs
in with an unknown email, the handler still hashes the supplied
password against a fixed dummy hash. Both cases do the same work and
return the same `401`, so response timing gives nothing away.

**Password data never travels upward.** Once logged in, the request
carries an `Identity` holding only id, email and name. Admin listings
never read the hash column from the database at all.

## Sessions

**Session tokens are random and stored only as digests.** The token is
random bytes handed to the browser once. The database keeps a SHA-256
digest instead of the token. Anyone who steals a copy of the database
gets no usable tokens.

**The cookie is locked down.** It is `__Host-` prefixed, `HttpOnly`,
`Secure` and `SameSite=Lax`. In practice that means: browsers tie it
to exactly one hostname and refuse it without HTTPS, page scripts
cannot read it, and a cross-site POST does not carry it. That last one
is most of your CSRF protection for a JSON API.

Note the precise limit of `Lax`. It withholds the cookie from
cross-site POSTs, but it still sends it when someone follows a link
from another site, which is a top-level GET. That is why the bricks
define no state-changing GET routes, and why you should not either.

**Expiry is enforced twice.** An expired session stops working
immediately, because the check is in the database query. The reaper
then deletes the dead rows on a schedule. The deletion is housekeeping
rather than the security boundary.

**Disabling an account kills its sessions in the same transaction.**
The flag and the session deletions commit together. So re-enabling an
account later cannot bring a token back to life that was stolen while
it was disabled.

## The login endpoint

**Failed logins are rate limited per client IP.** Only `401` responses
count, so ordinary users are unaffected. If the counter itself fails,
the limiter refuses the request rather than letting it through.
`X-Forwarded-For` is trusted only from proxy ranges you configure
explicitly.

**Request bodies are capped.** The JSON decoder limits body size
before any password work happens and rejects extra content after the
JSON. Without that, an endpoint that anyone can reach without logging
in could be used to exhaust memory.

**Errors do not leak internals.** Known errors map to deliberately
generic messages. Anything unrecognised becomes `internal error`, so a
database or driver message never reaches a caller.

## What is still your job

- **Terminate TLS in front of the application.** The cookie is marked
  `Secure`, so without HTTPS it will not be sent at all. This is a
  functional requirement, not a recommendation.
- **Configure your trusted proxy ranges honestly**, as described in
  the [operations contract](/deployment/operations/). Getting this
  wrong breaks rate limiting in one direction or the other.
- **Authorization.** These bricks answer who someone is. Deciding what
  that person is allowed to do is your application's logic.
- **Anything beyond `SameSite=Lax`** that your threat model calls for.
  The bricks define no state-changing GET requests of their own.

Found a vulnerability? Report it privately through the
[gouncer security policy](https://github.com/gopherium/gouncer/blob/main/SECURITY.md).
