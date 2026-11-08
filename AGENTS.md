# Working on @mirafive/protocol

Part of the MIRA FIVE SDKs (github.com/mirafive). Read README.md for what the package does.

## Commands

```sh
bun install
bun run check     # format, lint, types, tests, build: exactly what CI runs
bun test          # tests only
bun run build     # dist/
```

CI also packs the package, installs it into a fresh app, type-checks it under `bundler` and
`nodenext` resolution and loads it in Node (mirafive/.github, scripts/verify-package.ts).

## Rules

- No runtime dependencies besides other `@mirafive/*` packages; frameworks are peers.
- Event methods never throw into the host and never block it: report problems instead.
- A secret key (`mira_sk_…`) never reaches browser code; a public key (`mira_pk_…`) is refused
  on the server.
- The wire format must match what the MIRA FIVE ingest accepts. The ingest's own schema is
  checked against this package on every server build; change both together.
- Tests for every change. Comments explain why, briefly. Conventional Commits.

## Releasing

Bump `version` in package.json, add a `## x.y.z — YYYY-MM-DD` section to
CHANGELOG.md, and merge to main: the release workflow publishes to npm with provenance, tags
`vx.y.z` and creates the GitHub release. Never publish from a laptop.
