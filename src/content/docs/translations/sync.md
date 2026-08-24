---
title: Carrying translations home
description: Pushing machine answers up for review and pulling reviewed translations back, without ever losing one.
---

Translators usually work in a web tool rather than in your
repository. `@gopherium/gottext/sync` moves translations both ways: it
pushes what your repository holds so reviewers see it, and it pulls
their reviewed answers back into your `.po` files.

## The fuzzy loop

Nobody should translate a sentence from scratch in a web form. The
loop this module carries works like this instead.

When a developer adds a message, they add a machine translation for
every supported language in the same change, marked with the `fuzzy`
flag. Fuzzy is gettext's word for an answer that needs review. The
catalogue ships it anyway, so readers see the machine answer today
rather than English.

A push sends the terms and those fuzzy answers to the platform
together. Reviewers filter by fuzzy, fix what needs fixing, and clear
the flag. That is their whole job.

A pull brings the reviewed answers home. A reviewed answer replaces
the fuzzy one it settles. A fuzzy answer from the platform never
replaces an answer your repository has already settled.

## Pulling

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

## Pushing

```ts
import { poeditorAt, pushTranslations } from '@gopherium/gottext/sync'

const done = await pushTranslations(
	poeditorAt({ token, project, domain: 'myapp' }),
	['es-ES', 'fr-FR'],
	{ read, write },
	readFileSync('languages/myapp.pot', 'utf8'),
)
```

Same four arguments. The push uploads the template first, then each
language's catalogue, trimmed to what the template names so a stale
file cannot revive a retired term. Fuzzy flags travel with the
answers.

A supported language the platform does not list yet is added and
filled in the same run. Adding a language to your site is therefore
one commit and one push, reviewers see its full fuzzy batch
immediately.

The platform limits how often a project accepts uploads. The push
paces itself and retries once when it is told to slow down, so a
multi language push takes a little time by design. One project with
several domains means one push per domain, they pace independently.

The returned `Pushed` lists `pushed`, `skipped` and `added`, in words
fit for a log.

## Nothing is ever lost

This is the rule that matters. **A translation already committed is
never removed by a sync, as long as the template still names its
message.** If the platform answers nothing for a message you already
have translated, the committed answer stays. A restored answer keeps
its fuzzy flag, so it still reads as needing review.

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

A reviewer clearing a fuzzy flag without touching the text counts as
a change, the pull writes it home. That is the moment a machine
answer becomes a settled one.

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
