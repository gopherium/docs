---
title: Operations contract
description: What every deployment of an authkit application has to provide, and what breaks if it does not.
---

Four things every deployment of an `authkit` application must get
right.

None of them fails at deploy time. Your deploy goes green and the
problem appears later, as a security weakness or as users unable to
log in. That is why they are collected here rather than left to be
discovered.

Throughout, the application is called `myapp` and its environment
variables start with `MYAPP_`.

## 1. TLS in front is mandatory

The session cookie uses the `__Host-` prefix, and browsers only accept
such a cookie over HTTPS. Without HTTPS in front of your application,
**nobody can log in at all**, because the browser silently discards
the cookie.

Any TLS-terminating proxy will do. The application itself speaks plain
HTTP on your internal network, so it needs no certificate of its own.

There is one exception: browsers accept secure cookies over plain HTTP
on `localhost`. Development and end-to-end runs therefore need no TLS
and no special insecure-cookie setting.

## 2. Tell the application which proxy to trust

The login rate limiter counts failed attempts per client IP. Behind a
proxy, every request arrives from the proxy's own address, so the real
client address comes from the `X-Forwarded-For` header. Since anyone
can write that header, it is trusted only from proxy addresses you
name.

If you name none, every visitor looks like the proxy and they all
share one budget. A handful of failed logins by one person then locks
out login **for everybody**.

Set your proxy's network range in the application config, which passes
it through `ParseTrustedProxies` into `ratelimit.Config.TrustedProxies`.
For a proxy on a shared container network, find the subnet with:

```sh
docker network inspect <proxy-network> \
  -f '{{range .IPAM.Config}}{{.Subnet}}{{end}}'
```

Make a missing value stop the deployment rather than degrade it
quietly:

```yaml
environment:
  MYAPP_TRUSTED_PROXIES: "${MYAPP_TRUSTED_PROXIES:?set to the proxy network subnet}"
```

One caution: trusting a range means trusting everything running inside
it to report `X-Forwarded-For` honestly. Keep that network limited to
the proxy and the applications it fronts.

## 3. Create the first admin with the binary

A fresh database has no users, and creating a user requires being
logged in. `authkitpg.RunCreateAdmin` backs a subcommand of your own
binary to break that circle. It parses the account flags, migrates the
auth schema, and reads the password as a single line from stdin.

It needs no shell and no extra tooling, so it works even in a
distroless image:

```sh
docker compose exec myapp /myapp createadmin \
  -email admin@example.com -name "Maria Perez" -role admin
```

Never create that first account by inserting database rows by hand.
The subcommand validates the input, hashes the password properly, and
makes sure the schema exists before it writes.

## 4. Run both migrators, library first

`authkit/postgres` owns the `auth` schema and tracks which of its
migrations have run in its own `auth.goose_db_version` table. Your
application tracks its own in a separate table. Run both at every
start, the library's first:

```go
if err := authkitpg.Migrate(ctx, databaseURL); err != nil {
	return err
}
if err := appMigrate(ctx, databaseURL); err != nil {
	return err
}
```

Two sets of migrations sharing one tracking table will each misread
the other's entries as their own, and corrupt both histories.

Any other module that owns database tables follows the same rule with
its own table. Plugins are the common case, and the
[host](/plugins/host-lifecycle/) runs their migrations for you before
any plugin starts.

## Settings are documented in the code

Session lifetime, cookie name, cleanup interval and the rate limit
budget are fields on `authkit.Config`, `authkit.ReaperConfig` and
`ratelimit.Config`. Their defaults and descriptions live with the
code, which is the only place that cannot drift.

Bind them to environment variables in your application, and give each
product its own cookie name following the `__Host-myapp_session`
shape.
