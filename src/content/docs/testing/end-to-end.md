---
title: End-to-end auth testing
description: Testing cookie-session authentication with Playwright against a real binary.
---
How to test cookie-session authentication end to end with Playwright
against a real binary built on `authkit` and `@gopherium/react-auth`.
These patterns come from the first consumer. The scaffolding must be
re-typed per app, so this recipe records the parts that are easy to
get silently wrong.

Placeholders: the app is `myapp`, its env prefix is `MYAPP_`.

## One login, shared by every spec

Log in through the real UI exactly once, in a Playwright setup project,
and save the session for every authenticated spec:

```ts
// tests/auth.setup.ts
import { expect, test as setup } from '@playwright/test'
import { authFile, credentials } from '../env'

setup('logs in and stores the session', async ({ page }) => {
	await page.goto('/')
	await page.getByLabel('Email').fill(credentials.email)
	await page.getByLabel('Password').fill(credentials.password)
	await page.getByRole('button', { name: 'Log in' }).click()
	await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible()
	await page.context().storageState({ path: authFile })
})
```

The Email, Password, and Log in selectors target the shared
`LoginScreen` from `@gopherium/react-auth/wpds`, so they transfer
between apps unchanged. The post-login assertion is the app-specific
line. Wire the projects so the setup runs first and everything else
inherits the saved state:

```ts
// playwright.config.ts
projects: [
	{ name: 'setup', testMatch: /.*\.setup\.ts/ },
	{
		name: 'chromium',
		use: { ...devices['Desktop Chrome'], storageState: authFile },
		dependencies: ['setup'],
	},
],
webServer: {
	command: 'make e2e-serve',
	cwd: repoRoot,
	url: baseURL,
	reuseExistingServer: !process.env.CI,
	timeout: 180_000,
},
```

A saved storageState contains a live session cookie. It is a
credential. Keep its directory out of version control:

```gitignore
.auth/
```

## Quarantine the rate limiter

Every Playwright browser shares one IP, and the login limiter budgets
failed attempts per IP. Two consequences:

```ts
// playwright.config.ts
fullyParallel: false,
workers: 1,
```

Successful logins never consume budget, only 401 responses do. Keep
exactly one deliberately-failing login spec, and make it fail on the
password rather than the email, so it exercises password verification
instead of a lookup miss:

```ts
// tests/login-invalid.spec.ts
test.use({ storageState: { cookies: [], origins: [] } })

test('rejects a wrong password without starting a session', async ({ page }) => {
	await page.goto('/')
	await page.getByLabel('Email').fill(credentials.email)
	await page.getByLabel('Password').fill('wrong password!')
	await page.getByRole('button', { name: 'Log in' }).click()
	await expect(page.getByRole('alert')).toHaveText('Invalid email or password.')
	await page.reload()
	await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible()
})
```

## Specs that must own their session

Logout deletes the session row server side. A logout spec that reuses
the shared storageState revokes the token every later spec depends on.
Opt out of the shared state and log in fresh inside the spec:

```ts
// tests/logout.spec.ts
test.use({ storageState: { cookies: [], origins: [] } })
```

## Proving revocation with a second context

The strongest auth spec drives disable-revokes-live-sessions through
two browsers: the admin uses the shared state, the victim logs in
inside a fresh context, the admin disables the account, and the
victim's next reload lands on the login screen.

```ts
// tests/users-disable.spec.ts
const victim = await browser.newContext({
	storageState: { cookies: [], origins: [] },
})
```

Passing `storageState` explicitly matters. A context created without
it would inherit the admin's session and prove nothing.

## Seed the admin through the binary

Use an isolated database so resets never touch development data, and
seed through the same subcommand production uses:

```make
E2E_DATABASE_URL ?= postgres://postgres:postgres@localhost:5434/myapp_e2e?sslmode=disable
E2E_EMAIL ?= e2e@example.com
E2E_NAME ?= Grace Hopper
E2E_PASSWORD ?= correct horse battery

e2e-db-reset:
	psql "$(E2E_ADMIN_URL)" \
		-c 'DROP DATABASE IF EXISTS myapp_e2e WITH (FORCE)' \
		-c 'CREATE DATABASE myapp_e2e'

e2e-seed: build
	printf '%s\n' "$(E2E_PASSWORD)" | \
		MYAPP_DATABASE_URL="$(E2E_DATABASE_URL)" \
		./myapp createadmin -email "$(E2E_EMAIL)" -name "$(E2E_NAME)"
```

The credential defaults end up in three places: the test env module,
the Makefile, and any CI overrides. Nothing enforces their equality.
Keep the defaults byte-identical and override only through env vars.

## Facts worth knowing

- The suite runs against plain `http://localhost`, yet the `Secure`
  `__Host-` cookie works. Browsers treat localhost as a trustworthy
  origin. No insecure-cookie flag is needed, in tests or anywhere.
- Signed public paths, such as webhook endpoints a plugin declares,
  are the one exception to cookie auth. Their specs authenticate with
  the upstream signature scheme instead of a storageState.
- If the app loads a dotenv file on start, have the E2E serve target
  neuter outbound integrations with dead endpoints, or a local run
  will use live secrets.

## The CI job

```yaml
e2e:
  runs-on: ubuntu-latest
  steps:
    # checkout, Go and Node toolchains, pnpm install
    - run: pnpm exec playwright install chromium
    - run: make e2e-reset
    - run: make e2e
    - if: failure()
      uses: actions/upload-artifact@<pinned-sha>
      with:
        name: playwright-report
        path: test/e2e/playwright-report
```

Start the database the same way developers do, with the repo's compose
file, rather than a CI service block. Dev and CI then share one
environment description.
