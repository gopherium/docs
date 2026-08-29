---
title: Testing mail
description: Asserting on sent mail with the test double, and running a fake SMTP server when you need a real wire.
---

Most tests never need a mail server. The double in
[`mailkit/testkit`](https://pkg.go.dev/github.com/gopherium/framework/mailkit/testkit)
satisfies `mailkit.Sender` and simply keeps what it is given:

```go
sender := &testkit.Sender{}
service := NewInviteService(sender)

service.Invite(ctx, "maria@example.com")

if len(sender.Messages) != 1 {
	t.Fatal("no mail was sent")
}
```

Assert on `sender.Messages`, and set `sender.Err` to see how your code
handles a relay being down. The double refuses exactly what a real
sender refuses, an empty or malformed recipient and a cancelled
context, so a test cannot pass on a message that would fail in
production.

## A fake relay for end to end tests

When you want the real SMTP wire, run
[go-smtp-mock](https://github.com/mocktools/go-smtp-mock) inside the
test and point the sender at it:

```go
server := smtpmock.New(smtpmock.ConfigurationAttr{MultipleMessageReceiving: true})
server.Start()
defer server.Stop()

sender, err := smtp.New(smtp.Config{
	Host: "127.0.0.1",
	Port: server.PortNumber(),
	From: "crm@example.com",
	TLS:  smtp.TLSNone,
	HELO: "example.com",
})
```

Leaving `PortNumber` unset makes the fake pick a free port, which
`server.PortNumber()` answers after `Start`. Read what arrived with
`server.WaitForMessages(1, timeout)`, and each message's
`MsgRequest()` is the full payload, headers and body together, ready
for a substring assertion.

Three settings above are not decoration:

- `MultipleMessageReceiving: true`. go-mail resets the session after
  delivering, and without this flag the fake erases the recorded
  message when that happens.
- `HELO: "example.com"`. The fake rejects the machine's bare hostname,
  which is what go-mail announces by default.
- `TLS: smtp.TLSNone` and no credentials. The fake speaks neither
  encryption nor authentication, and mailkit refuses to send
  credentials without encryption anyway.
