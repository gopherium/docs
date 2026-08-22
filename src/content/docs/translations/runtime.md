---
title: Loading a language
description: Resolving the reader's language, loading catalogues, and showing dates in it.
---

This is the only part of gottext that ships to a browser. It answers
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

## Dates

`formatDate` shows a moment in whatever language `startLocale`
settled on:

```ts
import { formatDate } from '@gopherium/gottext'

formatDate(post.publishedAt)
formatDate(post.publishedAt, { dateStyle: 'long' })
```

It takes a `Date` or the text a server stored, and returns an empty
string for an empty input, so a missing date renders as nothing
rather than as `Invalid Date`.

It renders the date only. The options are the
[`Intl.DateTimeFormatOptions`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)
that `toLocaleDateString` accepts: `dateStyle` and the individual
fields work, and `timeStyle` throws. To show a time, pass the fields
you want, such as `{ hour: 'numeric', minute: 'numeric' }`.

`displayLocale()` answers the settled language if you need it
elsewhere. `rememberLocale(locale)` sets it, which `startLocale` does
for you.
