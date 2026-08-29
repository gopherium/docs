---
title: Invites and resets
description: Inviting someone to create an account and letting them reset a forgotten password, using single use links.
---

Two jobs need an emailed link: inviting a new person to set their
first password, and letting someone who forgot theirs choose a new
one. `authkit` handles both with the same idea, a single use token.

A token is a random secret you put in a link. `authkit` returns the
secret to you once and stores only its hash, so a stolen database
gives nobody a working link. Sending the mail is your job.

## Setting it up

```go
invites := authkit.NewInvites(authkit.InvitesConfig{Store: store})
```

The store must satisfy `authkit.InviteStore`.
[`authkit/postgres`](/authentication/persistence/) already does.
Invite links last seven days and reset links one hour, and
`InviteTTL` and `ResetTTL` change that.

## Inviting someone

```go
tok, err := invites.Invite(ctx, "maria@example.com", "Maria Perez", "member")
```

This creates an unconfirmed account with no password and returns the
token. Put `tok.Token` in a link and mail it. The account cannot log
in until the link is used.

When they follow the link:

```go
id, err := invites.RedeemInvite(ctx, secret, chosenPassword)
```

That sets their password, confirms the address, and answers the
account id. Start a session for them yourself.

`ResendInvite` replaces a pending link with a fresh one, which
invalidates the old link. It refuses an account that is already
activated.

## Resetting a password

```go
tok, err := invites.RequestReset(ctx, "maria@example.com")
```

Only confirmed, enabled accounts get a reset link. Every other
address answers `gouncer.ErrUserNotFound`, so the response cannot be
used to discover which emails have accounts.

```go
id, err := invites.RedeemReset(ctx, secret, newPassword)
```

That replaces the password and ends every session the account holds,
so anyone already signed in as them is logged out.

Only one reset link stands at a time. Asking again while one is live
answers `gouncer.ErrTokenExists`, which stops someone flooding a
mailbox by repeatedly submitting the form.

## Four rules worth knowing

These are decided for you, and none of them is obvious from the
function names.

**Disabling an account kills its links.** Every invite and reset link
it holds stops working immediately, and re-enabling the account does
not bring them back. Disabling is a complete revocation.

**A failed redemption costs nothing.** If the database errors while
redeeming, the link is not spent. The same link still works. Users do
not need a new one after a hiccup.

**A link works once.** Redeeming it consumes it, and a second attempt
answers `gouncer.ErrTokenNotFound`. Two people clicking the same link
at the same moment means exactly one succeeds.

**Expired invites free the address.** An unconfirmed account whose
invite expired is deleted along with it, so the email can be invited
again. An account that holds a live link is never swept.

## Clearing out expired tokens

That last rule needs something to run the sweep. The
[reaper](/authentication/user-administration/#sweeping-expired-sessions)
already clears expired sessions. If your store also satisfies
`authkit.TokenReaper`, and `authkit/postgres` does, the same reaper
clears expired tokens on the same schedule with no extra setup.

Without a reaper, expired tokens pile up and expired invites keep
holding their addresses.
