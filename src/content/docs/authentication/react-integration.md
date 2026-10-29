---
title: React integration
description: The session gate, the hooks, the ready-made screens, and the test harness of @gopherium/react-auth.
---

[`@gopherium/react-auth`](https://www.npmjs.com/package/@gopherium/react-auth)
is the browser half of the authentication stack. It calls the
[authkit endpoints](/authentication/sessions-over-http/) for you and
gives your React application everything around a login.

It ships five entry points, so you take only the layers you want:

| Entry | Contents |
| --- | --- |
| `@gopherium/react-auth` | The core: gate, hooks, backend calls, typed errors, transport |
| `@gopherium/react-auth/wpds` | Ready-made screens on the WordPress Design System |
| `@gopherium/react-auth/wpds/users` | The Users page on WordPress DataViews |
| `@gopherium/react-auth/admin` | The user administration calls |
| `@gopherium/react-auth/testing` | Test harness, canned responses, session seeding |

`react` and `@tanstack/react-query` are peer dependencies, meaning
your application installs them. The `/wpds` entry also expects
`@wordpress/ui`, and `@wordpress/icons` 18.x for its Users row. The
`/wpds/users` entry also expects `@gopherium/godmin` 0.28.x or
0.29.x, `@gopherium/gottext` 0.6 or 0.7, `@wordpress/dataviews` 20.x,
`@wordpress/components` 42.x and `@wordpress/date` 5.57 or a later
5.x. It is an entry of its own, so an application that only signs
people in never installs those.

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
- `SetPasswordScreen` for the person accepting an invitation
- `RequestResetScreen` and `ResetPasswordScreen` for a forgotten
  password
- `SetupCodeStep` and `SetupAccountStep` for a new site's first
  account
- `PasswordField` with `usePasswordField`, the account step's
  password row for your own forms
- `usersMenuItem`, the Users row for your sidebar menu
- `UsersPage` in `/wpds/users`, the list of accounts with what an
  administrator may do to each

None of them know your router, and they stay that way by handing
navigation back to you. `UsersPage`, for example, takes `addLink`, a
link element from your router, for its Add User button.

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
	staticData: { capability: 'manage_users' },
	component: Users,
})
```

### The Users page

`UsersPage` is a Users screen modelled on WordPress's, built on
[DataViews](/admin-ui/lists/), the WordPress list component. It shows
each account with its avatar, its email under its name, its status,
its role and when it was created. A reader can search, filter by role
or status, sort by name, email or date, and page through the accounts.

Your application keeps the view, meaning the search, the filters,
the sort and the page, in its address with godmin's
[`useListView`](/admin-ui/lists/#the-view-in-the-address). It hands
the page the result:

```tsx
import { useListView, listSearch } from '@gopherium/godmin/router'
import { UsersPage, usersListDefaults } from '@gopherium/react-auth/wpds/users'

function Users() {
	const list = useListView<View>(usersListDefaults({ perPage: settings?.pageSize }))
	return (
		<UsersPage
			list={list}
			pageSizes={settings?.pageSizes}
			sizesFailed={settingsFailed}
			roleLabels={{ admin: __('Administrator'), member: __('Member') }}
			addLink={<Link to="/users/new" />}
			headingLevel={2}
		/>
	)
}
```

`settings` and `settingsFailed` stand for your own settings query.
An application with no page size setting passes a fixed size, such
as `usersListDefaults({ perPage: 20 })`. The list shows as loading
until it has a page size or `sizesFailed` is true.

Give the `/users` route `validateSearch: listSearch`, so a reload or
a shared link opens the same view. The page needs godmin's
[`Toaster`](/admin-ui/loading-and-feedback/#toasts) above it, and
your application loads the `@wordpress/dataviews` and
`@wordpress/components` stylesheets, as for any DataViews list.

Each row offers Change role…, Enable or Disable, and Resend
invitation… on an account still waiting to activate. Change role,
Enable and Disable also work on several ticked accounts from the bar
under the list. A click on a name, or a tap on a phone row, opens
Change role. The page never offers anything on the reader's own row,
nor on an account the server marks `editable: false`, so the server's
rule decides what each reader sees. Change role also needs the
session's `grantable` roles, and Enable needs the account's role among
them.

Change role, Enable and Disable report in one toast, however many
accounts they touched. A toast about one account shows its full
name, never cut short, as WordPress does. A refused write shows the
sentence for the error code the server answered, WordPress's own
wherever WordPress has one. For `user_not_editable` that is "Sorry,
you are not allowed to edit this user."

Everything the page takes is data:

| Prop | What it is |
| --- | --- |
| `list` | What godmin's `useListView` returns |
| `pageSizes`, `sizesFailed` | The page sizes your settings offer, and whether the settings failed to load. When they fail, every account shows on one page |
| `roleLabels` | The label of each role your application declares. A role with no label reads as its stored name with a capital first letter |
| `errorMessages` | Words for error codes only your transport answers, keyed by code |
| `addLink` | The link element the "Add User" button goes in |
| `tabs`, `headingLevel` | Tabs under the header, and the level of the title |
| `showAvatars` | `false` when your site shows no avatars, so the page draws none |
| `columns` | Extra columns after Role, see below |

A column comes in as data too. Give it an `id`, a `label` and
`cells`, one per account id. A cell holds the `text` to show,
optional `hidden` words a screen reader hears in its place, and an
optional `link` element the text goes in. Pass the column's id to
`usersListDefaults` as well, so the list shows it:

```tsx
const posts: UsersColumn = {
	id: 'posts',
	label: 'Posts',
	cells: { [account.id]: { text: '3', hidden: '3 posts by this author', link: <Link to="/posts" search={{ author: account.id }} /> } },
}

const list = useListView<View>(usersListDefaults({ perPage: 20, columns: ['posts'] }))
<UsersPage list={list} columns={[posts]} />
```

On a phone the list opens without your column. When a reader turns
it on there, it shows as plain text, since the whole row is one button.

`RoleSelect` is the role menu the page uses, with the role holding the
fewest capabilities first, as WordPress lists roles. Use it in your own
Add User page with the session's `grantable` roles.

### Setting up the first account

A brand new site has no account, so whoever reaches it first could
claim it. The server stops that with a setup code, a one-time code it
writes to a file only the site's owner can open.
[The first account](/authentication/first-account/) covers the server
side. That side needs `authkit` 0.24.0 or newer. Before 0.22.0 the
setup routes answer 404, so `isSetupOpen()` throws. On 0.22.0 and
0.23.0 the account is made, but the step cannot read the answer and
shows an error.

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

### A password field for your own forms

The account step's Password row also ships on its own, for any form
that sets a password, such as your Add User page.
`usePasswordField` holds the password and what the strength meter
says about it. `PasswordField` draws it.

```tsx
const password = usePasswordField({ length: 24, userInputs: [name, email] })

<PasswordField password={password} generateFirst labelPosition="top" readOnly={sending} />
```

- `length` is how many characters each generated password has. The
  field starts with a generated password. WordPress makes 24 on its
  Add User screen and 18 in its installer.
- `userInputs` lists the values the meter treats as easy to guess,
  usually the name and email typed next to the field.
- `generateFirst` puts a "Generate password" button before the field,
  as WordPress's Add User screen does. Each press puts a new password
  in and shows it.
- `labelPosition` places each label, with the names DataForm,
  WordPress's form component, uses. `side`, the default, puts it
  beside the field, as the installer's rows do. `top` puts it above
  the field, as a godmin form does, so the field lines up in an Add
  User form.
- `readOnly` keeps the password and the weak password tick as they
  are, for example while the form is being sent.
- `help` is a line under the field. The account step puts its line
  asking the person to store the password there.

Send `password.value`. `password.ready` turns true once the field
holds more than spaces and, for a weak password, the person has
ticked "Confirm use of weak password". Use it to turn your submit
button on. Call `password.mask(true)` when you send. It hides the
password again, so a password manager offers to save it.

## Invitations and password resets

Since 0.8.0 the package covers how an account starts and how a lost
password comes back. The server side of both is
[invites and resets](/authentication/invites-and-resets/), served by
`authkit` 0.12.0 or newer. On an older backend the invitation and reset
screens get a 404.

An account starts with an invitation. Your Add User page calls
`invite` from `/admin` with an email, a name and optionally a role,
and the server mails an activation link. No password is typed by the
administrator, which is the point: only the invited person ever knows
it. When the server has no mail set up, `invite` answers with the
activation link instead. Show it read-only so the administrator can
deliver it by hand. Either way the answer never reveals whether the
address already had an account.

Resend invitation… on the Users page opens a dialog that sends a new
link to an account still waiting. The link sent before stops
working. When the server has no mail set up, the dialog shows the
new link for the administrator to deliver by hand. No released
`authkit` serves this call yet, as
[the transport section](#talking-to-a-backend-that-is-not-rest) explains.

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

There are sixteen operations in the `AuthTransport` interface:
`fetchSession`, `login`, `logout`, `isSessionRevoked`, `fetchUsers`,
`createUser`, `setUserDisabled`, `setUserRole`, `invite`,
`resendInvite`, `acceptInvite`, `requestPasswordReset`,
`resetPassword`, and the setup calls `isSetupOpen`, `checkSetupCode`
and `createFirstAccount`. You override the ones you want and the rest
keep using REST, which makes a gradual migration possible. Calls to
`configureAuthTransport` add up rather than replace each other, so you
can configure in more than one place.

`resendInvite` is new in 0.16.0. If your code builds a complete
`AuthTransport` object, add it. A transport that overrides only some
calls needs no change. Its REST default sends `{ email }` to
`POST /api/users/invite/resend`, which no released `authkit` serves
yet.

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
| `setUserDisabled` | Throw `UnauthorizedError` when the session is gone, and the errors [Roles in the admin functions](#roles-in-the-admin-functions) lists for it |
| `invite` | Answer `{ delivered: true }` or `{ delivered: false, activation_link }`, the same shape whether the address is taken or fresh. Throw `ValidationError` for bad input, never `EmailTakenError` |
| `resendInvite` | Answer the same shape as `invite`. Throw `UnauthorizedError`, `RateLimitedError`, `UserNotEditableError` for an account the reader may not edit, `ValidationError` for bad input |
| `acceptInvite` | Return the signed-in user. Throw `InvalidTokenError` for a spent, expired or unknown link |
| `requestPasswordReset` | Answer nothing about the address. Throw `RateLimitedError` when the limiter refuses |
| `resetPassword` | Throw `InvalidTokenError` for a dead link, `ValidationError` for a refused password |
| `isSetupOpen` | Return `true` while the site has no account, `false` once it has one |
| `checkSetupCode` | Resolve without spending the code. Throw `SetupCodeError` for a refused code, `SetupClosedError` once the site has an account, `RateLimitedError` when the limiter refuses, `SiteStartingError` while the site starts |
| `createFirstAccount` | Return the created account. Throw the same errors as `checkSetupCode`, and `ValidationError` for a refused field |

If your server checks roles, the admin writes also throw
`RoleUnknownError`, `UserNotEditableError` and `RoleNotGrantableError`,
as [Roles in the admin functions](#roles-in-the-admin-functions) lists.

Every error class of `/admin` except `ValidationError` carries the
server's code as `code`, such as `user_not_editable` on a
`UserNotEditableError`. The class sets it, so your transport throws
`new UserNotEditableError(message)` and passes nothing more. A screen
looks the code up to choose its words.

The setup steps show their own sentence for each error in the
`checkSetupCode` and `createFirstAccount` rows. Two of the errors
carry details the steps read. A `SetupCodeError` carries a `reason`:
`invalid` for a wrong code, `expired` for a code past its lifetime,
or `file` when the server cannot use the code file. A
`ValidationError` from `createFirstAccount`, `createUser` or `invite`
carries the server's `code` and `meta`. In your own transport, build
it as `new ValidationError(message, { code, meta })`.

The account step knows the codes `email_invalid`, `name_required`,
`name_too_long`, `password_too_short` and `password_too_long`. For a
short password it reads the shortest length allowed from `meta.min`.
For any other error it shows "The account could not be created,
please try again" unless you give `SetupAccountStep` an `onError`
prop that returns your own words.

`InvalidCredentialsError`, `RateLimitedError`, `UnauthorizedError`,
`InvalidTokenError`, `SetupCodeError`, `SetupClosedError` and
`SiteStartingError` come from the main entry point.
`EmailTakenError`, `ValidationError` and the errors in
[Roles in the admin functions](#roles-in-the-admin-functions) come
from `/admin`, and `ValidationError` is also exported from the main
entry point.

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
`User` carries a `role`, `confirmed` and `editable`. `confirmed` is
false until the person sets a password from an invitation. `editable`
says whether the signed-in account may change it. When the server
sends one, `avatar` is the address of its picture. `confirmed` and
`editable` are required from 0.16.0, so the server must be `authkit`
v0.24.0 or newer, or your transport must send both. `createUser`
takes an optional `role` for the new account, and
`setUserRole(id, role)` changes one.

`setUserRole` calls `PUT /api/users/{id}/role`.

A role change can be refused eight ways, and each is a typed error a
screen can catch:

| Error | Code | The server said |
| --- | --- | --- |
| `RoleRefusedError` | `role_insufficient` | The signed-in account may not change roles |
| `SelfRoleError` | `self_role_refused` | An account tried to change its own role |
| `LastPrivilegedError` | `last_privileged_refused` | It would remove the last administrator |
| `RoleUnknownError` | `role_unknown` | No role registry declares that role |
| `UserNotEditableError` | `user_not_editable` | The signed-in account may not edit that account |
| `RoleNotGrantableError` | `role_not_grantable` | The signed-in account may not hand out that role |
| `RoleChangedError` | `role_changed` | The account's role changed before the write landed, so reload it |
| `UserNotFoundError` | `user_not_found` | No account has that id any more |

`createUser`, `invite` and `resendInvite` throw `RoleUnknownError`,
`UserNotEditableError` and `RoleNotGrantableError` as well.
`setUserDisabled` throws those too, along with `RoleChangedError`,
`UserNotFoundError`, `LastPrivilegedError` and `RoleRefusedError`. It
throws `SelfDisableError` (`self_disable_refused`) when an account
tries to disable itself. `RoleUnknownError` is also a
`ValidationError`, so a form that shows validation messages shows it
too.

0.16.0 removes `RoleBeyondReachError`. `authkit` v0.24.0 splits its
code `role_beyond_reach` in two, `user_not_editable` and
`role_not_grantable`, as WordPress's REST API does.

Ask `can(user, 'manage_users')` from your screens, never compare role
names. Build a role menu from the session user's `grantable` list,
which arrives when the server's source answers `Grantable`.

An Add User form can show an error from `createUser` under the field
it is about. `fieldError(error)` from `/admin` answers
`{ field, message }`, where `field` is `email`, `name` or `password`.
It knows the codes `email_taken`, `email_invalid`, `name_required`,
`name_too_long`, `password_too_short` and `password_too_long`, and
reads the shortest length allowed from `meta.min`. For any other
error it answers `undefined`, so show that error somewhere else, such
as a toast.

`errorMessageOf(error, errorMessages, fallback)` from `/wpds/users`
gives the words the Users page would show for that error, or
`fallback` when there are none.

## Languages

Every string the package renders is translatable. It ships Spanish
(`es-ES`) and French (`fr-FR`) catalogues and reads the text domain
`DOMAIN`. Load the catalogue for the reader's language once at
startup, with the same `@wordpress/i18n` copy your application uses:

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

Where WordPress already translates the same English, both catalogues
use WordPress's words. The other translations are marked fuzzy,
meaning no translator has reviewed them yet. They still show.

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

`accountWithRole('editor')` cans a listed account with the id, name
and email `userWithRole('editor')` gives. It starts confirmed,
editable and enabled. Its second argument holds the fields a test
wants different, such as `{ confirmed: false }`. `usersOk(accounts)`
lists those accounts and `usersFailure()` fails the list. `roleOk()`
answers a role change with success and `disabledOk()` an Enable or a
Disable. `roleRefused(code)` and `disabledRefused(code)` answer each
with an error code, with the status and message the server sends for
it. `resendDelivered()`, `resendUndelivered(link)` and
`resendRefused(code)` answer a resent invitation.

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
