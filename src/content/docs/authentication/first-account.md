---
title: The first account
description: How a new site's owner creates its first account in the browser, with a one-time setup code read from a file.
---

A new site has no accounts, so nobody can log in to create one. On a
server with a shell you run
[`account:create-admin`](/authentication/user-administration/#bootstrapping-the-first-admin).
On shared hosting the owner often has no shell, only the host's File
Manager.

The easy answer is to let the first visitor create the account, as
WordPress's installer does. Bots use exactly that gap. In 2017 they
scanned the web for unfinished installs. In 2022 they found new sites
through the public logs of new HTTPS certificates. Either way, the bot
finished the setup before the owner did.

authkit closes that gap with a setup code. At start it writes a random
code to a file only the owner can read. The setup form asks for that
code. Whoever shows it creates the first account, and then setup is
closed for good.

## Wiring it up

```go
setup := authkit.NewSetup(authkit.SetupConfig{
	CodeFile:     filepath.Join(stateDir, "setup-code.txt"),
	CodeLifetime: cfg.SetupCodeLifetime,
	Role:         "owner",
	Roles:        registry,
	Capabilities: registry,
	Manages:      "manage_users",
	Logger:       logger,
})
if _, err := setup.Prepare(ctx, store); err != nil {
	return err
}

limit := ratelimit.Middleware(ratelimit.Config{TrustedProxies: cidrs})
mux.Handle("GET /api/auth/setup", setup.Status(store))
mux.Handle("POST /api/auth/setup/code", limit(setup.CheckCode(store)))
mux.Handle("POST /api/auth/setup", limit(setup.Create(store)))
handler := authkit.CrossOriginGuard(logger)(mux)
```

`Prepare` runs once at every start, before you serve. It checks the
role, then keeps the live code, writes a new one, or removes it when
the store already holds an account. Call it after every plugin has
registered its roles.

Keep the paths above, because the
[React package](/authentication/react-integration/) calls them there.
Each handler does one job:

- `Status` answers `{"open": true}` while the site waits for its first
  account, and `{"open": false}` after.
- `CheckCode` tells whether a posted code is right, without using it
  up. A setup wizard, a form in several steps, calls it on its code
  screen.
- `Create` takes the code with the email, name and password, creates
  the account and answers `201` with it. It starts no session, so the
  owner logs in next.

Both write routes share one [limiter](/authentication/rate-limiting/),
so wrong codes on either count against one budget.

`store` is the store your site runs on. A site with no database yet
passes `nil`. `Status` then answers open. `Create` cannot create an
account without a store and answers `500`, so that site ends its
wizard on [a route of its own](#a-wizards-own-route).

**Only a plain `nil` means "no database yet".** A
`*authkitsqlite.UserStore` variable that was never set is nil. Passed
as a `SetupStore`, it becomes an interface that holds a nil pointer,
and that interface is not nil. `Prepare` then calls `HasUsers` on it
and your program panics.

## How the setup code works

The code is one line of 26 characters, capital letters and the digits
2 to 7, such as `K7QW3MZTB2XQ5LJ4N6RAHYCDEF`. authkit writes it to
`CodeFile` at mode 0600, which means only the operating system user
your program runs as can read it. The owner opens it the way the host
allows:

- in the host's File Manager, as `myapp-data/state/setup-code.txt`
- over SSH, with `cat myapp-data/state/setup-code.txt`
- from a container, with
  `docker compose cp myapp:/data/state/setup-code.txt .`, which copies
  the file out and needs no shell inside the image

authkit never creates the folder. Create it yourself at mode 0700, so
nobody else can even list it. A missing folder stops `Prepare` with
`authkit: write the setup code at <path>`.

The code works for `CodeLifetime`, counted from when the file was
written. Zero means one hour, and a negative lifetime stops `Prepare`.
A restart keeps a live code and replaces an expired one. When the
owner shows the code after its lifetime, authkit writes a fresh one to
the file and answers `setup_code_expired`, so the owner knows to read
the file again. Once the file holds a newer code, the old one answers
`setup_code_invalid`.

Spaces, hyphens and line breaks inside a typed code are ignored, and
small letters count as capitals. When setup creates the first account,
authkit removes the code file.

A few rules keep the file safe:

- authkit replaces or removes the file only when it holds a setup
  code. If the path points at something else, such as your `.env`
  file or a folder, it answers `setup_code_file` and leaves it alone.
- If the file's mode lets anyone else in, the code counts as leaked.
  authkit writes a new one and logs a warning.
- authkit never logs the code. It logs `setup code waiting` with the
  path and the expiry. To show the code yourself, for example on a
  terminal, set `OnCode` in `SetupConfig`. It receives the code at
  every start and each time authkit writes a new one.

You may also find an empty file beside the code, the same path with
`.lock` added. authkit creates it at mode 0600 the first time it
replaces an expired or leaked code. With it, two copies of your
program replacing that code at once still end up with one code. It
holds no secret and can stay after setup.

## The role

The first account gets `SetupConfig.Role`. The request body has no
role field, so a visitor cannot pick one. authkit does not know what
your roles mean, so your application, or one of its plugins, names
the role that runs the site.

`Manages` names the capability that manages other accounts, such as
`manage_users`. Checking it means the owner can always add the next
accounts.

`Prepare` refuses a role it cannot give, so a mistake stops your
program at start, before any visitor. Each refusal wraps
`authkit.ErrSetupMisconfigured`:

- an empty `Role`
- a role `Roles` does not declare
- a role without the `Manages` capability, when you set both
  `Capabilities` and `Manages`

When a plugin owns the role, declare the plugin first, as
[Roles from plugins](/authorization/plugin-roles/) shows:

```go
err := goncierge.Declare(registry, rules, "hosting", []goncierge.Role{
	{Name: "owner", Capabilities: []string{"manage_users", "hosting.manage"}},
})
if err != nil {
	return fmt.Errorf("plugin hosting: %w", err)
}
```

The plugin can reuse `manage_users` only because the core already
grants it. A new capability of its own starts with its name, as
`hosting.manage` does. Then call `Prepare` as in the first example.

## Answers and codes

Every answer the three handlers write carries
`Cache-Control: no-store`, so no browser or proxy keeps a copy. Errors
use the
[shared JSON shape](/authentication/sessions-over-http/#composing-error-responses).

| Status | Code | When |
| --- | --- | --- |
| `200` | | `Status`, with `open` |
| `204` | | `CheckCode`, the code is live |
| `201` | | `Create`, with the new account |
| `409` | `setup_done` | The site has an account. Checked before the body is read, and again when another request created the account first |
| `400`, `413` | `body_malformed`, `body_too_large` | The body is not one JSON object, or is over 1 MiB |
| `401` | `setup_code_invalid` | A wrong code, or no code file |
| `401` | `setup_code_expired` | The right code after its lifetime. A fresh one is in the file |
| `422` | `password_too_short` and the other account codes | `Create` only, the email, name or password is refused |
| `500` | `setup_code_file` | The path holds something else, or the system cannot keep the file private |
| `500` | `internal` | A store or file failure, no store, or a role the config cannot give |

The limiter adds `429` with `login_rate_limited`, and the cross-origin
guard adds `403` with `request_cross_origin`.

## A wizard's own route

A wizard often ends on a route of its own, such as one form that also
saves the site title. That route answers as `Create` does:

- Set `Cache-Control: no-store`.
- Before you read the body, ask the site's store, if it has one, with
  `HasUsers`. If it answers true, reply `409` with `setup_done`.
- Read the body with `authkit.Decode`. If that fails, reply `413` with
  `body_too_large` when `errors.Is(err, authkit.ErrBodyTooLarge)`, and
  `400` with `body_malformed` otherwise.
- Call `Check` with the site's own store, or `nil`. Then call
  `CreateFirstAccount` with the store the account goes in.
- Turn each error into an answer as
  [Composing error responses](/authentication/sessions-over-http/#composing-error-responses)
  shows. An error authkit does not know answers `500` with `internal`.

**Never let a store the visitor chose decide that setup is open.** A
wizard may open a new store on a database address the visitor typed.
That store is empty, so its "no account yet" proves nothing about
your site. That is why the route calls `Check` with the site's own
store first.

## Good to know

- **The shell still works.** `account:create-admin` and the other
  [ways from a shell](/authentication/user-administration/#bootstrapping-the-first-admin)
  close setup too. The next time `Prepare`, `Check` or a setup route
  asks the site's store, it finds the account, closes setup and
  removes the code file.
- **HTTPS only.** The code travels in the request body. authkit does
  not check the scheme, so serve these routes behind TLS, as the
  session cookie already requires.
- **Unix systems only, such as Linux and macOS.** On Windows, Go
  reports every file as readable by others. So `Prepare` removes the
  code it just wrote and returns an error that wraps
  `authkit.ErrSetupCodeFile`.

## What differs from WordPress

- The role comes from your configuration. WordPress always makes an
  `administrator`.
- The account logs in by email and has no username.
- The password is kept as typed, spaces at its ends included.
  WordPress trims them.
