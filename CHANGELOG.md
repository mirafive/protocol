# Changelog

## 2.1.0 — 2026-11-08

### Added

- `$deal_stage` and `$deal_lost`: a deal of the project's pipeline reached a stage (`deal_id`,
  `stage`, optionally `value` in minor units of the reporting currency) or was lost (`deal_id`,
  optionally `reason`). Types `DealStageProperties` and `DealLostProperties`, `DEAL_LIMITS`, their
  rules in `validateEvent`, and fixtures. The MIRA FIVE ingest accepts them from secret keys only,
  with a `user_id` or `anonymous_id`; MIRA FIVE's pipeline reads them without any mapping.

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
