# Contributing

Thanks for helping with the MIRA FIVE protocol: the wire contract, flag semantics
and public API every SDK implements.

## Before you start

A change here changes every SDK, so open an issue first for anything beyond a typo or
a clarification. Say which SDKs it affects.

## Setup

```sh
bun install --frozen-lockfile
bun run check
```

`check` runs format, lint, typecheck, tests and build.

## Rules

- PROTOCOL.md, FLAGS.md and API.md are the contract; the TypeScript in `src/` is the
  reference for it. Change both together.
- A behavior change comes with a fixture in `fixtures/`, since the SDKs test against them.
- SDKs copy `src/` and `fixtures/` in with `bun run vendor:protocol`. After a change
  lands here, each affected SDK needs its own PR with the re-vendored files.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

- Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `style`, `revert`.
- The scope is optional and names the area, e.g. `flags`, `pageviews`, `cdn`.
- The description is lowercase, has no trailing period and says what changed:
  `fix: count property bytes as UTF-8, as the server now does`.
- A breaking change gets a `!`: `feat(flags)!: drop the v0 bootstrap format`.
- One logical change per commit.

## Pull requests

- PRs are squash-merged, so the PR title becomes the commit on `main` and must follow
  the commit format above. CI checks it.
- Keep a PR to one change. Say what changed and why; link the issue.
- Don't edit `CHANGELOG.md` or the version. The maintainer writes both when releasing.

## Security

Don't open a public issue for a vulnerability. Report it privately through
**Security → Report a vulnerability** on this repository.

## License

By contributing you agree that your contribution is licensed under the repository's
[MIT license](LICENSE).
