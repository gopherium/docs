---
title: Translations
description: What gottext does, the pieces it has, and the loop a translated application runs.
---

An application that ships in more than one language needs three
things: a list of every message it shows, a translation of that list
per language, and a way to load the right one in the browser.

[`@gopherium/gottext`](https://www.npmjs.com/package/@gopherium/gottext)
does all three. It builds on
[gettext](https://www.gnu.org/software/gettext/), the format most
translation tools already speak, and on
`@wordpress/i18n`, which the design system already uses.

## The loop

1. You write messages in English, wrapped in a translation call.
2. A build step reads your source and writes a **template**, a `.pot`
   file listing every message.
3. Translators fill in a **catalogue** per language, a `.po` file.
4. Another build step compiles each catalogue to JSON.
5. The browser loads the JSON for the reader's language at startup.

Steps 2, 4 and 5 are gottext. Step 3 happens in a translation tool,
and gottext can carry the answers home for you.

## Three entry points

| Import | Runs | Holds |
| --- | --- | --- |
| `@gopherium/gottext` | In the browser | Loading a language, showing dates |
| `@gopherium/gottext/build` | In build scripts | Templates, compiling, health checks |
| `@gopherium/gottext/sync` | In build scripts | Carrying translations home |

The browser entry is the only one that ships to a reader. The other
two run on your machine and in continuous integration.

## Text domains

Every message belongs to a **text domain**, a name that says which
package it came from. Your application has one. Each library that
ships its own messages has its own. Domains keep two packages from
overwriting each other's translations when both use the same English
word.

You pass the domain to every translation call:

```ts
import { __ } from '@wordpress/i18n'

__('Save', 'myapp')
```

## One copy of the runtime

`@wordpress/i18n` keeps loaded catalogues in module state. If your
bundler resolves two copies of it, one copy holds the translations
and the other renders English, with no error anywhere.

gottext ships two functions to gate against that, covered in
[Catalogue health](/translations/health/#one-copy-of-the-runtime).
Check it once and the whole class of bug is closed.

## Next

- [Loading a language](/translations/runtime/) in the browser.
- [Templates and catalogues](/translations/building/), the build steps.
- [Catalogue health](/translations/health/), the checks that keep them honest.
- [Carrying translations home](/translations/sync/) from a platform.
