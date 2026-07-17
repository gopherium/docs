---
title: React integration
description: The session gate, the hooks, the ready-made screens, and the test harness of @gopherium/react-auth.
---

[`@gopherium/react-auth`](https://www.npmjs.com/package/@gopherium/react-auth)
is the browser half of the authentication stack, speaking authkit's
JSON dialect. It ships four entry points so you take only the layers
you want:

| Entry | Contents |
| --- | --- |
| `@gopherium/react-auth` | Headless core: gate, hooks, api client, typed errors |
| `@gopherium/react-auth/wpds` | Ready-made screens on the WordPress Design System |
| `@gopherium/react-auth/admin` | The user-administration api client |
| `@gopherium/react-auth/testing` | msw harness, canned handlers, session seeding |

`react` and `@tanstack/react-query` are peer dependencies. The `/wpds`
screens additionally expect `@wordpress/ui`.

## The gate

```tsx
const queryClient = createAuthQueryClient()

<QueryClientProvider client={queryClient}>
	<AuthGate
		loginScreen={(onLogin) => <LoginScreen brand="MyApp" onLogin={onLogin} />}
	>
		<App />
	</AuthGate>
</QueryClientProvider>
```

`AuthGate` resolves the session and renders one of three things: your
app when signed in, the login screen when signed out, or the loading
and error states, both overridable props. The `loginScreen` render
prop receives the login-completion handler, so any login UI plugs in.

`createAuthQueryClient` matters as much as the gate: it builds a query
client whose caches drop the session whenever any query or mutation
fails with an `UnauthorizedError`. A session revoked mid-use brings
the login screen back without a reload, from anywhere in the app.

## Hooks and the session key

- `useSession()` reads the cached identity.
- `useLogout()` logs out and scrubs every cached query except the
  session itself, so no stale data survives into the next login.
- `sessionQueryKey` is owned here, at the bottom of the dependency
  graph. Anything else that touches the session, such as an SSE layer
  probing whether a dead stream means a revoked login, imports the key
  and `isSessionRevoked` from this package, never the other way
  around.

## Ready-made screens

The `/wpds` entry covers the whole surface for apps on the WordPress
Design System: `LoginScreen` with a `brand` prop, `AccountPanel` for
the signed-in identity and logout control, `UsersScreen` and
`NewUserScreen` for administration, and `usersNavItem` for your
navigation. Router coupling stays out through render props: the users
screen takes a `newUserRender` element for its create link, and the
new-user form reports success through `onCreated` so the app decides
where to navigate. Import the stylesheet once:

```tsx
import '@gopherium/react-auth/wpds/style.css'
```

## Testing components that authenticate

The `/testing` entry owns the msw server and its vitest lifecycle, so
app harnesses compose instead of re-creating:

```tsx
import {
	installTestEnvironment,
	loginOk,
	seedSession,
	server,
	sessionAnonymous,
} from '@gopherium/react-auth/testing'
```

`installTestEnvironment()` installs the server lifecycle and DOM
cleanup. `seedSession(client, user)` renders components signed in
without a network round trip. The canned handlers cover every auth
endpoint outcome, from `loginOk` to `loginRateLimited`, so specs
declare intent instead of re-typing response literals.

Two integration requirements: register your matcher and stub setup
against your own test runner in your harness file, and give your
bundler a dedupe rule for `react` and `@tanstack/react-query` so a
workspace-linked copy never splits the query-client context.
