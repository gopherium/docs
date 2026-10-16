---
title: Serving
description: Running your HTTP server under the serve command, on TCP or a private socket, with timeouts, a clean shutdown and an exit when idle.
---

[`gonsole`](https://pkg.go.dev/github.com/gopherium/framework/gonsole)
runs your HTTP server under the `serve` command. When the program is
told to stop, the server gives running requests time to finish. The
function you set as `Program.Serve` reads where to listen with
`call.Env.Listening`, builds the server with `gonsole.NewServer` and
hands both to `gonsole.ServeListening`:

```go
func serve(ctx context.Context, call gonsole.Call) error {
	timeouts, err := call.Env.Timeouts(gonsole.Timeouts{
		ReadHeader: 10 * time.Second, Read: 30 * time.Second, Idle: 120 * time.Second,
		Grace: 10 * time.Second, CancelGrace: 5 * time.Second, StopGrace: 5 * time.Second,
	})
	if err != nil {
		return err
	}
	listening, err := call.Env.Listening(gonsole.Listening{Address: "localhost:8080"})
	if err != nil {
		return err
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /export", func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-time.After(time.Minute):
			fmt.Fprintln(w, "export done")
		case <-r.Context().Done():
			if errors.Is(context.Cause(r.Context()), gonsole.ErrGraceRanOut) {
				http.Error(w, "shutting down, try again", http.StatusServiceUnavailable)
			}
		}
	})
	logger := slog.New(slog.NewTextHandler(call.Stderr, nil))
	srv := gonsole.NewServer("", mux, timeouts)
	stop := func(context.Context) error { return nil }
	return gonsole.ServeListening(ctx, srv, timeouts, listening, stop, logger)
}
```

`ServeListening` never reads `srv.Addr`, so the example gives
`NewServer` an empty address. `gonsole.Serve` still serves on
`srv.Addr`, with the same timeouts and shutdown.

## Timeouts from settings

`Env.Timeouts` reads six settings, each a duration such as `30s`.
The last three are graces, how long one step of the shutdown waits:

- `MYAPP_HTTP_READ_HEADER_TIMEOUT`, to read a request's headers.
- `MYAPP_HTTP_READ_TIMEOUT`, to read the whole request.
- `MYAPP_HTTP_IDLE_TIMEOUT`, to keep an idle connection open.
- `MYAPP_SHUTDOWN_GRACE`, for running requests to finish.
- `MYAPP_SHUTDOWN_CANCEL_GRACE`, for cancelled requests to answer.
- `MYAPP_SHUTDOWN_STOP_GRACE`, for `stop` to run.

The `Timeouts` you pass holds the fallbacks, used when a setting is
empty. gonsole has no defaults of its own, so fill in all six. A
field you leave out is zero. A read timeout of zero means no limit,
and a header or idle timeout of zero takes the read timeout. A grace
of zero makes `ServeListening` fail before it listens. A setting you
do set must be above zero.

`NewServer` sets no write timeout, so a response that keeps sending,
such as an event stream, is never cut off.

## Where the server listens

`Env.Listening` uses the first of these that is set: `MYAPP_SOCKET`, the
path of a [private socket](#on-a-private-socket), then `MYAPP_ADDR`, then
`PORT`, then the `Address` you pass. `PORT` has no prefix, because the
hosting platform sets it. It must be a whole number from 1 to 65535, and
the server then listens on every network address of the machine. To
listen on one only, start the program with `MYAPP_ADDR=127.0.0.1:$PORT`,
which wins. Call `call.Env.Listening` in `Program.Validate` too, so
`myapp check` reports a bad setting before a deploy.

## On a private socket

A Unix socket is a file that a server listens on in place of a TCP port.
Sockets work on Linux only. gonsole creates the file with mode 0600, so
from its first moment only programs running as the same system user can
connect. The path must fit in 107 bytes and must not start with `@`.
gonsole never creates the folder, so make it first with mode 0700.

Beside the socket, gonsole keeps an empty lock file, its path with `.lock`
added, such as `/run/myapp/myapp.sock.lock`. Each copy of the program
takes the lock before it listens and holds it until the socket file is
gone, so two copies never remove each other's socket. A copy stops when
another holds the lock. Otherwise it looks at the path:

- Nothing there: it listens.
- A socket nothing answers on, left by a crash: it removes it and listens.
- A socket a server answers on: it stops.
- Anything else, such as a folder: it stops and leaves it in place.

A copy that stops still runs `stop`, and `serve` exits 1. When another
copy owns the socket, the error is one of these:

```text
myapp: http server: a server already listens on /run/myapp/myapp.sock
myapp: http server: another server is starting on /run/myapp/myapp.sock
```

The socket file is removed as the shutdown begins, and the lock is freed
just after, so a new copy can start while the old one finishes its
requests. The lock file stays. Never delete it while a copy may run.

## The visitor's address on a socket

Over a socket, Go gives every request the remote address `@`, so all
visitors would look like one. A socket therefore needs
`MYAPP_CLIENT_ADDR_HEADER`, the header where the program in front, such
as a web server, puts the visitor's address before it passes the request
to the socket. Without it `serve` stops with
`myapp: MYAPP_CLIENT_ADDR_HEADER is required to serve on a socket`.

The header must hold one IP address, such as `203.0.113.7`, or one
address and port. gonsole writes it to `RemoteAddr` as host and port,
port 0 when it has none. Anything else gets the answer 400, runs no
handler and logs `refused a socket request without one visitor address`
with the header's name in `header`. The header is dropped from every
request, on TCP too.

`gonsole.OverSocket(r)` reports whether a request came over a socket.
`Host`, `X-Forwarded-Proto` and `X-Forwarded-Host` pass untouched.
`r.TLS` stays nil, so `X-Forwarded-Proto` is how a handler learns the
visitor used HTTPS. Code that keeps that header only when `RemoteAddr`
is a known proxy now finds the visitor there, so have it also keep the
header when `OverSocket` is true.

## Exiting when idle

Set `MYAPP_IDLE_EXIT` to a duration such as `600s`, and the server ends
its run once nothing has been open that long, no connection and no
running request. Zero, the fallback when you leave `IdleExit` out, means
never. A kept-alive connection, one a client holds open for its next
request, stays open until the idle timeout closes it. So with
`MYAPP_HTTP_IDLE_TIMEOUT` at `120s`, a `600s` idle exit can come 12
minutes after the last request.

An idle exit needs the server's read timeout above zero, and no idle or
read header timeout below zero. Without them one client could keep the
server up forever, so `ServeListening` fails before it listens.

A request counts as open until its handler returns. With no write
timeout, a client that stops reading a large answer keeps its handler,
and so the server, running. Bound a long answer with
`http.ResponseController.SetWriteDeadline` before each write. A
connection a handler takes over, such as a WebSocket (Go calls this
hijacking), keeps the server up until whoever holds it closes it. Close
it when the session ends, or the idle exit never comes.

When the time passes, the server logs `no connection for the idle exit`
and [shuts down](#the-shutdown-in-order) as it does when told to stop.
`serve` then exits 0, and the hosting platform or the program in front
starts it again on the next visit.

## What the program in front must do

- Keep other system users out of the socket and its folder.
- Write the header, such as `X-Client-Addr`, on every request with
  exactly one address, replacing any copy the visitor sent.
- Set `X-Forwarded-Proto` to exactly `http` or `https`.
- Pass `Host` as the visitor sent it.
- Make each heartbeat, a check that the server is alive, carry the
  header or be a bare connection that opens and closes. Heartbeats
  closer together than `MYAPP_IDLE_EXIT` prevent the idle exit.
- Start one copy at a time, under a lock file of your own, never the
  socket's path or its `.lock` file. gonsole locks the socket only inside
  `ServeListening`, so two copies both run whatever `serve` does first.
- When a copy stops because another owns the socket, send the request
  to the socket, after a moment for `another server is starting`.
- Take a refused connection or a missing socket file as a stopped copy.
  Start it again and resend the request, which reached nothing.
- Resend a request whose connection closed before the answer began only
  when it is safe to repeat, such as a GET. A handler may have run.

## The shutdown in order

SIGTERM is the signal a deployment sends to stop a program. When
SIGTERM or Ctrl-C arrives, or the idle exit comes, `ServeListening`
shuts down in four steps:

1. It stops taking new connections and waits up to the grace for
   running requests to finish.
2. It cancels the context of every request still running, with
   `ErrGraceRanOut` as the cause that `context.Cause` reports. It
   waits up to the cancel grace for those requests to answer.
3. It closes the connections that are left.
4. It calls your `stop` function, with the stop grace as its time
   limit. That is where you stop workers and close the database
   pool. With plugins, stop the host before the pool closes, as in
   the [host lifecycle](/plugins/host-lifecycle/#stop).

A request's context is not cancelled during the grace. Once step 2
cancels it, the handler can still answer. `/export` answers 503 only
when the cause is `ErrGraceRanOut`, not when the client left.

Step 2 logs `cancelling the requests still running after the
shutdown grace`, with how many in `count`. Step 3 may log `closing
the connections still open after the cancel grace`. That warning
alone does not mean a request was cut off. `ErrStillServing` does.
`ServeListening` returns it when a request is still running after
the cancel grace, and the `serve` command then exits 1.

The server's `Close` never ends a connection a handler took over, and the
shutdown waits for it only while its handler runs. So that handler must
keep running, watch the request context and close the connection itself.
If it ignores the context, `ServeListening` returns `ErrStillServing` and
the connection stays open.

## The orchestrator's wait

Your orchestrator, the tool that stops your containers, sends
SIGTERM and then waits. When the wait ends, it kills the process,
even in the middle of a shutdown. Set that wait above your three
graces added up, plus anything your program does after
`ServeListening` returns. It is `stop_grace_period` in Docker Compose and
`terminationGracePeriodSeconds` in Kubernetes. The example's graces
add up to 20 seconds, and Docker waits only 10 seconds by default.
