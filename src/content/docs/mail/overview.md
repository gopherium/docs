---
title: Sending mail
description: What mailkit is and how to send your first message through it.
---

[`mailkit`](https://pkg.go.dev/github.com/gopherium/framework/mailkit)
sends application mail, such as invitations and password resets. It
does two jobs: it turns a template file into a subject and a body, and
it delivers the result through an SMTP relay. A relay is the mail
server your application hands messages to.

Your code only ever talks to one small interface, `Sender`. The SMTP
implementation is one way to satisfy it, and the
[test double](/mail/testing/) is another, so your own tests never need
a mail server.

## Sending a message

```go
tpls, err := mailkit.NewTemplates(defaults, "")
if err != nil {
}
sender, err := smtp.New(smtp.Config{
	Host:     "smtp.example.com",
	From:     "crm@example.com",
	Username: "crm",
	Password: "a long enough secret",
})
if err != nil {
}

m, err := tpls.Render("invite.tmpl", map[string]string{"Name": "Maria Perez"})
if err != nil {
}
m.To = "maria@example.com"
err = sender.Send(ctx, m)
```

`Render` fills the subject and body and leaves `To` empty for you to
fill. Forgetting it is safe: every sender refuses an empty recipient.
[Templates](/mail/templates/) explains the file format and the
`defaults` filesystem.

Sending is synchronous. When `Send` returns nil the relay accepted the
message, and when it returns an error nothing was recorded anywhere,
so you decide whether to surface it or resend.

## The errors you can branch on

Every sender answers the same three named errors, so `errors.Is` works
whatever the implementation:

| Error | Means |
| --- | --- |
| `ErrNoRecipient` | the message's `To` is empty |
| `ErrInvalidRecipient` | the address does not parse |
| `ErrNoSubject` | a template rendered to nothing |

Anything else is a delivery failure, one thing to report as such.

## Configuring the relay

`smtp.New` checks the whole configuration up front, so a bad value
fails when your application starts, not at the first invitation.

`Host` and `From` are required. `Port` defaults to 587, the standard
submission port. `Timeout` bounds one delivery attempt and defaults to
go-mail's own. `TLS` names how strongly the connection is protected:

- `TLSMandatory`, the default, refuses to continue without encryption.
- `TLSOpportunistic` encrypts when the relay offers it and continues in
  plain text when it does not.
- `TLSNone` never encrypts. Only for local testing.

Credentials always travel as a pair, and they require `TLSMandatory`,
so a downgraded connection can never carry your password. If your
relay presents a certificate signed by your own authority, put those
roots in `TLSConfig`.

One limit to know: mailkit speaks STARTTLS, the upgrade that starts on
a plain connection. A relay that only accepts already encrypted
connections on port 465 is not reachable and fails as a dial timeout.
Use the relay's port 587 endpoint instead.
