---
title: Templates and catalogues
description: Reading messages out of source into a template, and compiling catalogues into what a browser loads.
---

Two build steps, both from `@gopherium/gottext/build`. One reads your
source and writes the template. The other turns translated catalogues
into JSON.

This entry point needs
[`gettext-extractor`](https://www.npmjs.com/package/gettext-extractor),
an optional peer. Install it or importing anything from
`@gopherium/gottext/build` fails to load:

```sh
pnpm add -D gettext-extractor
```

## Writing the template

`pot` reads your sources and returns the `.pot` file as bytes:

```ts
import { writeFileSync } from 'node:fs'
import { pot } from '@gopherium/gottext/build'

writeFileSync('languages/myapp.pot', pot({
	domain: 'myapp',
	root: process.cwd(),
	sources: ['src/**/*.ts', 'src/**/*.tsx'],
}))
```

- `domain` is the text domain the template carries.
- `root` is what the globs resolve against.
- `sources` are the globs holding your messages.
- `ignored` optionally names paths inside those globs to skip.
- `goRoots` optionally names directories of Go source to read too.

It finds four call shapes: `__` for a plain message, `_x` when a word
needs a context to tell two senses apart, `_n` for a plural, and
`_nx` for a plural with a context. It finds them written plainly or
through an `i18n.` prefix.

Run it in a script your build calls, and commit the template. It is
the list every translator works from.

## Messages from Go

If a message lives in Go rather than TypeScript, mark it and name the
directory in `goRoots`:

```go
Msgid("Save")
```

`goMessages` is the walk behind it, exported if you need it alone.
Without `goRoots` no Go source is read at all.

## Compiling catalogues

A `.po` file is for translators, not for browsers. `compileCatalog`
turns one into the shape `@wordpress/i18n` loads, and
`serializeCatalog` writes it as JSON:

```ts
import { readFileSync, writeFileSync } from 'node:fs'
import { compileCatalog, serializeCatalog } from '@gopherium/gottext/build'

const compiled = compileCatalog(readFileSync('languages/es-ES.po', 'utf8'))
writeFileSync('src/languages/es-ES.json', serializeCatalog(compiled))
```

The output is sorted and deterministic, with the metadata entry
first, so recompiling an unchanged catalogue produces an identical
file and your diffs stay quiet.

Ship one JSON file per language and load it from
[`startLocale`](/translations/runtime/#startlocale).
