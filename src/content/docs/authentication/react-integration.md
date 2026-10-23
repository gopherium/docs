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
your application installs them. The `/wpds` entry also expects
`@wordpress/ui`, and `@wordpress/icons` 18.x for its Users row.

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

Until a site has its first account, nobody can log in. So check
`isSetupOpen()` first, for example from React Query's `useQuery`.
While it answers `true`, render your setup wizard in place of
`AuthGate`. Build the wizard from
[the setup steps](#setting-up-the-first-account).

## Hooks and the session key

- `useSession()` reads the signed-in user from the cache: id, email,
  name and role. The role is plain text from your server, empty when
  the server sends none. When the server has a
  [capability source](/authentication/sessions-over-http/#requirecapability),
  the user also carries `capabilities`. It carries `grantable`, the
  roles it may hand out, when that source also answers `Grantable`, as
  goncierge's registry does.
- `can(user, capability)` answers whether that user holds a
  capability. A missing user, or a user whose session carries no list,
  holds none.
- `useLogout()` logs out and clears every cached query except the
  session itself, so one user's data cannot show up after the next
  person logs in.
- `adoptSession(client, user)` installs a user who just signed in some
  other way, such as accepting an invitation. It does the same cache
  clearing as a logout, so whatever the previous account left cached
  is gone before the new person's screens render.
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

- `LoginScreen`, which takes a `brand` prop and an optional
  `onForgotPassword` that shows "Lost your password?" under the card
- `AccountPanel`, showing who is signed in with a logout control
- `UsersScreen` and `NewUserScreen` for user administration
- `SetPasswordScreen` for the person accepting an invitation
- `RequestResetScreen` and `ResetPasswordScreen` for a forgotten
  password
- `SetupCodeStep` and `SetupAccountStep` for a new site's first
  account
- `usersMenuItem`, the Users row for your sidebar menu

None of them know your router, and they stay that way by handing
navigation back to you. `UsersScreen` takes `newUserRender`, an
element to use as its create link, so you supply your own link
component. `NewUserScreen` calls `onCreated` when the invitation is
handled, and your application decides where to go next.

Import the stylesheet once:

```tsx
import '@gopherium/react-auth/wpds/style.css'
```

### The Users row

`usersMenuItem` is a row of a godmin
[sidebar menu](/admin-ui/framing-an-application/#the-sidebar-menu),
written as data: the label Users in the reader's language, the
address `/users` and WordPress's people icon. Add it to the rows you
give `Navigation`:

```tsx
<Navigation title="MyApp" items={[...menu, usersMenuItem]} home={<Link to="/posts" />} can={check} />
```

The row names no capability. To hide it from a reader who may not
manage users, name the capability on your `/users` route:

```tsx
createRoute({
	getParentRoute: () => rootRoute,
	path: '/users',
	staticData: { capability: 'users.manage' },
	component: UsersPage,
})
```

### Setting up the first account

A brand new site has no account, so whoever reaches it first could
claim it. The server stops that with a setup code, a one-time code it
writes to a file only the site's owner can open.
[The first account](/authentication/first-account/) covers the server
side. That side needs `authkit` 0.22.0 or newer. On an older backend
the setup routes answer 404, so `isSetupOpen()` throws.

In the browser, two screens take turns:

1. `SetupCodeStep` asks for the code. Once the server accepts it, the
   step calls `onUnlocked(code)`. Keep that code in memory.
2. `SetupAccountStep` takes that `code` and shows the account rows of
   WordPress's installer: Name, Password and Your Email. Name takes
   the place of WordPress's Username, because the account logs in by
   email. Once the server creates the account, the step calls
   `onCreated(account)`. The new account is not signed in, so this is
   where you show your login.
3. If the server refuses the code at that point, for example because
   it expired, the account step calls `onCodeRefused(reason)`. Store
   that `reason`, forget the code, and show `SetupCodeStep` again with
   `refused={reason}`. It opens with the sentence for that reason.

Both steps call `onClosed` when a submit finds that the site already
has its first account. The account step also calls it when the
connection drops or the site answers that it is starting, if setup
has closed by then. That can mean its own submit made the account, so
have `onClosed` show your login too.

`SetupCodeStep` draws its own heading from `brand`, such as "Unlock
MyApp". Do not add a second heading on that screen. The package never
knows where your code file lives, so `fileHint` says it in your words:

```tsx
<SetupCodeStep
	brand="MyApp"
	fileHint={<>In File Manager, open <code>myapp-data/state/setup-code.txt</code>.</>}
	refused={refused}
	onUnlocked={setCode}
/>
```

[The first account](/authentication/first-account/#how-the-setup-code-works)
lists where owners usually find the file.

`SetupAccountStep` starts with a generated password in plain view and
WordPress's strength meter under it. When the meter says Very weak,
Weak or Password strength unknown, the person must tick "Confirm use
of weak password" before the submit button turns on.

A wizard usually asks for more than the account. Put your own rows in
`before`, above Name, or `after`, below Your Email. Pass `onSubmit` to
send the final submit through your own route in place of
`createFirstAccount`:

```tsx
<SetupAccountStep
	code={code}
	submitLabel="Install MyApp"
	userInputs={[title]}
	onSubmit={(account) => installSite({ ...account, title })}
	onCreated={() => navigate('/login')}
	before={
		<Field.Root className="gopherium-setup__row" render={<div />}>
			<Field.Label className="gopherium-setup__label">Site Title</Field.Label>
			<div>
				<Input value={title} onChange={(event) => setTitle(event.target.value)} />
			</div>
		</Field.Root>
	}
/>
```

`onSubmit` receives the code, email, name and password. `installSite`
stands for your own call. Here it also takes the title. It resolves to
the created account and throws the errors listed in
[the error contract](#matching-the-error-contract).

`userInputs` lists your own values, such as the site title, that the
meter treats as easy to guess.

Build your rows from `Field` and `Input` in `@wordpress/ui`. They line
up with the step's own rows only when they use the example's
`gopherium-setup__row`, `render={<div />}` and
`gopherium-setup__label`.

The strength meter uses zxcvbn, a password strength library of about
820 kB, or 400 kB gzipped. It loads as a separate file, a chunk, the
first time the step renders. Your bundler may warn that the chunk is
large. That warning is expected.

## Invitations and password resets

Since 0.8.0 the package covers how an account starts and how a lost
password comes back. The server side of both is
[invites and resets](/authentication/invites-and-resets/), served by
`authkit` 0.12.0 or newer. On an older backend the new screens get a
404, while everything else on this page keeps working.

An account starts with an invitation. An administrator fills in
`NewUserScreen` with an email and a name, and the server mails an
activation link. No password is typed by the administrator, which is
the point: only the invited person ever knows it. When the server has
no mail set up, the screen shows the activation link read-only so the
administrator can deliver it by hand. Either way the answer never
reveals whether the address already had an account.

The activation link lands on your route holding `SetPasswordScreen`:

```tsx
<SetPasswordScreen
	brand="MyApp"
	token={tokenFromTheURL}
	onAccepted={(user) => adoptSession(queryClient, user)}
/>
```

Accepting sets the password and signs the person in, in one step. Your
`onAccepted` installs the session and navigates. If it fails, the
screen offers a retry that never spends the single use token again.

A forgotten password is the same shape from the other side.
`RequestResetScreen` asks for an email and always answers the same
neutral sentence, so it cannot be used to check which addresses have
accounts. The mailed link lands on `ResetPasswordScreen`, which takes
the same `token` prop and an `onDone` for the way back to the login.
Pass `onForgotPassword` to your `LoginScreen` to render the way in.

Each link works once and then expires. A spent or expired link shows
"This link is no longer valid" with advice on getting a new one.

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

There are fifteen operations in the `AuthTransport` interface:
`fetchSession`, `login`, `logout`, `isSessionRevoked`, `fetchUsers`,
`createUser`, `setUserDisabled`, `setUserRole`, `invite`,
`acceptInvite`, `requestPasswordReset`, `resetPassword`, and the
setup calls `isSetupOpen`, `checkSetupCode` and `createFirstAccount`.
You override the ones you want and the rest keep using REST, which
makes a gradual migration possible. Calls to `configureAuthTransport`
add up rather than replace each other, so you can configure in more
than one place.

The three setup calls are new in 0.14.0. If your code builds a
complete `AuthTransport` object, add the three calls to it. A
transport that overrides only some calls needs no change.

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
| `invite` | Answer `{ delivered: true }` or `{ delivered: false, activation_link }`, the same shape whether the address is taken or fresh. Throw `ValidationError` for bad input, never `EmailTakenError` |
| `acceptInvite` | Return the signed-in user. Throw `InvalidTokenError` for a spent, expired or unknown link |
| `requestPasswordReset` | Answer nothing about the address. Throw `RateLimitedError` when the limiter refuses |
| `resetPassword` | Throw `InvalidTokenError` for a dead link, `ValidationError` for a refused password |
| `isSetupOpen` | Return `true` while the site has no account, `false` once it has one |
| `checkSetupCode` | Resolve without spending the code. Throw `SetupCodeError` for a refused code, `SetupClosedError` once the site has an account, `RateLimitedError` when the limiter refuses, `SiteStartingError` while the site starts |
| `createFirstAccount` | Return the created account. Throw the same errors as `checkSetupCode`, and `ValidationError` for a refused field |

If your server checks roles, the four admin writes also throw
`RoleUnknownError` and `RoleBeyondReachError`, as
[Roles in the admin functions](#roles-in-the-admin-functions) lists.

The setup steps show their own sentence for each error in the
`checkSetupCode` and `createFirstAccount` rows. Two of the errors
carry details the steps read. A `SetupCodeError` carries a `reason`:
`invalid` for a wrong code, `expired` for a code past its lifetime,
or `file` when the server cannot use the code file. A
`ValidationError` from `createFirstAccount` carries the server's
`code` and `meta`. In your own transport, build it as
`new ValidationError(message, { code, meta })`.

The account step knows the codes `email_invalid`, `name_required`,
`name_too_long`, `password_too_short` and `password_too_long`. For a
short password it reads the shortest length allowed from `meta.min`.
For any other error it shows "The account could not be created,
please try again" unless you give `SetupAccountStep` an `onError`
prop that returns your own words.

`InvalidCredentialsError`, `RateLimitedError`, `UnauthorizedError`,
`InvalidTokenError`, `SetupCodeError`, `SetupClosedError` and
`SiteStartingError` come from the main entry point.
`EmailTakenError`, `ValidationError` and the role errors come from
`/admin`, and `ValidationError` is also exported from the main entry
point.

The `invite` answer is checked, not trusted. A custom transport that
answers `delivered: false` without an activation link is treated as a
failed invitation, because a screen showing an empty link would strand
the invited account.

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

## Roles in the admin functions

The `/admin` entry lists, creates and changes accounts. Each listed
`User` carries a `role`. `createUser` takes an optional `role` for
the new account, and `setUserRole(id, role)` changes one.

`setUserRole` calls `PUT /api/users/{id}/role`. A backend on `authkit`
v0.8.0 or older names that write `rank`, so it answers 404 until you
upgrade it too.

A role change can be refused six ways, and each is a typed error
a screen can catch:

| Error | The server said |
| --- | --- |
| `RoleRefusedError` | The signed-in account may not change roles |
| `SelfRoleError` | An account tried to change its own role |
| `LastPrivilegedError` | It would remove the last administrator |
| `RoleUnknownError` | No role registry declares that role |
| `RoleBeyondReachError` | The signed-in account may not hand out that role, or change that account |
| `RoleChangedError` | The account's role changed before the write landed, so reload it |

`createUser`, `invite` and `setUserDisabled` throw `RoleUnknownError`
and `RoleBeyondReachError` as well, and `setUserDisabled` throws
`RoleChangedError` too. `RoleUnknownError` is also a `ValidationError`, so a form that
shows validation messages shows it too.

Ask `can(user, 'users.manage')` from your screens, never compare role
names. Build a role menu from the session user's `grantable` list,
which arrives when the server's source answers `Grantable`.

## Languages

Every string the package renders is translatable. It ships a Spanish
catalogue and reads the text domain `DOMAIN`. Load the catalogue for
the reader's language once at startup, with the same `@wordpress/i18n`
copy your application uses:

```ts
import { setLocaleData } from '@wordpress/i18n'
import { DOMAIN, catalogFor } from '@gopherium/react-auth'

const catalog = await catalogFor('es-ES')
if (catalog !== undefined) {
	setLocaleData(catalog, DOMAIN)
}
```

`catalogFor` resolves to `undefined` for a language the package does
not ship, and the screens stay in English. `@wordpress/i18n` is a
required peer, and your bundler must resolve exactly one copy of it,
or the package translates into a copy your application never loaded.

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
logging in over the network first. `defaultUser` is the canned account
most tests sign in as. It holds no role. `userWithRole('editor')` cans an account under any
role, with its own stable id, so a test can walk both sides of a gate.
`userWithCapabilities('editor', ['posts.edit'], ['author'])` cans one
that also carries capabilities and the roles it may hand out.
`roleOk()` answers a role change with success.

The canned handlers cover the outcomes tests most often need, from
`loginOk` to `loginRateLimited`. The invitation and reset routes
are canned too: `inviteDelivered()`, `inviteUndelivered(link)`,
`activateOk()`, `activateInvalidToken()`, `resetRequestOk()` and
`resetOk()` among them. Naming one says what the test is about, which
reads better than pasting a response body into every spec.

The setup routes come in pairs, one for the code check and one for the
account:

| Code check | Account | The site answers |
| --- | --- | --- |
| `setupCodeOk()` | `firstAccountOk()` | Success |
| `setupCodeRefused(reason)` | `firstAccountCodeRefused(reason)` | The code is refused for `reason` |
| `setupCodeClosed()` | `firstAccountClosed()` | The site already has its first account |
| `setupCodeRateLimited()` | `firstAccountRateLimited()` | Too many attempts |
| `setupCodeStarting()` | `firstAccountStarting()` | The site is still starting |

`setupStatus(open)` answers `isSetupOpen`. `firstAccountOk()` answers
with `createdAccount`, a canned owner named Maria Perez, unless you
pass another account.

No handler answers a refused field, such as a short password. For
that, pass your own handler to `server.use`, built with `http` and
`HttpResponse`, which this entry also exports.

Two things you have to set up on your side:

- Register the matchers and stubs your own test runner needs, in your
  own setup file.
- Tell your bundler to dedupe `react` and `@tanstack/react-query`.
  Without it, a workspace-linked copy of the package can end up with
  its own React Query context, and your components will not see the
  session you seeded.
