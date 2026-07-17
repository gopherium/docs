---
title: "Quickstart: add auth"
description: A working login, session middleware, user administration, and a React client in about twenty-five lines of glue.
---

This walkthrough takes an empty Go module and a React app to a working
cookie-session login. Every snippet is the real integration surface,
not pseudocode. The app is called `myapp` throughout.

## Backend

Fetch the bricks:

```sh
go get github.com/gopherium/gouncer/authkit@latest
go get github.com/gopherium/gouncer/authkit/postgres@latest
go get github.com/gopherium/gouncer/authkit/ratelimit@latest
```

Wire them into a server. The standard library's mux is enough, and any
router that populates `r.PathValue` works the same way:

```go
package main

import (
	"context"
	"log"
	"net/http"
	"os"

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
	admin := authkit.NewAdmin(store)
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

	log.Fatal(http.ListenAndServe("localhost:8080", mux))
}
```

Create the first account through the same primitives, typically as a
subcommand of your binary:

```go
err := authkit.CreateAdmin(ctx, store, "you@example.com", "Your Name", os.Stdin, os.Stdout)
```

## Frontend

```sh
pnpm add @gopherium/react-auth
```

Mount the gate around your app. The `/wpds` entry ships a ready-made
login screen for apps on the WordPress Design System, and the headless
core works with any UI:

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

The gate resolves the session, renders the login screen while signed
out, and reveals the app once a session exists. A mid-session `401`
anywhere drops the cached session and brings the login screen back.

Two consumer requirements to know about: `react` and
`@tanstack/react-query` are peer dependencies, and your dev server
needs a same-origin `/api` proxy so the `__Host-` session cookie works
in development.

## What you just got

- Login with argon2id verification and equalized timing for unknown
  emails.
- A `__Host-` prefixed, `HttpOnly`, `Secure`, `SameSite=Lax` session
  cookie.
- Per-IP rate limiting on failed logins, off-budget for successes.
- A user administration surface where disabling an account revokes its
  live sessions in the same transaction.
- Hourly garbage collection of expired sessions.
- A React client that handles login, logout, and mid-session expiry.

From here, read the [Authentication overview](/authentication/overview/)
for how the bricks divide the work, and the
[operations contract](/deployment/operations/) before your first
deployment.
