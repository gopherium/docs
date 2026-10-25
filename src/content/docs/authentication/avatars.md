---
title: Avatars
description: Building an account's avatar address on the server, as a drawn initial or a Gravatar picture, the way WordPress does, and sending it with every listed account.
---

An avatar is the small round picture beside an account's name. The
[`avatar`](https://pkg.go.dev/github.com/gopherium/gouncer/avatar)
package builds its address on the server, so every screen draws the
same avatar for the same account. It uses the standard library alone
and reads no setting. Your application reads its own avatar settings
and passes them in:

```go
options := avatar.Options{Mode: mode, Default: image, Rating: rating}
src := avatar.Address(user.Name, user.Email, 48, options)
```

Put the address in the `src` of an `<img>`. An empty address means no
avatar.

## The three modes

- `initials`, the default, draws a circle with the first letter of
  the name in capitals. The picture is held inside the address itself
  (a `data:` address of an SVG drawing), so nothing leaves your
  application. It uses the six colours of godmin's
  [`InitialsAvatar`](/admin-ui/lists/#avatars), picked from the name
  the same way.
- `gravatar` asks Gravatar for the picture the account's owner
  uploaded there. The address carries the SHA-256 hash of the email,
  never the email itself.
- `off` draws nothing, and the address is empty.

## Gravatar settings

They copy the Avatars section of the WordPress Discussion screen. The
default image is what Gravatar shows for an email with no picture:
`mystery` (the default), `blank`, `gravatar_default` (the Gravatar
logo), `identicon`, `wavatar`, `monsterid`, `retro`, `robohash`,
`initials` or `color`. With `initials`, the address also carries up to
two letters of the name, as WordPress sends them. The rating is the
most mature picture an avatar may show: `G` (the default), `PG`, `R`
or `X`.

## Reading settings

`ParseMode`, `ParseDefault` and `ParseRating` turn a stored setting
into an option. An empty setting gives the default, and a value they
do not know is refused with an error that names it. `ParseSize` reads
a size from a request. It keeps 1 to 2048 pixels, Gravatar's own
limit, and gives 96 for an empty value, as WordPress does. `Address`
brings any other size to the nearest bound.

## On the users list

authkit's admin handlers build the same address for every account they
list. Pass your options as `AdminConfig.Avatars` and the size as
`AdminConfig.AvatarSize`, and each account in `GET /api/users` carries
an `avatar` field, as
[User administration](/authentication/user-administration/#avatars-on-listed-accounts)
explains. In `off` mode, or with no options, the field is left out.
Pass the options your other screens use, so a person's picture is the
same on the users list as everywhere else.
