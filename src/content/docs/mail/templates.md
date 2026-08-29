---
title: Mail templates
description: The one file per mail format and the directory an operator overrides it from.
---

Every mail is one plain text file. The first line is the subject and
the rest is the body. Placeholders use Go's
[text/template](https://pkg.go.dev/text/template) syntax:

```text
You are invited, {{.Name}}
Hello {{.Name}},

Follow the link below to set your password.
```

Your application ships its templates inside the binary with `embed`,
and one setting names a directory whose files replace them. That is
the whole override story: an operator who wants different wording
drops a file with the same name into that directory, with no rebuild
and no restart, because files are read again on every send.

## Wiring it up

```go
//go:embed templates
var files embed.FS

defaults, err := fs.Sub(files, "templates")
if err != nil {
}
tpls, err := mailkit.NewTemplates(defaults, overrideDir)
if err != nil {
}
```

`fs.Sub` matters. Template names are plain file names like
`invite.tmpl`, with no directories in them, and `Render` refuses a
name carrying a path separator. `fs.Sub` strips the `templates/`
prefix the embedding adds.

`overrideDir` may be empty, which means embedded templates only. A
directory that does not exist is refused at construction, so a typo in
the setting fails at startup instead of silently ignoring every
override.

## Rendering

```go
m, err := tpls.Render("invite.tmpl", map[string]string{"Name": "Maria Perez"})
```

The answer is a `Message` with the subject and body filled and `To`
empty. Any value works as data, a struct or a map alike.

Three details of the split:

- The subject is the first non blank line of the rendered output, so a
  leading `{{/* comment */}}` line is harmless.
- A file with no newline at all is a subject with an empty body.
- A template that renders to nothing answers `ErrNoSubject`.

Windows line endings and a leading byte order mark, which some editors
add invisibly, are both tolerated.
