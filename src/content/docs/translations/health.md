---
title: Catalogue health
description: Four checks that keep catalogues honest, and the gate against two copies of the runtime.
---

Catalogues rot quietly. A message gets renamed and its translation is
orphaned. A placeholder is dropped and the sentence renders broken.
Nothing throws. gottext ships checks you run as ordinary tests, so
the build catches all of it.

All of them come from `@gopherium/gottext/build`.

## Four checks over a catalogue

Each takes PO text and returns the keys that fail. An empty array
means healthy.

```ts
import { mismatched, orphaned, unreviewed, untranslated } from '@gopherium/gottext/build'

const template = readFileSync('languages/myapp.pot', 'utf8')
const catalog = readFileSync('languages/es-ES.po', 'utf8')

expect(untranslated(catalog, template)).toEqual([])
expect(orphaned(catalog, template)).toEqual([])
expect(mismatched(catalog, template)).toEqual([])
console.log(`awaiting review: ${unreviewed(catalog).length}`)
```

| Check | Finds |
| --- | --- |
| `untranslated` | Messages in the template with no translation yet |
| `orphaned` | Translations for messages the template no longer names |
| `mismatched` | Translations whose placeholders do not match the message |
| `unreviewed` | Answers still carrying the fuzzy flag |

`mismatched` is the one that prevents visible breakage. If the
message is `Disable %(name)s` and the translation says `Disable %s`,
the rendered sentence is wrong. It catches the reverse too, a
translation naming `%(name)s` where the message carries a bare `%s`.
It reads fuzzy answers like any other, so a machine translation that
breaks a placeholder fails the gate before it ships.

`unreviewed` is different from its siblings. A fuzzy answer is
answered, so `untranslated` does not list it, and it ships to
readers. The count is review debt, not breakage. Report it in a log
rather than asserting it empty, the whole point of the fuzzy loop is
that it drains through review rather than blocking a merge.

Run the first three per language in a test and a broken catalogue
cannot merge.

## One copy of the runtime

`@wordpress/i18n` keeps loaded catalogues in module state. Two copies
means one holds the translations and the other renders English,
silently.

Two functions gate against it:

```ts
import { pinnedVersions, resolvedVersions } from '@gopherium/gottext/build'

const lockfile = readFileSync('pnpm-lock.yaml', 'utf8')

expect(resolvedVersions(lockfile, '@wordpress/i18n')).toHaveLength(1)
```

- `resolvedVersions(lockfile, name)` lists every version the lockfile
  resolves for a package. More than one is the bug.
- `pinnedVersions(root, packages, name)` lists the version each of
  your packages pins it at, so you can assert they all agree. It reads
  the `dependencies` block only, so a package that declares it under
  `devDependencies` reports nothing.

Worth doing for any package holding module state, not only this one.
