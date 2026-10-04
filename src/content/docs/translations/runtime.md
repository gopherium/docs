---
title: Loading a language
description: Resolving the reader's language and loading its catalogues.
---

This part of gottext ships to a browser. It answers
one question at startup: which language is this reader in, and where
are its catalogues.

## startLocale

Call it once, before anything renders:

```ts
import { startLocale } from '@gopherium/gottext'

const locale = await startLocale(
	async () => (await fetchLocale()).locale,
	[
		{ domain: 'myapp', load: myappCatalog },
		{ domain: 'mylib', load: mylibCatalog },
	],
	{ defaultLocale: 'en-US' },
)
```

Three arguments:

- **A resolver.** A function answering the language to use. Where it
  comes from is yours: a server call, a browser setting, a saved
  choice.
- **The domains to load.** One entry per text domain. `load` takes a
  locale and answers a catalogue, or `undefined` when the package
  ships none for that language. Leave `domain` out for the default
  domain the WordPress packages read.
- **Options.** `defaultLocale` is the language your sources are
  written in. When the reader is already in it, no catalogue loads.

Every catalogue loads at the same time, not one after another, so
three domains cost one wait rather than three. A domain that answers
`undefined` is skipped and its strings stay in English.

`startLocale` returns the language it settled on, and remembers it.

`displayLocale()` answers the settled language if you need it
elsewhere. `rememberLocale(locale)` sets it, which `startLocale` does
for you.

Dates and numbers can follow a format of their own, apart from the
reader's language. See [Dates and numbers](/translations/dates-and-numbers/).
