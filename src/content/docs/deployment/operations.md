---
title: Operations contract
description: What every deployment of an authkit app must provide.
---
What every deployment of an app built on `authkit` must provide. Each
point is load-bearing. Skipping one does not fail loudly at deploy
time, it degrades security or availability later.

Placeholders: the app is `myapp`, its env prefix is `MYAPP_`.

## TLS in front is mandatory

The session cookie carries the `__Host-` prefix, so browsers accept it
only over HTTPS. Without TLS termination in front of the app, nobody
can log in at all. Any TLS-terminating proxy works. The app itself
speaks plain HTTP on its internal network.

The single exception is localhost, where browsers accept Secure
cookies over plain HTTP. Development and E2E runs need no TLS and no
insecure-cookie flag.

## Trust your proxy, or lock everyone out

The login rate limiter counts failed attempts per client IP taken from
`X-Forwarded-For`, and it honors that header only from configured
trusted proxies. Undeployed, every visitor arrives from the proxy's
address and shares one budget: a handful of failed logins by anyone
locks out login for everyone.

Set the proxy's network range in the app configuration, feeding
`ratelimit.Config.TrustedProxies` through `ParseTrustedProxies`. For a
proxy on a shared container network, find the subnet with:

```sh
docker network inspect <proxy-network> \
  -f '{{range .IPAM.Config}}{{.Subnet}}{{end}}'
```

Make the deployment fail loudly when the value is missing instead of
degrading silently:

```yaml
environment:
  MYAPP_TRUSTED_PROXIES: "${MYAPP_TRUSTED_PROXIES:?set to the proxy network subnet}"
```

Trusting a range means trusting every workload inside it to write
`X-Forwarded-For` honestly. Keep the proxy network limited to the
proxy and the apps it fronts.

## Bootstrap the first admin through the binary

`authkit.CreateAdmin` backs a subcommand of the app binary, reading
the password as one line from stdin. It needs no shell and no extra
tooling, so it works in distroless images:

```sh
docker compose exec myapp /myapp createadmin \
  -email you@example.com -name "Your Name"
```

Never bootstrap by inserting rows manually. The subcommand validates
input, hashes the password, and migrates the auth schema first.

## Migrations compose, they never merge

`authkit/postgres` owns the `auth` schema and records its lineage in
its own `auth.goose_db_version` table. The app's migrations keep their
own table. On every start, run both migrators, the library's first:

```go
if err := authkitpg.Migrate(ctx, databaseURL); err != nil {
	return err
}
if err := appMigrate(ctx, databaseURL); err != nil {
	return err
}
```

Two migration lineages sharing one version table corrupt each other.
Any additional schema-owning module, such as a plugin, follows the
same rule with its own table.

## Knobs live in code, not in this document

Session lifetime, cookie name, sweep cadence, and the rate budget are
fields on `authkit.Config`, `authkit.ReaperConfig`, and
`ratelimit.Config`. Their documentation and defaults live with the
code. Bind them to env vars in the app, and give each product its own
cookie name in the `__Host-myapp_session` shape.
