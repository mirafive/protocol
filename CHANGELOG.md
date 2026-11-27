# Changelog

## 2.5.0 — 2026-11-27

### Added

- `redactPii(text, blank?)`: finds emails, IBANs, phone numbers and payment card numbers in free
  text and returns the text with each match blanked (`[redacted:<kind>]` by default, or what
  `blank(kind, match)` returns) and the number of matches per kind. These are the patterns of the
  MIRA FIVE ingest's PII guard, which uses the same function, so a browser can blank personal data
  before it sends or records anything. Runs in time linear in the text's length on any input.
  A card number is 13 to 19 digits, plain or grouped by spaces or dashes, with a card network's
  prefix and length, that passes the Luhn check; a match that lies wholly inside a UUID is kept.
- `piiKinds` (`email`, `iban`, `phone`, `card`) and the types `PiiKind`, `PiiCounts` and
  `PiiBlank`.
- The wire format of session recordings, which the MIRA FIVE ingest speaks from now on:
  - `BatchAnswer`: the `202` of `/v1/batch` and `/v1/p` may carry a `replay` field
    (`ReplayAnswer`: `session_id`, `masking`, `never_record`, `sensitive`) when the server records
    the session. Additive: an SDK that reads only `response.ok` is not affected.
    `readReplayAnswer(body)` reads it from an answer body as the ingest's schema would, or returns
    `undefined`.
  - `ChunkQuery` and `replayChunkUrl(host, query)`: a chunk, `POST /v1/replay?…` with the gzip of
    the rrweb events as its body. A recording is one stream per tab: each chunk names its `tab`
    (`TAB_ID`, `isTabId`: 8 to 32 characters of base64url, made at random per tab) and its `seq`
    counts from 0 in that tab; `WithdrawQuery` and `replayWithdrawUrl(host, query)`: consent was
    withdrawn, `POST /v1/replay/withdraw?…`. Both are CORS simple requests.
  - `REPLAY_LIMITS` (chunk size, what a beacon carries, pages per chunk, tabs per session,
    sequence, time spans),
    `maskingModes` (`standard`, `strict`), `chunkRefusals` (the reasons of a `409`), `isGzip`.
  - `matchesPage(pattern, path)` and `matchesAnyPage(patterns, path)`: the page patterns of
    `never_record` and `sensitive`, where `*` stands for any run of characters and a pattern
    matches the whole `location.pathname`.

## 2.4.0 — 2026-11-23

### Added

- `WireEvent.page_event_id`, also in the JSON Schema: an `$engagement` event names the `event_id`
  of the pageview it measures, and the server attaches it to that pageview's visit for up to 24
  hours (a tab shown again after an hour). Optional and only a hint: the JSON Schema describes the
  expected UUID, while the ingest drops a malformed id and keeps the event, so `validateEvent`
  reports no problem for one. Servers before this field ignore it.

## 2.3.0 — 2026-11-10

### Added

- `PersonErasure`, `PersonErasureError` and `personErasurePath`: the types and the path of
  `DELETE /v1/persons/:userId`, which erases one person with a secret key (GDPR Art. 17). The
  server SDKs expose it as `deletePerson`. Events that name an erased person are refused for 30
  days (a `rejected` reason starting with `erased:`).

## 2.2.1 — 2026-11-10

### Changed

- Built and checked with oxfmt 0.78 and oxlint 1.93. The package's code, types and JSON Schema
  are unchanged.

## 2.2.0 — 2026-11-09

### Deprecated

- `revenue.fee` and `revenue.tax`. MIRA FIVE counts revenue as the customer paid it and ignores
  both. `validateEvent` and `validateBatch` no longer check them, and the JSON Schema no longer
  lists them; events that still send them stay valid. They are removed in 3.0.0.

## 2.1.1 — 2026-11-08

### Removed

- `$deal_stage` and `$deal_lost` from 2.1.0. A project's funnel maps its own events to stages
  on the MIRA FIVE server (Settings → Funnel), so the wire format needs no deal events. 2.1.0 is
  deprecated; nothing else changed.

## 2.1.0 — 2026-11-08 (deprecated)

- Added `$deal_stage` and `$deal_lost`; removed again in 2.1.1.

## 2.0.1 — 2026-11-08

### Fixed

- `validateBatch` and `validateEvent` build their rules on first use, so bundlers drop the
  validator from code that never calls it. It had added 1.8 kB gzip to `@mirafive/web`'s script
  tag.

## 2.0.0 — 2026-11-08

A rewrite for the current MIRA FIVE platform: consent tiers, the revenue ledger, touchpoints and
the `/v1/batch` wire format.

### Added

- Published. Wire types and `validateBatch`/`validateEvent`, checked against the
  ingest's schema on every server build; the `mirafive-validate` command; `eventIdFor` with
  cross-language test vectors; the JSON Schema of a batch; valid and invalid batch fixtures.

### Migrating from 1.x

- **Keys:** projects have a public key (`mira_pk_…`, browser and apps) and a secret key
  (`mira_sk_…`, servers). `mf_…` website and secret keys are gone. Every SDK refuses the wrong
  kind of key with a clear message.
- **Host:** `https://events.mirafive.io` (was `collect.mirafive.io`).
- **Environment:** `MIRAFIVE_SECRET_KEY` and `MIRAFIVE_HOST` on servers; the public key as
  `NEXT_PUBLIC_MIRAFIVE_KEY`, `VITE_MIRAFIVE_KEY`, `PUBLIC_MIRAFIVE_KEY` (Astro),
  `NUXT_PUBLIC_MIRAFIVE_KEY` or `MIRAFIVE_PUBLIC_KEY` (PHP templates).
- **Consent:** there are no modes any more. The browser SDK follows the site's consent banner
  (`consent: "auto"`) and collects what each tier allows: cookieless without consent, an
  anonymous id with analytics consent, a user with `identify`. Server events carry the consent
  they were collected under (default `not_applicable`).
- **Revenue:** `revenue()` on the server SDKs, in integer minor units with an ISO currency,
  `entryId` (replaces `payment_id`), `entryKind`, fees, tax, refunds and subscriptions. Revenue
  properties on plain events are no longer read.
