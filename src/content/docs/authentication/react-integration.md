---
title: React integration
description: The session gate, the hooks, the ready-made screens, and the test harness of @gopherium/react-auth.
---

[`@gopherium/react-auth`](https://www.npmjs.com/package/@gopherium/react-auth)
is the browser half of the authentication stack. It calls the
[authkit endpoints](/authentication/sessions-over-http/) for you and
gives your React application everything around a login.

It ships four entry points, so you take only the layers you want:

| Entry | Contents |
| --- | --- |
| `@gopherium/react-auth` | The core: gate, hooks, backend calls, typed errors, transport |
| `@gopherium/react-auth/wpds` | Ready-made screens on the WordPress Design System |
| `@gopherium/react-auth/admin` | The user administration calls |
| `@gopherium/react-auth/testing` | Test harness, canned responses, session seeding |

`react` and `@tanstack/react-query` are peer dependencies, meaning
your application installs them. The `/wpds` screens also expect
`@wordpress/ui`.

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

`AuthGate` checks whether there is a session and renders one of four
things: your application when signed in, the login screen when signed
out, and a loading or error state in between. The last two have
default UI you can replace with props.

`loginScreen` is a render prop, so you can pass any login UI you
like. It receives a handler to call once the login succeeds.

`createAuthQueryClient` is easy to skip past, and it matters as much
as the gate. It builds a React Query client that watches for
`UnauthorizedError` coming back from any query or mutation, and drops
the cached session when it sees one. The effect is that a session
revoked while someone is working brings the login screen straight
back, from anywhere in the application, with no page reload.

## Hooks and the session key

- `useSession()` reads the signed-in user from the cache.
- `useLogout()` logs out and clears every cached query except the
  session itself, so one user's data cannot show up after the next
  person logs in.
- `sessionQueryKey` is the React Query key for the session, and this
  package owns it.

That last point matters when other parts of your application need to
care about the session. Say you have a live event stream that dies,
and you want to know whether the cause was a revoked login. That code
imports `sessionQueryKey` and `isSessionRevoked` from this package.
Dependencies always point this way, never outward, so there is
exactly one definition of what the session is.

## Ready-made screens

If your application uses the WordPress Design System, the `/wpds`
entry has every screen a login needs already built:

- `LoginScreen`, which takes a `brand` prop
- `AccountPanel`, showing who is signed in with a logout control
- `UsersScreen` and `NewUserScreen` for user administration
- `usersNavItem` for your navigation

None of them know your router, and they stay that way by handing
navigation back to you. `UsersScreen` takes `newUserRender`, an
element to use as its create link, so you supply your own link
component. `NewUserScreen` calls `onCreated` when the user is saved,
and your application decides where to go next.

Import the stylesheet once:

```tsx
import '@gopherium/react-auth/wpds/style.css'
```

## Talking to a backend that is not REST

By default the package calls authkit's REST endpoints directly, such
as `POST /api/auth/login`. If your application talks to its backend
some other way, most often GraphQL, you would otherwise be stuck:
the screens and hooks are useful, but the requests they make are
wrong for your server.

`configureAuthTransport` replaces those requests. Call it once when
your application starts, before anything renders:

```ts
import {
	InvalidCredentialsError,
	configureAuthTransport,
} from '@gopherium/react-auth'

configureAuthTransport({
	async login(email, password) {
		const result = await graphqlClient.mutation(LoginDocument, { email, password })
		if (result.error) {
			throw new InvalidCredentialsError('invalid credentials')
		}
		return result.data.login
	},
})
```

Everything above this line keeps working unchanged. The screens, the
gate, the hooks and the query keys never know the requests moved.

There are seven operations in the `AuthTransport` interface:
`fetchSession`, `login`, `logout`, `isSessionRevoked`, `fetchUsers`,
`createUser` and `setUserDisabled`. You override the ones you want
and the rest keep using REST, which makes a gradual migration
possible. Calls to `configureAuthTransport` add up rather than
replace each other, so you can configure in more than one place.

### Matching the error contract

This is the part that is easy to get wrong. The hooks and screens
decide what to show by catching specific error classes, so your
implementation has to throw the same ones the REST version throws.
A generic `Error` where the package expects `InvalidCredentialsError`
turns a wrong password into a crash instead of a form message.

| Operation | Must do this |
| --- | --- |
| `fetchSession` | Return `null` when signed out, never throw |
| `login` | Throw `InvalidCredentialsError` for a bad password, `RateLimitedError` when the limiter refuses |
| `fetchUsers` | Throw `UnauthorizedError` when the session is gone |
| `createUser` | Throw `UnauthorizedError`, `EmailTakenError` for a duplicate email, `ValidationError` for bad input |
| `setUserDisabled` | Throw `UnauthorizedError` when the session is gone |

`InvalidCredentialsError`, `RateLimitedError` and `UnauthorizedError`
come from the main entry point. `EmailTakenError` and
`ValidationError` come from `/admin`.

`UnauthorizedError` deserves particular care, because it is what
[`createAuthQueryClient`](#the-gate) watches for to drop the session
and bring the login screen back. Throw the wrong class from your
transport and a revoked session goes unnoticed.

### One setting for the whole module

The transport is stored in a module-level variable, not in React
context, which has two practical consequences.

Configure it once at startup. There is no provider to place and no
way to give different parts of your tree different transports.

More importantly, the setting belongs to one copy of the package. If
your bundle somehow contains two copies of `@gopherium/react-auth`,
each has its own transport, and one of them silently keeps using
REST. Add the package to your bundler's dedupe list along with
`react` and `@tanstack/react-query`.

`resetAuthTransport()` puts every operation back to REST. It exists
for tests, so one spec's transport cannot leak into the next, and
belongs in a `beforeEach`.

## Testing components that authenticate

Components behind a login are awkward to test, because every one of
them wants a session and a backend. The `/testing` entry provides
both. It runs a fake HTTP server, using
[msw](https://mswjs.io/), and manages that server's setup and
teardown for you:

```tsx
import {
	installTestEnvironment,
	loginOk,
	seedSession,
	server,
	sessionAnonymous,
} from '@gopherium/react-auth/testing'
```

`installTestEnvironment()` starts and stops the server around your
tests and cleans up the DOM between them.

`seedSession(client, user)` puts a signed-in user straight into the
query cache, so a test can render a component behind the gate without
logging in over the network first.

The canned handlers cover every outcome each endpoint can produce,
from `loginOk` to `loginRateLimited`. Naming one says what the test
is about, which reads better than pasting a response body into every
spec.

Two things you have to set up on your side:

- Register the matchers and stubs your own test runner needs, in your
  own setup file.
- Tell your bundler to dedupe `react` and `@tanstack/react-query`.
  Without it, a workspace-linked copy of the package can end up with
  its own React Query context, and your components will not see the
  session you seeded.
