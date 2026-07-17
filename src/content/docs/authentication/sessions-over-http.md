---
title: Sessions over HTTP
description: The authkit handlers, the RequireSession middleware, and the identity that flows through your requests.
---

[`authkit`](https://pkg.go.dev/github.com/gopherium/gouncer/authkit)
turns gouncer's primitives into a working session transport. It
exports handlers and middleware, never a router, so it mounts the same
way on the standard library's mux, chi, or anything else that
populates `r.PathValue`.

## Construction

```go
auth := authkit.New(authkit.Config{
	Store:      store,                      // any gouncer.Store
	CookieName: "__Host-myapp_session",     // empty applies "__Host-session"
	SessionTTL: 0,                          // zero applies gouncer's default
})
```

One `Config` value carries every knob. `SessionTTL` bounds the issued
session and the cookie's `MaxAge` from the same value, so the two
expiries cannot drift apart.

## The handlers

| Handler | Route shape | Behavior |
| --- | --- | --- |
| `auth.Login` | `POST /api/auth/login` | Verifies credentials, issues the session, sets the cookie, responds with the identity |
| `auth.Logout` | `POST /api/auth/logout` | Deletes the session server side and clears the cookie |
| `auth.Session` | `GET /api/auth/session` | Reports the logged-in identity, mounted behind `RequireSession` |

Login rejects unknown emails, wrong passwords, and disabled accounts
with one indistinguishable `401`. Logout without a cookie is a
success, and logging out twice is not an error.

## RequireSession and Identity

```go
mux.Handle("GET /api/reports", auth.RequireSession(http.HandlerFunc(handleReports)))
```

`RequireSession` admits only requests carrying a usable session
cookie. Downstream handlers read the authenticated user from the
request context:

```go
identity := authkit.IdentityFromContext(r.Context())
```

`Identity` carries the id, email, and name, and deliberately nothing
else. Credential material never enters the request context. For
middleware of your own that composes with authkit's, `WithIdentity`
is exported too.

## Composing error responses

authkit exposes its JSON vocabulary so your domain handlers speak the
same dialect: `Respond`, `RespondError`, and a bounded `Decode` that
caps request bodies and rejects trailing content. For error mapping,
chain your domain's cases in front of the auth mapping:

```go
func statusFor(err error) (int, string) {
	switch {
	case errors.Is(err, myapp.ErrNotFound):
		return http.StatusNotFound, err.Error()
	}
	if status, message, ok := authkit.StatusForAuthError(err); ok {
		return status, message
	}
	return http.StatusInternalServerError, "internal error"
}
```

Unrecognized errors mask as `internal error` so backend details never
leak into responses.

## The cookie

The session cookie is `__Host-` prefixed, `HttpOnly`, `Secure`,
`Path=/`, and `SameSite=Lax`. Browsers enforce the prefix's
guarantees: no `Domain` attribute, secure origins only. The practical
consequences, including why development on localhost just works and
why production requires TLS in front, live in the
[operations contract](/deployment/operations/).
