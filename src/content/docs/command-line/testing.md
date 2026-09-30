---
title: Testing commands
description: Running a gonsole program from its tests, in process and as a built binary.
---

[`gonsole/testkit`](https://pkg.go.dev/github.com/gopherium/framework/gonsole/testkit)
runs your program from its tests, in process or as the built binary.
In process means inside the test itself, which is fast.

## Running a command in process

`program` takes the function that reads settings, as the
[overview](/command-line/overview/) shows, and here holds
[`report:create`](/command-line/writing-commands/) too. A test passes
`testkit.Getenv`, which reads only the map it is given, so a setting
exported in your shell never leaks in:

```go
p := program(testkit.Getenv(nil))
got := testkit.Run(t, p, "", "report:create", "-owner", "maria.perez@example.com", "Q3")

want := testkit.Result{
	Code:   gonsole.ExitDone,
	Stdout: "would create \"Q3\" for maria.perez@example.com\n",
	Stderr: "myapp: dry run, nothing changed, pass -yes to apply\n",
}
if got != want {
	t.Errorf("Run() = %+v, want %+v", got, want)
}
```

`testkit.Run` takes the text to feed as stdin, then the arguments.
It returns a `Result` with the exit code, stdout and stderr. A
`Result` compares with `==`, so one check covers all three. Test a
`-json` answer the same way, with the whole document as `Stdout`.

Build a fresh `Program` in every test. `report:create` keeps `-owner`
in a variable. Two tests that share one `Program` and run at the
same time, under `t.Parallel`, would overwrite each other's value.

A test that reaches the database needs a throwaway one, which the
test may fill and drop. Put its address in the map. Here the
[account command](/command-line/account-commands/) reads a password
from stdin:

```go
p := program(testkit.Getenv(map[string]string{"MYAPP_DATABASE_URL": address}))
got := testkit.Run(t, p, "demo-password-1234\n", "account:create-admin",
	"-email", "maria.perez@example.com", "-name", "Maria Perez", "-role", "admin")
```

The test reads `address` from an environment variable of its own,
such as `TEST_DATABASE_URL`. It calls `t.Skip` when that is empty,
so `go test ./...` still passes without Postgres.

## Running the built binary

`testkit.CoverBinary(t, "MYAPP_", "myapp")` returns two things: the
path of your binary and the environment to run it with. `make cover`
from the [coverage harness](/testing/coverage-harness/) builds that
binary with `go build -cover`, so it records which lines run. Outside
`make cover` the test skips. The environment holds no `MYAPP_`
variable at all, so append what the test needs:

```go
binary, env := testkit.CoverBinary(t, "MYAPP_", "myapp")
addr := testkit.FreeAddr(t)
cmd := exec.Command(binary, "serve")
cmd.Env = append(env, "MYAPP_ADDR="+addr)
stderr, err := cmd.StderrPipe()
if err != nil {
	t.Fatal(err)
}
if err := cmd.Start(); err != nil {
	t.Fatal(err)
}
testkit.WaitForListening(t, stderr)
_ = cmd.Process.Signal(syscall.SIGTERM)
if err := cmd.Wait(); err != nil {
	t.Errorf("Wait() = %v, want a clean exit after SIGTERM", err)
}
```

`FreeAddr` answers an address on your own machine that nothing
listens on, and `serve` reads it from `MYAPP_ADDR`. `WaitForListening`
blocks until the server logs `listening`, so the logger `serve` hands
[`gonsole.Serve`](/command-line/serving/) must write to `call.Stderr`.
From there the test can send requests to `addr`.
