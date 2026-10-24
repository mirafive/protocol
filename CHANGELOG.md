# Changelog

## Unreleased

- **Breaking:** feature flags and A/B experiments are removed. FLAGS.md, the flag
  fixtures, the page-snippet fixtures, the `hash` and `evaluate` modules, the flag
  types, the lookup limits and the flag error codes (`secret_key_exposed`,
  `lookup_not_allowed`, `invalid_units`, `too_many_units`, `not_found`) are gone, and
  so are the flag parts of PROTOCOL.md and API.md.
- `$exposure` stays a reserved name; the server drops it.
- **Breaking:** the `experiments` (and `targeting`) consent purpose is dropped; only
  `statistics` is left. A client that still sends an `experiments` key is accepted and
  the key is ignored.

## 1.0.0 — 2026-09-27

First version of the protocol repository.

- PROTOCOL.md (events, v1), FLAGS.md (flags, v1) and API.md (SDK surface, 1.0.0).
- JSON Schemas for the batch (with the consentless rules), the receipt and error bodies.
- Fixtures: flag hashing, flag evaluation, page snippets and reserved names from the
  server's engine; batch-id vectors; valid and invalid example batches.
- `@mirafive/protocol` TypeScript reference: `types`, `limits`, `key`, `hash`,
  `evaluate`, `batch-id`, `clean-url`.
