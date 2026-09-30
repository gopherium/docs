---
title: Serving
description: Running your HTTP server under the serve command, with timeouts from settings and a shutdown that lets running requests finish.
---

[`gonsole`](https://pkg.go.dev/github.com/gopherium/framework/gonsole)
runs your HTTP server under the `serve` command. When the program is
told to stop, the server gives running requests time to finish. The
function you set as `Program.Serve` builds the server with
`gonsole.NewServer` and hands it to `gonsole.Serve`:

```go
func serve(ctx context.Context, call gonsole.Call) error {
	timeouts, err := call.Env.Timeouts(gonsole.Timeouts{
		ReadHeader: 10 * time.Second, Read: 30 * time.Second, Idle: 120 * time.Second,
		Grace: 10 * time.Second, CancelGrace: 5 * time.Second, StopGrace: 5 * time.Second,
	})
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
	srv := gonsole.NewServer(cmp.Or(call.Env.Value("ADDR"), "localhost:8080"), mux, timeouts)
	stop := func(context.Context) error { return nil }
	return gonsole.Serve(ctx, srv, timeouts, stop, logger)
}
```

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
of zero makes `Serve` fail before it listens. A setting you do set
must be above zero.

`NewServer` sets no write timeout, so a response that keeps sending,
such as an event stream, is never cut off.

## The shutdown in order

SIGTERM is the signal a deployment sends to stop a program. When
SIGTERM or Ctrl-C arrives, `Serve` shuts down in four steps:

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
`Serve` returns it when a request is still running after the cancel
grace, and the `serve` command then exits 1.

A hijacked connection, such as a WebSocket, is one a handler takes
over from net/http. The server's `Close` never ends it, and `Serve`
sees it only while its handler runs. So the handler must keep
running, watch the request context and close the connection itself.
If it ignores the context, `Serve` returns `ErrStillServing` and the
connection stays open.

## The orchestrator's wait

Your orchestrator, the tool that stops your containers, sends
SIGTERM and then waits. When the wait ends, it kills the process,
even in the middle of a shutdown. Set that wait above your three
graces added up, plus anything your program does after `Serve`
returns. It is `stop_grace_period` in Docker Compose and
`terminationGracePeriodSeconds` in Kubernetes. The example's graces
add up to 20 seconds, and Docker waits only 10 seconds by default.
