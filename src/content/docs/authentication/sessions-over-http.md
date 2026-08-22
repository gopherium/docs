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
	Privileged: gouncer.Roles{"admin"},     // empty admits every role
})
```

One `Config` value carries every knob. `SessionTTL` bounds the issued
session and the cookie's `MaxAge` from the same value, so the two
expiries cannot drift apart. `Privileged` names the roles that pass
`RequirePrivilege`, explained below. authkit copies the list, so
changing your slice later does not change the gate.

## The handlers

| Handler | Route shape | Behavior |
| --- | --- | --- |
| `auth.Login` | `POST /api/auth/login` | Verifies credentials, issues the session, sets the cookie, responds with the identity |
| `auth.Logout` | `POST /api/auth/logout` | Deletes the session server side and clears the cookie |
| `auth.Session` | `GET /api/auth/session` | Reports the logged-in identity, mounted behind `RequireSession` |

Login rejects unknown emails, wrong passwords, and disabled accounts
with one indistinguishable `401`. Logout without a cookie is a
success, and logging out twice is not an error.

## The seams under the handlers

Every handler above is a thin wrapper around a plain method that
does the real work, and those methods are public. Call them directly
when you have no HTTP request in hand, for example from a GraphQL
resolver, a CLI command, or a test:

| Seam | Answers |
| --- | --- |
| `auth.Authenticate(ctx, email, password)` | The `Identity`, or `ErrInvalidCredentials` |
| `auth.StartSession(ctx, userID)` | The `*http.Cookie` to set |
| `auth.EndSession(ctx, token)` | The clearing `*http.Cookie` |
| `auth.SessionIdentity(ctx, token)` | The `Identity` behind a token |
| `auth.CookieName()` | The configured cookie name |

```go
identity, err := auth.Authenticate(ctx, email, password)
if errors.Is(err, authkit.ErrInvalidCredentials) {
	return unauthorized()
}
cookie, err := auth.StartSession(ctx, identity.ID)
```

`ErrInvalidCredentials` covers unknown emails, wrong passwords, and
disabled accounts alike, so a caller cannot tell which of the three
happened. `Authenticate` also does the same amount of password work
whether the email exists or not, so a login attempt takes the same
time either way and response timing leaks nothing. You get both
protections automatically by calling the seam.

The two session seams return a cookie instead of setting one,
leaving it to you to attach it to whatever response you are
building. `CookieName` tells you which cookie carries the token, so
you never hard-code a name that `Config` can change.

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

`Identity` carries the id, email, name and role, and deliberately
nothing else. Credential material never enters the request context.
For middleware of your own that composes with authkit's,
`WithIdentity` is exported too.

## RequirePrivilege

Some routes are for administrators only. `RequirePrivilege` sits after
`RequireSession` and admits only a role named in `Config.Privileged`:

```go
mux.Handle("GET /api/settings", auth.RequireSession(auth.RequirePrivilege(http.HandlerFunc(handleSettings))))
```

Any other role gets a 403 with the code `role_insufficient`. An
account with no role never passes. If `Privileged` is empty the
middleware admits everyone, so adding it to a route changes nothing
until you name the roles.

The role is plain text. authkit stores it and checks it against your
list. What each role may do is your application's decision. Keep
those decisions in one place in your code, asking "may this role do
X" rather than "is this role admin", so you can change the rules
later without touching every handler.

## Composing error responses

Every refusal authkit writes is a JSON object with two parts. The
`error` field is a message in English. The `code` field is a short
fixed name like `credentials_invalid`. Clients should match on the
code. The message can change, the code does not.

```json
{"error": "invalid credentials", "code": "credentials_invalid"}
```

Your own handlers can answer in the same shape. `Respond` writes a
value, `RespondRefusal` writes a `Refusal` with its message and code,
and a bounded `Decode` caps request bodies and rejects trailing
content. For error mapping, chain your domain's cases in front of the
auth mapping:

```go
func refusalFor(err error) (int, authkit.Refusal) {
	switch {
	case errors.Is(err, myapp.ErrNotFound):
		return http.StatusNotFound, authkit.Refusal{Message: err.Error(), Code: "item_not_found"}
	}
	if status, refusal, ok := authkit.RefusalForAuthError(err); ok {
		return status, refusal
	}
	return http.StatusInternalServerError, authkit.Refusal{Message: "internal error", Code: "internal"}
}
```

Unrecognized errors mask as `internal` so backend details never leak
into responses.

The codes authkit can answer with:

| Code | Meaning |
| --- | --- |
| `credentials_invalid` | Wrong email or password |
| `session_absent` | No usable session cookie |
| `role_insufficient` | The role may not use this route |
| `body_malformed` | The request body is not valid JSON |
| `body_too_large` | The request body is over the cap |
| `body_field_required` | A required field is missing, `meta.field` names it |
| `email_invalid`, `email_taken` | The email is malformed, or already in use |
| `name_required`, `name_too_long` | The name is empty, or over the cap |
| `password_too_short`, `password_too_long` | The password is outside the bounds |
| `user_id_malformed`, `user_not_found` | The id is not a UUID, or matches no account |
| `self_disable_refused`, `self_role_refused` | An account changing itself |
| `last_privileged_refused` | The last administrator cannot be removed |
| `internal` | Something failed on the server |

The [rate limiter](/authentication/rate-limiting/) adds
`login_rate_limited`. The [React package](/authentication/react-integration/)
turns the role codes into typed errors a screen can catch.

## The cookie

The session cookie is `__Host-` prefixed, `HttpOnly`, `Secure`,
`Path=/`, and `SameSite=Lax`. Browsers enforce the prefix's
guarantees: no `Domain` attribute, secure origins only. The practical
consequences, including why development on localhost just works and
why production requires TLS in front, live in the
[operations contract](/deployment/operations/).
