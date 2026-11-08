# @mirafive/protocol

The MIRA FIVE wire format and the helpers every MIRA FIVE SDK shares: event and batch types,
limits, reserved names, `eventIdFor`, UUIDv7, property cleaning and retry rules. No
dependencies; runs in browsers, Node, Bun, Deno, workers and Convex.

The MIRA FIVE ingest checks its own schema against this package on every build, so what
`validateBatch` accepts is what the ingest accepts.

You rarely install it yourself: [`@mirafive/web`](https://github.com/mirafive/sdk-web) and
[`@mirafive/node`](https://github.com/mirafive/sdk-node) depend on it. Use it to build your own
integration, to validate batches, or to port MIRA FIVE to another language.

## Contents

| Export                                                                                                                     | What it is                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WireEvent`, `WireBatch`, `BatchResult`, `EventContext`, `Revenue`, `Consent`                                              | The types of what `POST /v1/batch` accepts and answers. They are checked against the ingest's own schema on every build, so they cannot drift.    |
| `LIMITS`, `reservedEvents`, `externalIdTypes`, `revenueKinds`, `billingIntervals`, `touchpointKinds`, `touchpointChannels` | The rules, as values.                                                                                                                             |
| `eventIdFor(key)`                                                                                                          | A stable event id from your own key: UUIDv8 from SHA-256. The same key gives the same id in every MIRA FIVE SDK and language.                     |
| `uuidv7()`                                                                                                                 | Time-ordered event ids.                                                                                                                           |
| `cleanProperties(value)`, `cleanExternalIds(value)`                                                                        | Make arbitrary values fit the wire: flatten objects to dot keys, apply the limits.                                                                |
| `retryable(status)`, `backoffMs(attempt, atLeastMs)`, `retryAfterMs(header)`                                               | The retry rules every SDK follows.                                                                                                                |
| `keyKind(key)`                                                                                                             | `"public"` (`mira_pk_…`), `"secret"` (`mira_sk_…`) or `"unknown"`.                                                                                |
| `validateBatch(batch)`, `validateEvent(event)`                                                                             | Every problem the ingest would reject, as `{ path, message }`; an empty list means accepted. No dependencies.                                     |
| `mirafive-validate` (`npx @mirafive/protocol batches.json`)                                                                | The same check on the command line, for SDKs in other languages and CI: one batch or a list, from a file or standard input; exits 1 on a problem. |
| `@mirafive/protocol/batch.schema.json`                                                                                     | JSON Schema (2020-12) of a batch, generated from the ingest's schema.                                                                             |
| `@mirafive/protocol/fixtures/event-ids.json`                                                                               | `eventIdFor` test vectors for SDKs in other languages.                                                                                            |
| `@mirafive/protocol/fixtures/batches/{valid,invalid}/*.json`                                                               | Batches the ingest accepts and rejects, for SDK test suites.                                                                                      |

## Deal events

A project's pipeline (its sales stages) can be fed by any events, mapped in MIRA FIVE's settings.
Two built-in events need no mapping at all; send them with a secret key and a person:

| Event         | Properties                                                                         | Meaning                                                                       |
| ------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `$deal_stage` | `deal_id`, `stage`, optional `value` (whole minor units of the reporting currency) | The deal reached this stage. The latest `value` is the deal's expected value. |
| `$deal_lost`  | `deal_id`, optional `reason`                                                       | The deal will not reach the end of the pipeline.                              |

`@mirafive/node` (`dealStage`, `dealLost`), `@mirafive/convex` and `mirafive/sdk-php` send them.

## The wire in one request

```sh
curl https://events.mirafive.io/v1/batch \
  -H "Authorization: Bearer $MIRAFIVE_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"events":[{"event_id":"0192d4a8-7b1c-7e8a-9c1d-2b3e4f5a6b7c","type":"track","event":"report_exported","user_id":"user_42","consent":"not_applicable"}]}'
```

The answer is `{ "accepted": 1, "duplicates": 0, "rejected": [] }`. Events are checked one by
one, so a bad event never sinks the batch; resend a batch with the same `event_id`s and it counts
once.

## For AI coding assistants

Rules for integrating MIRA FIVE correctly. They hold for every MIRA FIVE SDK.

- **Keys:** the public key (`mira_pk_…`) goes in browser and app code. The secret key (`mira_sk_…`)
  goes only into the server's environment (`MIRAFIVE_SECRET_KEY`), never into client code, a
  `NEXT_PUBLIC_`/`VITE_`/`PUBLIC_` variable or a repository. The SDKs refuse the wrong key.
- **Money** is sent only from the server: integer minor units plus an ISO 4217 currency
  (`amount: 1999, currency: "EUR"` is 19.99 EUR), never floats.
- **Count once:** give money an `entryId` from the payment provider (`stripe:in_123`), so the
  Stripe connector and retries do not double it. Give business events a stable id:
  `eventId: await eventIdFor("order:123:paid")`. The same key gives the same id in every SDK.
- **Personal data** never goes into event names or properties. Use your own user id (not an email)
  for `identify`; put email, name and phone in its traits, which MIRA FIVE encrypts at rest.
- **Consent:** keep `consent: "auto"`; it follows the site's consent banner (Usercentrics,
  Cookiebot, consentmanager, CCM19, Borlabs, any TCF 2.2 CMP, Google Consent Mode). Call
  `consent()` only for a custom banner. Do not gate the SDK behind consent yourself: without
  consent it is cookieless and still counts.
- **Never block on analytics:** event methods return nothing, never throw, and batch on their
  own. Do not `await` or `try` them. Call `flush()`/`shutdown()` only at the end of a script or a
  serverless function.
- **Server events and visitors:** pass the browser's `mira.anonymousId` to your server and set it
  as `anonymousId` on server events, so a purchase joins the visit and its source.
