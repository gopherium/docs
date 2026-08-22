---
title: "Quickstart: add auth"
description: A working login, session middleware, user administration, and a React client in about twenty-five lines of glue.
---

This walkthrough goes from an empty Go module and a React app to a
working login, with sessions kept in a cookie.

Every snippet below is real code rather than an outline, so you can
follow along by pasting. The application is called `myapp`
throughout, and you will need a PostgreSQL database to point it at.

## Backend

Install the bricks:

```sh
go get github.com/gopherium/gouncer/authkit@latest
go get github.com/gopherium/gouncer/authkit/postgres@latest
go get github.com/gopherium/gouncer/authkit/ratelimit@latest
```

Now wire them into a server. The example uses the standard library's
`http.ServeMux`, which is all you need. Any router works the same
way, as long as it fills in `r.PathValue` for URL parameters:

```go
package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/gopherium/gouncer"
	"github.com/gopherium/gouncer/authkit"
	authkitpg "github.com/gopherium/gouncer/authkit/postgres"
	"github.com/gopherium/gouncer/authkit/ratelimit"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	ctx := context.Background()
	databaseURL := os.Getenv("MYAPP_DATABASE_URL")

	if err := authkitpg.Migrate(ctx, databaseURL); err != nil {
		log.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()
	store := authkitpg.NewUserStore(pool)

	auth := authkit.New(authkit.Config{
		Store:      store,
		CookieName: "__Host-myapp_session",
	})
	admin := authkit.NewAdmin(authkit.AdminConfig{Store: store, Privileged: gouncer.Ranks{"admin"}})
	limit := ratelimit.Middleware(ratelimit.Config{})

	reaper := authkit.NewReaper(store, authkit.ReaperConfig{})
	reaper.Start()
	defer reaper.Stop()

	mux := http.NewServeMux()
	mux.Handle("POST /api/auth/login", limit(http.HandlerFunc(auth.Login)))
	mux.HandleFunc("POST /api/auth/logout", auth.Logout)
	mux.Handle("GET /api/auth/session", auth.RequireSession(http.HandlerFunc(auth.Session)))
	mux.Handle("GET /api/users", auth.RequireSession(http.HandlerFunc(admin.List)))
	mux.Handle("POST /api/users", auth.RequireSession(http.HandlerFunc(admin.Create)))
	mux.Handle("PATCH /api/users/{id}", auth.RequireSession(http.HandlerFunc(admin.SetDisabled)))
	mux.Handle("PUT /api/users/{id}/rank", auth.RequireSession(http.HandlerFunc(admin.SetRank)))

	log.Fatal(http.ListenAndServe("localhost:8080", mux))
}
```

A fresh database has no users, and creating one requires being
logged in, so you need a way in. Add a subcommand to your binary for
it. `RunCreateAdmin` is the entire subcommand, handling the flags,
the migration and the password prompt. The `-rank` flag names what
the account may do, and `admin` is the rank the server above admits
to the user routes:

```go
err := authkitpg.RunCreateAdmin(ctx, databaseURL, os.Args[2:], os.Stdin, os.Stdout)
```

## Frontend

```sh
pnpm add @gopherium/react-auth
```

Wrap your application in the gate. The example uses the ready-made
login screen from the `/wpds` entry, which suits applications on the
WordPress Design System. If yours is not, the core works with any
login UI you write:

```tsx
import { AuthGate, createAuthQueryClient } from '@gopherium/react-auth'
import { LoginScreen } from '@gopherium/react-auth/wpds'
import '@gopherium/react-auth/wpds/style.css'
import { QueryClientProvider } from '@tanstack/react-query'

const queryClient = createAuthQueryClient()

<QueryClientProvider client={queryClient}>
	<AuthGate
		loginScreen={(onLogin) => <LoginScreen brand="MyApp" onLogin={onLogin} />}
	>
		<App />
	</AuthGate>
</QueryClientProvider>
```

The gate checks for a session, shows the login screen while signed
out, and reveals your application once someone signs in. If a
session expires or is revoked later, any request that comes back
`401` drops it and the login screen returns on its own.

Two setup notes:

- `react` and `@tanstack/react-query` are peer dependencies, so
  install them in your application.
- Point your dev server's `/api` at your Go server through a proxy,
  so the browser sees one origin. The `__Host-` cookie prefix
  requires it, and without the proxy your login will not stick in
  development.

## What you just got

- A login that verifies passwords with argon2id, and takes the same
  time whether the email exists or not, so nobody can discover
  accounts by timing the response.
- A session cookie that is `__Host-` prefixed, `HttpOnly`, `Secure`
  and `SameSite=Lax`.
- Rate limiting on failed logins, counted per client IP. Successful
  logins do not count, so real users are never locked out.
- User administration where disabling an account also deletes its
  sessions, in the same transaction, so a disabled user is logged
  out everywhere immediately.
- An hourly sweep that clears out expired sessions.
- A React client covering login, logout, and sessions that expire
  mid-use.

Next, read the [Authentication overview](/authentication/overview/)
to see how the bricks divide the work. Read the
[operations contract](/deployment/operations/) before you deploy,
since a few of these guarantees depend on how you run it.
