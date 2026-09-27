# MIRA FIVE ingest protocol — v1

This is the wire every MIRA FIVE SDK speaks. It is small on purpose: a browser can
send it without a CORS preflight, and a server can send it with nothing but `fetch`
or `curl`. Feature flags have their own document format, described in
[FLAGS.md](FLAGS.md).

The keywords MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119.

## 1. Keys

A **source** in MIRA FIVE has exactly one kind of key:

| Source type | Key | Where it may appear |
|---|---|---|
| Website | public **website key** | page source, URL path |
| Server | **secret key** | `Authorization: Bearer` header only |

Keys match `mf_[a-z0-9]{8}_[A-Za-z0-9_-]+` (older keys `mira_ik_…` are still
accepted). The part up to the last `_` is the key's **namespace** (e.g.
`mf_ab12cd34`); SDKs use it to name local storage so that the secret-looking tail is
never stored. A key without `_` has the namespace `default`.

- A secret key MUST NOT be shipped to a browser. The server marks a secret key that
  arrives with an `Origin` or `Sec-Fetch-Site` header as exposed.
- A website key sent as a bearer is refused (`403 website_key_as_bearer`); a secret
  key in a URL path is refused (`403 secret_key_in_path`).

## 2. Sending events

| Sender | Request |
|---|---|
| Browser | `POST {host}/v1/batch/{websiteKey}`, body `Content-Type: text/plain;charset=UTF-8` |
| Server | `POST {host}/v1/batch`, `Authorization: Bearer {secretKey}`, `Content-Type: application/json` |

The body is the same JSON batch (§3) in both cases. The browser form is a CORS
*simple request*: no preflight, and it works with `navigator.sendBeacon`. The server
reads the body as JSON whatever the content type says.

The default host is `https://events.mirafive.io`.

Website keys are checked against the source's allowed origins (`Origin` header;
`www.` and the apex count as one site; `localhost` is always allowed).

### Limits

- body ≤ 1 MiB (`413 payload_too_large`)
- 1–1000 events per batch
- per-address and per-key rate limits (`429 rate_limited` with `Retry-After`)

## 3. The batch

```json
{
  "v": 1,
  "batch": "0192d4a8-7b1c-4e8a-9c1d-2b3e4f5a6b7c",
  "mode": "full",
  "sentAt": 1727430000000,
  "context": {
    "sdk": "mirafive-browser/0.5.0",
    "locale": "de-DE",
    "timezone": "Europe/Berlin",
    "screen": [1512, 982]
  },
  "events": [
    {
      "name": "$pageview",
      "time": 1727429999990,
      "page": { "url": "https://shop.example/pricing?utm_source=news", "title": "Pricing", "referrer": "https://www.google.com/" },
      "anonymousId": "5f0c1c8e-3e0e-4a57-9d59-3f7f2a6d1e44",
      "sessionId": "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e"
    }
  ]
}
```

### Batch fields

| Field | Type | Rules |
|---|---|---|
| `v` | integer | REQUIRED, `1` |
| `batch` | string | REQUIRED, a UUID (any version). The batch's identity: see §5 |
| `mode` | string | REQUIRED, `"consentless"` or `"full"` (§4) |
| `sentAt` | integer | OPTIONAL, epoch milliseconds when the request left the device; used to correct clock skew |
| `context` | object | OPTIONAL, shared by every event in the batch |
| `context.sdk` | string | `name/version`, optionally followed by a space and a framework token; name ≤ 64, the rest ≤ 32 characters, e.g. `mirafive-server/0.5.0`, `mirafive-browser/0.5.0 react` |
| `context.locale` | string | BCP 47, 2–35 characters. **Full only** |
| `context.timezone` | string | IANA name, ≤ 64 characters. **Full only** |
| `context.screen` | `[width, height]` | integers 0–32768. **Full only** |
| `events` | array | REQUIRED, 1–1000 events |

### Event fields

| Field | Type | Rules |
|---|---|---|
| `name` | string | REQUIRED, 1–128 characters, no leading or trailing whitespace. A leading `$` is reserved (§6) |
| `time` | integer | OPTIONAL, epoch ms when it happened. Absent: `sentAt`, else the time received. Far-future and far-past times are clamped by the server |
| `id` | string | OPTIONAL UUID, unique within the batch. Absent: the server derives a stable id from `batch`, the index and `time` |
| `page` | object | OPTIONAL: `url` ≤ 2048, `title` ≤ 512, `referrer` ≤ 2048 characters |
| `properties` | object | OPTIONAL. JSON object, ≤ 32 KB encoded, ≤ 64 leaf values, depth ≤ 5, keys ≤ 128 characters. `revenue` (number) and `currency` (ISO 4217) have meaning |
| `anonymousId` | string | OPTIONAL, 1–256 characters, not blank. **Full only** |
| `userId` | string | OPTIONAL, 1–256 characters, not blank. **Full only** |
| `sessionId` | string | OPTIONAL UUID. **Full only** |

Lengths are counted by the server in Unicode code points. SDKs MAY count UTF-16 code
units instead, which is never more permissive.

Unknown fields MUST be ignored by the server, so SDKs can add hints without breaking
older servers. SDKs MUST NOT rely on that to send data the protocol does not define.

Page URLs SHOULD be cleaned before sending: keep only `utm_*`, `ref`, `source`,
`gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `ttclid` and `li_fat_id` query
parameters (names compared case-sensitively), and drop the fragment unless the
site routes by hash, in which case a query inside the fragment is cleaned the same
way. A URL that does not parse loses everything from the first `?` or `#`.

## 4. Collection modes

**Consentless** is identifier-free and needs no consent banner. A consentless batch:

- MUST NOT carry `anonymousId`, `userId` or `sessionId`;
- MUST NOT carry `context.locale`, `context.timezone` or `context.screen`. A
  consentless SDK MUST NOT read the browser's language, time zone or screen size at
  all;
- MUST NOT write anything to the device (no cookies, no storage).

The server refuses a consentless batch that breaks the first two rules
(`400 validation_failed`) rather than stripping the fields, so a misconfigured SDK
is noticed.

**Full** is for visitors who consented (or for servers acting on consent the
customer already holds). It may carry identifiers and device context.

The source's configured mode is a ceiling: a full source accepts consentless
batches, a consentless source refuses full ones (`400 collection_mode_not_allowed`).
`Sec-GPC: 1` or `DNT: 1` on a browser request downgrades a full batch to
consentless on the server.

## 5. Delivery, retries and idempotency

The server answers a stored batch with **`202`**:

```json
{ "batch": "0192d4a8-…", "accepted": 12, "dropped": 0 }
```

`dropped > 0` with a `reason` means nothing was kept, for one of: `bot`,
`install_check`, `ingestion_paused`, `allowance_exhausted`. A 202 is final: do not
retry it.

**The batch id is the idempotency key.** Sending the same `batch` again within a day
is counted and stored once. An SDK that retries MUST resend the byte-identical body.

A server SDK that accepts a caller-supplied idempotency key MUST derive the batch id
from it, so every SDK agrees:

```
batch = UUIDv8( SHA-256( "mirafive:batch:" ‖ key ) )
```

where `key` is a non-empty string encoded as UTF-8, taking the first 16 bytes of the digest, then setting the version nibble to `8`
(`bytes[6] = bytes[6] & 0x0f | 0x80`) and the variant to `10xx`
(`bytes[8] = bytes[8] & 0x3f | 0x80`). Test vectors are in
`fixtures/batch-id.cases.json`.

### Errors

Errors are JSON: `{ "code": "…", "detail": "…" }`, and `validation_failed` adds
`"errors": [{ "path": "events.0.name", "message": "…" }]` (at most 10).

| Status | Code | Retry? |
|---|---|---|
| 400 | `invalid_json`, `validation_failed`, `collection_mode_not_allowed` | no |
| 401 | `unauthorized` | no |
| 403 | `origin_not_allowed`, `website_key_as_bearer`, `secret_key_in_path`, `secret_key_exposed` | no |
| 408 | — | yes |
| 413 | `payload_too_large` | no (split the batch) |
| 429 | `rate_limited` | yes, after `Retry-After` |
| 5xx | e.g. `503 sink_unavailable` | yes |
| network error or timeout | — | yes |

SDKs SHOULD retry with full-jitter exponential backoff and honour `Retry-After`.
A browser flushing on page hide uses `sendBeacon` and cannot read the answer; that
is accepted.

## 6. Reserved event names

| Name | Sent by | Carries |
|---|---|---|
| `$pageview` | browser SDKs | `page`. Optional property `$boot: 1` when the page's consent answer was known when it first drew |
| `$autocapture` | browser SDKs | `$event_type` (`click`/`submit`/`change`), `$el_tag`, `$el_selector`, `$el_id`, `$el_classes`, `$el_text`, `$el_href`, `$el_name`, `$el_type`, `$el_attrs` |
| `$identify` | any, **full only** | `userId`, the person's traits as `properties` |
| `$search` | any, **full only** | `query` (the server scrubs emails and long digit runs) |
| `$exposure` | any, **full only** | `$experiment` (`^[a-z][a-z0-9-]{1,63}$`), `$variant` (`^[a-z][a-z0-9-]{0,39}$`), optional `$boot`, `$snippet`; needs `anonymousId` or `userId` |
| `$install_check` | setup tools | nothing; proves a key and host work, never stored or billed |

Any other name starting with `$` is refused. `$identify`, `$search` and `$exposure`
in a consentless batch are dropped.

## 7. Browser state (shared with page snippets)

Full-mode browser SDKs and the page-experiment snippet generated by the MIRA FIVE app
read the same `localStorage` entries. `{ns}` is the key's namespace (§1).

| Key | Value | Lifetime |
|---|---|---|
| `mirafive:{ns}:aid` | `{anonymousId}.{lastSeenEpochMs}` — the id is a UUID (readers also accept a bare `{anonymousId}`) | 365 days since last seen |
| `mirafive:{ns}:sid` | `{sessionId}.{lastSeenEpochMs}` — a UUID | 30 minutes idle |
| `mirafive:{ns}:uid` | `{hash}.{lastSeenEpochMs}` — a hash of the user id, used only to notice a user switch | 365 days |

Sessions live in `localStorage`, not `sessionStorage`, so a link opened in a new tab
stays in the same session.

Globals:

| Global | Meaning |
|---|---|
| `window.mirafive` | command queue: `mirafive(verb, ...args)`; before the script loads, calls are queued in `mirafive.q` |
| `window.__mirafive_consent` | set by a consent tool before the SDK loads: `false`, or `{ statistics, experiments, targeting }` booleans |
| `window.__mirafive_ignore` | truthy: send nothing from this browser (e.g. the site owner's own visits) |
| `window.__mirafive_experiments` | page-experiment decisions pushed by the snippet: `{ k, v, s, w, m, h, b }` (see FLAGS.md §6) |
| `window.__mirafive_aid_next` | an anonymous id minted by a snippet before consent; becomes the anonymous id on consent |

Browser SDKs MUST send nothing when `navigator.doNotTrack === "1"`,
`navigator.globalPrivacyControl` is true, `__mirafive_ignore` is set, the page is
prerendering, or the host is `localhost`, `127.*`, `[::1]`, `*.local` or a `file:`
URL (unless the site opts in to tracking localhost).
