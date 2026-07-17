---
title: Coverage harness
description: Counting main() and CLI subcommands toward coverage with GOCOVERDIR.
---
How to make `main()` and CLI subcommands count toward test coverage
using Go's binary coverage instrumentation. Without this, a
100%-coverage discipline silently excludes the entrypoint, flag
parsing, and process-level failure paths, and a CI copied from another
project loses the numbers without anyone noticing.

Placeholders: the app is `myapp`, its env prefix is `MYAPP_`.

## The idea

`go build -cover` produces a binary that writes coverage counters into
the directory named by `GOCOVERDIR`. Exec-style tests run that real
binary as a child process, and `go tool covdata` merges the counters
with the ordinary unit-test profile into one number that includes
`main()`.

## The test helper

Exec tests skip unless the harness drives them, so a plain
`go test ./...` stays fast and environment-free:

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

Stripping the app's own env vars from the child matters. A developer's
shell exports must not leak into a test that asserts missing-config
failures.

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

Scoping matters twice. The binary build uses `-coverpkg=./cmd/...` so
counters attribute to the command packages, and the unit profile
excludes generated code so the gate measures only hand-written lines.

## The local and CI split

CI usually runs the plain unit profile, fast and dependency-light. The
merged number including `main()` is the local `make cover` target, run
before handing work back. If CI should enforce the full number, give
it a dedicated job running the same target. Document which one gates,
so a green check is never mistaken for the stronger claim.
