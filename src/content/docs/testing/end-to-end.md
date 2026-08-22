---
title: End-to-end auth testing
description: Testing a real login with Playwright against a real binary, and the traps that make those tests flaky.
---

End-to-end tests drive a real browser against your real application.
For anything behind a login, that means every test needs a session,
which is where most of the difficulty lives.

This page is a recipe for testing cookie-session authentication with
Playwright, against an application built on `authkit` and
`@gopherium/react-auth`. It comes from the first application to do it.
The setup has to be written per application, so what follows
concentrates on the parts that are easy to get silently wrong.

Throughout, the application is called `myapp` and its environment
variables start with `MYAPP_`.

## Log in once, share it everywhere

Logging in at the start of every test means driving a real form, a
real round trip and a real password hash, over and over. Instead, log
in once through the real interface, save the browser's session, and
let every other test start already logged in.

Playwright calls this a setup project:

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

The Email, Password and Log in selectors match the shared
`LoginScreen` from `@gopherium/react-auth/wpds`, so they work
unchanged in any application using it. Only the line checking what
appears after login is yours.

Then tell Playwright to run that first and have everything else reuse
the saved state:

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

That saved file holds a live session cookie, which makes it a real
credential. Keep its whole directory out of version control by adding
this line to your `.gitignore`:

```text
.auth/
```

## Keep the rate limiter out of your way

Every Playwright browser comes from the same IP address, and the login
limiter counts failed attempts per IP. Run tests in parallel and they
share one budget, so tests start failing for reasons unrelated to what
they test.

Run them one at a time:

```ts
// playwright.config.ts
fullyParallel: false,
workers: 1,
```

Successful logins cost nothing, since only `401` responses count
against the budget. So keep exactly one test that logs in wrongly on
purpose.

Make that test fail on the password rather than the email. A wrong
password exercises the real password check, while an unknown email
only exercises a failed lookup:

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

## Tests that need their own session

Logging out deletes the session on the server. So a logout test using
the shared session destroys the session every later test depends on,
and the rest of your suite fails.

Any test that ends a session must opt out of the shared state and log
in for itself:

```ts
// tests/logout.spec.ts
test.use({ storageState: { cookies: [], origins: [] } })
```

## Proving that disabling an account kills its sessions

The most valuable auth test uses two browsers at once. The admin uses
the shared session. The victim logs in separately. The admin disables
the victim's account, and the victim's next page load lands back on
the login screen.

```ts
// tests/users-disable.spec.ts
const victim = await browser.newContext({
	storageState: { cookies: [], origins: [] },
})
```

Passing `storageState` explicitly is what makes this test real. A new
context created without it inherits the admin's session, and the test
would then prove nothing.

## Seeding the admin account

Use a separate database so resetting it never touches your development
data, and create the account with the same subcommand production uses:

```make
E2E_DATABASE_URL ?= postgres://postgres:postgres@localhost:5434/myapp_e2e?sslmode=disable
E2E_EMAIL ?= e2e@example.com
E2E_NAME ?= Maria Perez
E2E_PASSWORD ?= correct horse battery

e2e-db-reset:
	psql "$(E2E_ADMIN_URL)" \
		-c 'DROP DATABASE IF EXISTS myapp_e2e WITH (FORCE)' \
		-c 'CREATE DATABASE myapp_e2e'

e2e-seed: build
	printf '%s\n' "$(E2E_PASSWORD)" | \
		MYAPP_DATABASE_URL="$(E2E_DATABASE_URL)" \
		./myapp createadmin -email "$(E2E_EMAIL)" -name "$(E2E_NAME)" -role admin
```

Those credentials appear in three places: the test environment module,
the Makefile, and any CI overrides. Nothing checks that they agree.
Keep the defaults character for character identical and change them
only through environment variables.

## Things worth knowing

- The suite runs against plain `http://localhost` and the `Secure`
  `__Host-` cookie still works, because browsers treat localhost as
  trustworthy. You never need an insecure-cookie setting, in tests or
  anywhere else.
- Signed public endpoints, such as a webhook a plugin declares, are
  the exception to cookie authentication. Their tests authenticate
  with the upstream signature instead of a saved session.
- If your application reads a dotenv file at startup, make the
  end-to-end serve target point outbound integrations at dead
  endpoints. Otherwise a local run uses live credentials.

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

Start the database the way developers do, with the repository's
compose file, rather than a CI service block. Then there is one
description of the environment instead of two that can drift.
