---
title: Dates and numbers
description: Writing dates, times, numbers and money in one format for every reader, whatever language the screens speak.
---

A screen in English can still write dates and numbers the European
way, such as 30/09/2026 and 1.234,56. gottext calls that format the
**format locale**. It is separate from the reader's language, which
[`startLocale`](/translations/runtime/) picks.

## Remember the format locale

Tell gottext the format locale once, usually from a setting your
server sends:

```ts
import { rememberFormatLocale } from '@gopherium/gottext'

rememberFormatLocale('es-ES')
```

Until you do, every helper below writes in the reader's language.

## The helpers

| Helper | Writes | Example |
| --- | --- | --- |
| `formatDate(at)` | a date, day and month in two digits | 30/09/2026 |
| `formatTime(at)` | hours and minutes, on the format locale's clock | 09:05 |
| `formatNumber(value)` | a number, its thousands always grouped | 1.234,56 |
| `formatMoney(amount, 'EUR')` | an amount of a currency | 1.234,56 € |
| `formatWeekday(at)` | the name of the day, in the reader's language | Wednesday |
| `formatList(items)` | words joined as a list, in the reader's language | Height, Weight |

The examples use the es-ES format locale and an English reader. The
clock follows the format locale too, so en-US writes 09:05 AM.

`at` is a `Date` or the text a server stored. An empty string writes
nothing. A bare calendar day, such as a due date stored as
`2026-09-30`, writes that day for every reader, wherever they are. A
full timestamp, such as `2026-09-01T03:00:00Z`, is a moment, so it
shows in the reader's own time zone. For a reader in Los Angeles that
one is still August 31.

`formatDate` takes the
[`Intl.DateTimeFormatOptions`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)
as a second argument, such as `{ month: 'long' }`. `dateStyle` and the
single fields work, and `timeStyle` throws. To show a time, call
`formatTime`. `formatNumber` takes the `Intl.NumberFormatOptions`,
such as `{ maximumFractionDigits: 2 }`.

## Wait for the setting

If your screens draw before the setting arrives, the first dates show
in the wrong format. `FormatLocaleGate` holds them back:

```tsx
import { FormatLocaleGate } from '@gopherium/gottext/react'

<FormatLocaleGate locale={settings?.formatLocale} failed={isError} loading={<Spinner />}>
	<App />
</FormatLocaleGate>
```

It shows `loading` until `locale` holds a value. Then it remembers
that locale and shows your screens. When reading the settings failed,
it shows your screens anyway, in the reader's language. This entry
needs `react` installed.

## Counts in messages

A message such as `%d posts` writes the bare number, so the count
never follows the format locale. Write `%s` and pass the count
through `formatNumber`:

```ts
sprintf(_n('%s post', '%s posts', count, 'myapp'), formatNumber(count))
```

The `unformatted` check names every message of your template that
still writes a number through `%d`, `%i`, `%u`, `%e`, `%f` or `%g`,
upper case `%E` and `%G` and a length such as `%ld` included:

```ts
import { unformatted } from '@gopherium/gottext/build'

expect(unformatted(readFileSync('languages/myapp.pot', 'utf8'))).toEqual([])
```
