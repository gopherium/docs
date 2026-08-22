---
title: Carrying translations home
description: Pulling translations from a platform into your catalogues without ever losing one.
---

Translators usually work in a web tool rather than in your
repository. `@gopherium/gottext/sync` pulls their answers back into
your `.po` files.

## One call

```ts
import { poeditorAt, syncTranslations } from '@gopherium/gottext/sync'

const done = await syncTranslations(
	poeditorAt({ token, project, domain: 'myapp' }),
	['es-ES', 'fr-FR'],
	{
		read: (locale) => readIfPresent(`languages/${locale}.po`),
		write: (locale, source) => writeFileSync(`languages/${locale}.po`, source),
	},
	readFileSync('languages/myapp.pot', 'utf8'),
)
```

Four arguments: the platform, the languages your site answers in, how
to read and write a catalogue, and the template.

Keep the token and the project id in environment variables, never in
the repository.

## Nothing is ever lost

This is the rule that matters. **A translation already committed is
never removed by a sync, as long as the template still names its
message.** If the platform answers nothing for a message you already
have translated, the committed answer stays.

Retiring a message from your sources retires its translations with
it, which is the point of retiring it.

That protects you from the common accident: a misconfigured project,
an expired token, a partial export, any of which would otherwise
blank a language in one commit.

The returned `Synced` says what happened, in three lists fit for a
log:

- `moved`, the languages whose catalogue changed.
- `skipped`, what the sync did not take.
- `kept`, where the platform held nothing and the committed answer
  stood.

Print all three. A run with a long `kept` list is the signal that
something is wrong at the platform end.

## Plural rules

Languages disagree about how many plural forms they have. English has
two, several languages have three or more.

The sync keeps the plural rule your committed catalogue declares, and
stamps it onto what the platform exported. Where no catalogue is
committed yet, the platform's own rule is taken as it arrives.

Mind the consequence: forms beyond the count your rule names are
dropped. If a language really has three forms, the committed
catalogue must say so, or the third form is lost on every sync.

## Sending messages up

`poeditorAt` also returns `uploadTerms`, which sends the template so
translators see new messages, and `retireTerms`, which removes terms
the template no longer names and returns how many went.

Upload terms freely. Retire deliberately, and only from the template
your build just wrote.
