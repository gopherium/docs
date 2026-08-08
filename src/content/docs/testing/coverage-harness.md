---
title: Coverage harness
description: Making main() and CLI subcommands count toward your Go test coverage.
---

Ordinary Go tests never run your `main()`. So if you aim for 100%
coverage, the numbers quietly leave out your entry point, your flag
parsing, and the paths where the process fails to start. Those are
worth covering, since they are exactly the places a bad deploy shows
up.

This page shows how to include them, using Go's binary coverage
support. It is also worth setting up because a CI config copied from
another project will drop these numbers without anyone noticing.

Throughout, the application is called `myapp` and its environment
variables start with `MYAPP_`.

## How it works

Three pieces:

1. `go build -cover` produces a binary that records coverage as it
   runs. It writes counters into whatever directory the `GOCOVERDIR`
   environment variable names.
2. Your tests run that real binary as a child process, so the code in
   `main()` genuinely executes.
3. `go tool covdata` merges those counters with the ordinary unit test
   results, giving one number that includes `main()`.

## The test helper

Tests that run the binary should only do so when the harness set them
up. Otherwise a plain `go test ./...` would need a built binary and
extra environment, and would be slow and fragile:

```go
// coverBinary returns the instrumented binary path and a child
// environment pointing its counters at the harness directory.
func coverBinary(t *testing.T) (string, []string) {
	t.Helper()
	binary := os.Getenv("MYAPP_COVER_BINDIR")
	coverDir := os.Getenv("MYAPP_COVER_GOCOVERDIR")
	if binary == "" || coverDir == "" {
		t.Skip("skipping binary test outside the coverage harness")
	}
	env := []string{"GOCOVERDIR=" + coverDir}
	for _, entry := range os.Environ() {
		if !strings.HasPrefix(entry, "MYAPP_") && !strings.HasPrefix(entry, "GOCOVERDIR=") {
			env = append(env, entry)
		}
	}
	return filepath.Join(binary, "myapp"), env
}
```

Notice the loop removing every `MYAPP_` variable from the child's
environment. That is deliberate. If a developer has the application's
config exported in their shell, it would leak into the child process,
and a test checking that missing config fails would pass for the wrong
reason.

## The Makefile target

```make
COVERPKGS = $(shell go list ./... | grep -v /internal/generated | paste -sd, -)

cover:
	mkdir -p covdata/unit covdata/bin
	go test -coverprofile=covdata/unit.out -coverpkg=$(COVERPKGS) ./...
	go build -cover -coverpkg=./cmd/... -o covdata/bin/myapp ./cmd/myapp
	MYAPP_COVER_BINDIR=$(PWD)/covdata/bin \
		MYAPP_COVER_GOCOVERDIR=$(PWD)/covdata/unit \
		go test -count=1 ./cmd/myapp
	go tool covdata textfmt -i=covdata/unit -o covdata/total.out
	go tool cover -func=covdata/total.out | tail -1
```

Two of those flags decide whether the number means anything:

- `-coverpkg=./cmd/...` on the build narrows what the binary reports
  on to your command packages. Without it Go instruments every package
  in the main module, so the binary's numbers overlap the unit
  profile's instead of adding the part it was built to measure.
- `COVERPKGS` excludes generated code from the unit profile, so the
  number measures code you actually wrote.

## Local and CI

These are usually split:

- **CI** runs the plain unit profile. It is fast and needs nothing
  extra installed.
- **Locally**, `make cover` gives you the merged number including
  `main()`, which is the one to check before handing work over.

If you want CI to enforce the full number, give it its own job running
the same target. Whichever you choose, write down which one is the
gate. Otherwise a green check gets read as the stronger claim.
