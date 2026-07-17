---
title: Rate limiting
description: Budgeting failed logins per client IP, with a trust model that survives reverse proxies.
---

Password verification is expensive by design, and login endpoints are
the one route an attacker can hammer without credentials.
[`authkit/ratelimit`](https://pkg.go.dev/github.com/gopherium/gouncer/authkit/ratelimit)
budgets failed attempts per client IP as ordinary middleware:

```go
limit := ratelimit.Middleware(ratelimit.Config{
	Limit:          0,   // zero applies the default budget
	Window:         0,   // zero applies the default window
	TrustedProxies: cidrs,
})
mux.Handle("POST /api/auth/login", limit(http.HandlerFunc(auth.Login)))
```

It lives in its own module so its router dependencies never enter your
application's graph unless you adopt it.

## What counts against the budget

Only responses with status `401`. Successful logins are free, so a
legitimate user logging in repeatedly never trips the limiter, and a
`401`-only count means the budget measures exactly the thing an
attacker produces. Over budget, the middleware answers `429` with a
`Retry-After` header. When its counter fails, it fails closed with a
`500` rather than waving traffic through.

## The trust model

Per-IP limiting is only as good as the IP. Behind a reverse proxy,
every connection arrives from the proxy's address, and the real client
lives in `X-Forwarded-For`, a header anyone can write. The middleware
resolves this with an explicit trust boundary:

- With no trusted proxies configured, `X-Forwarded-For` is ignored and
  the connecting address is the key. Spoofed headers do nothing.
- With `TrustedProxies` set, the client IP is taken from the forwarded
  chain, trusting only the configured ranges. A client rotating forged
  header entries still lands in one bucket.

Parse the configuration from your environment with
`ParseTrustedProxies`, which validates CIDR ranges and rejects bare
addresses:

```go
cidrs, err := ratelimit.ParseTrustedProxies(os.Getenv("MYAPP_TRUSTED_PROXIES"))
if err != nil {
	return fmt.Errorf("MYAPP_TRUSTED_PROXIES: %w", err)
}
```

Deploying behind a proxy without setting this collapses every visitor
into a single budget, and a handful of failed logins by anyone locks
login for everyone. The
[operations contract](/deployment/operations/#trust-your-proxy-or-lock-everyone-out)
shows how to make that misconfiguration fail loudly at deploy time,
and the [E2E recipe](/testing/end-to-end/#quarantine-the-rate-limiter)
shows how to keep browser tests from tripping the limiter.
