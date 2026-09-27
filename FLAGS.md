# MIRA FIVE feature flags — wire spec v1

How SDKs fetch flag documents, evaluate them, hand them from a server to a page, and
count experiments. Event transport, keys and browser state are in
[PROTOCOL.md](PROTOCOL.md); the SDK surface is in [API.md](API.md). Keywords as in
RFC 2119.

The evaluator is defined once, here, and pinned by fixtures generated from the
server's reference engine (§7). An SDK that passes every fixture evaluates like the
server does.

## 1. Documents per source

The server compiles every source's live flags into up to three documents:

| View | Served to | Content |
|---|---|---|
| **browser** | Full website sources | flag definitions the website reads |
| **values** | every website source | the answer each of those flags gives with no facts at all |
| **server** | server sources | flag definitions servers read; `w: 1` on those the website reads too (§5.4) |

A Consentless website source has no id to evaluate rules on, so it only ever gets the
values view. Flags read by servers only never appear in a browser or values document.
Page experiments (§6) appear in browser and values documents, never in server ones.
Documents carry no names, descriptions or segment ids; a segment appears as an opaque
ref.

## 2. Endpoints

All under the ingest host (`https://events.mirafive.io` by default). Keys and where
they travel as in PROTOCOL §1. The server also accepts older keys of the form
`mira_ik_…` in paths.

### 2.1 `GET /v1/flags/{websiteKey}` — browser document

- Full source: the browser document; with `?view=values`, the values document.
- Consentless source: always the values document, whatever the query says.
- `?mirafive-preview-token=…` (§5.2) is honoured on the browser view only.
- `200`, `Content-Type: application/json`, `Cache-Control: no-store`.

Browser SDKs SHOULD fetch with `cache: "no-store"`, `credentials: "omit"` and
`referrerPolicy: "no-referrer"`. No custom headers, so there is no preflight.

### 2.2 `POST /v1/flags/{websiteKey}` — browser document with segment membership

Body `Content-Type: text/plain;charset=UTF-8`, at most 1024 bytes:

```json
{ "anonymousId": "5f0c1c8e-3e0e-4a57-9d59-3f7f2a6d1e44", "identified": true }
```

`anonymousId` is the UUID part of the stored anonymous id (PROTOCOL §7);
`identified` is whether `identify()` ran on the page. Answer (`200`,
`Cache-Control: no-store`):

```json
{
  "document": { "at": 1727430000000, "flags": { "…": {} }, "v": 1 },
  "membership": { "segments": ["3fa9c1e07b"], "unavailable": [], "refreshedAt": 1727429400000, "stale": false }
}
```

- `document` is the browser document of §2.1, preview token included.
- `membership` is left out when the body is missing, longer than 1024 bytes, not JSON,
  or its `anonymousId` is not `usable()` (§4.3), and whenever the request carries
  `Sec-GPC: 1` or `DNT: 1`.
- `membership.segments` are the refs this browser is in; `unavailable` are refs that
  cannot be answered (their conditions are false either way, §4.4); `refreshedAt` is
  when the oldest answered set was last built (epoch ms, or `null`); `stale` is true
  when that is older than the server's freshness limit. While the server has browser
  lookups switched off, every ref the document tests is answered as unavailable.
- Consentless source: `403 lookup_not_allowed`.

A browser SDK MUST use the POST only with the `targeting` consent scope and never under
Do Not Track, GPC, `__mirafive_ignore` or prerendering; otherwise it uses the GET.

### 2.3 `GET /v1/flags` — server document

`Authorization: Bearer {secretKey}`. Answers the server document with
`Content-Type: application/json`, `Cache-Control: private, no-cache` and a weak
`ETag` (`W/"f-…"`). With a matching `If-None-Match` the answer is `304` and no body.
Server SDKs SHOULD refresh on read, at most every `refreshSeconds` (default 30,
minimum 10), and keep serving the last document while a refresh fails.

### 2.4 `POST /v1/flags/segments` — membership for server units

`Authorization: Bearer {secretKey}`, `Content-Type: application/json`:

```json
{ "units": [{ "userId": "u_42" }, { "anonymousId": "5f0c1c8e-3e0e-4a57-9d59-3f7f2a6d1e44" }] }
```

At most 100 units; each needs a string `userId` or `anonymousId` (the other may be
absent or `null`). Answer `200`, `Cache-Control: no-store`,
`{ "units": [Membership, …] }` in request order, each shaped as `membership` in §2.2.
Refused with `422 invalid_units` (not a list, or a unit without a string id) or
`422 too_many_units`. SDKs SHOULD batch the lookups of one tick into one request and
cache answers briefly (the reference SDK: 1 minute, 10,000 units).

### 2.5 Refusals

Errors use the body of PROTOCOL §5 (`{ code, detail }`).

| Status | Code | Meaning |
|---|---|---|
| 401 | `unauthorized` | unknown or revoked key |
| 403 | `secret_key_in_path` | a secret key in a browser path; the key is marked exposed |
| 403 | `website_key_as_bearer` | a website key sent as a bearer |
| 403 | `secret_key_exposed` | a secret key arrived with `Origin` or `Sec-Fetch-Site`: rotate it |
| 403 | `origin_not_allowed` | browser request from an origin the source does not allow |
| 403 | `lookup_not_allowed` | §2.2 on a Consentless source |
| 404 | `not_found` | flags are not available for this key |
| 422 | `invalid_units`, `too_many_units` | §2.4 |
| 429 | `rate_limited` | honour `Retry-After` (seconds) |

Limits count per address, per website key and client network, and per secret key;
segment lookups are charged per unit. A source with nothing compiled yet gets an empty
document, and a paused organization keeps being served. `401` and `403` are final:
a server SDK SHOULD stop fetching until restarted and keep the last document.

## 3. Documents

### 3.1 Envelopes

```jsonc
// browser and server views
{ "at": 1727430000000, "flags": { "new-checkout": { /* Flag */ } }, "orig": ["hero"], "v": 1 }
// values view
{ "at": 1727430000000, "orig": ["hero"], "v": 1, "values": { "new-checkout": ["on"], "limits": ["pro", { "max": 3 }] } }
```

| Field | Meaning |
|---|---|
| `v` | `1`. A reader MUST treat any other version as unreadable and keep what it had |
| `at` | compile time, epoch ms |
| `flags` | flag key → Flag (§3.2) |
| `values` | flag key → `[variant]` or `[variant, value]`: `evaluate(flag, {})`, with the value when the flag has one for that variant. Flags whose empty-facts evaluation is an ERROR are left out |
| `orig` | browser and values views only, optional: keys of page experiments that now show everyone the original (§6.4) |

Bodies are canonical JSON: object keys sorted byte-wise at every depth, no
insignificant whitespace, so the same content is the same bytes. Readers MUST ignore
unknown fields at every level. Size limits: browser and values documents ≤ 64,000
bytes, server documents ≤ 256,000 bytes.

### 3.2 Flag

| Field | Type | Meaning |
|---|---|---|
| `s` | string | seed, `^[0-9a-z]{12}$` (§4.6) |
| `t` | `"b"` \| `"m"` \| `"c"` | on/off (variants `on`/`off`), variants, remote config |
| `u` | `"b"` \| `"p"` | unit: the browser (anonymous id) or the signed-in person (user id) |
| `d` | string | default variant |
| `p` | object, optional | variant → JSON value |
| `r` | Rule[] | first match wins; `[]` when off |
| `off` | `1`, optional | turned off: reason DISABLED |
| `e` | `"r"` \| `"o"`, optional | a counting experiment; before the banner is answered a browser shows a random variant (`r`) or the default (`o`) |
| `c` | `"b"` \| `"s"`, optional | where the experiment is counted: browser or server (§5.5) |
| `need` | integer, optional | feature level the flag needs; absent means 1 |
| `w` | `1`, optional | server view only: the website reads this flag too (§5.4) |

`e`, `c`, `p`, `w` and unknown keys never change what `evaluate()` returns. Variant
keys match `^[a-z][a-z0-9-]{0,39}$`, flag keys `^[a-z][a-z0-9-]{1,63}$`.

### 3.3 Rules and conditions

```ts
type Rule =
  | { if?: Condition[]; x: string }                          // fixed variant; { x } alone is "everyone"
  | { if?: Condition[]; sh?: number; w?: [string, number][] } // share and weights in basis points
type Condition =
  | ["p", property: string, op: Op, value: Json]            // for set/unset the value is null
  | ["s", ref: string] | ["s", ref: string, 1]              // segment ref; 1 = "not in"
type Op = "is" | "not" | "has" | "nhas" | "pre" | "gt" | "lt" | "set" | "unset"
```

`sh` defaults to 10,000 (everyone). Weights may sum to less than 10,000; the rest gets
the default. A rule with `x` together with `sh` or `w` is not valid (UNSUPPORTED).

## 4. Evaluation

### 4.1 Types

```ts
type Facts = {
  id?: string                 // the anonymous id: the unit when u = "b"
  userId?: string             // the unit when u = "p"
  properties?: Record<string, Json>
  segments?: { in: string[]; unavailable: string[] } | "pending" | "unavailable"
}
type Decision = { variant: string; reason: "STATIC" | "TARGETING_MATCH" | "SPLIT" | "DEFAULT" | "DISABLED"; rule?: number }
type Failure  = { reason: "ERROR"; errorCode: "UNSUPPORTED" | "NOT_READY" }
```

`rule` is the 0-based index of the deciding rule; it is absent for DISABLED and for
the final fall-through DEFAULT. A Failure means "no variant": the caller's code
fallback applies.

### 4.2 Order

```
LEVEL = 1
evaluate(flag, facts):
  if (flag.need ?? 1) > LEVEL, or a rule has "x" together with "sh" or "w":  → ERROR / UNSUPPORTED
  if flag.off:                                                                → { d, DISABLED }
  unit = usable(flag.u == "p" ? facts.userId : facts.id)
  for i, rule in flag.r:
    if rule.if has a ["s", …] condition and facts.segments == "pending":      → ERROR / NOT_READY
    if rule.if is present and not every condition holds:                      continue
    if rule has "x":                                                          → { x, rule.if present ? TARGETING_MATCH : STATIC, i }
    if no unit, or bucket(s, ".r", unit) >= (rule.sh ?? 10000):               → { d, DEFAULT, i }
    b = bucket(s, ".v", unit)
    for [variant, weight] in rule.w ?? []:  b -= weight; if b < 0:            → { variant, SPLIT, i }
    → { d, DEFAULT, i }
  → { d, DEFAULT }
```

An empty `if: []` counts as present: `{ if: [], x }` is TARGETING_MATCH. A unit outside
a rule's share gets the default and never falls through to later rules. NOT_READY is
only returned when a rule with a segment condition is actually reached.

### 4.3 `usable(id)`

Returns the id unchanged, or "no id":

- not a string → no id;
- longer than 256 UTF-16 code units (JavaScript `.length`) → no id. Never truncated;
- `bare` = the id with ASCII `A`–`Z` lowered (no other case folding) and the characters
  space, tab, LF, CR, `"` and `'` trimmed from both ends. `bare` empty, or one of
  `undefined`, `null`, `none`, `nan`, `0`, `true`, `false`, `anonymous`, `guest`,
  `id`, `email`, `distinct_id`, `distinctid`, `not_authenticated`, `[object object]`
  → no id.

The hashed unit is always the original id, never `bare`.

### 4.4 Conditions

A property is **missing** when its key is absent (own keys only: `toString` is
missing) or its value is `null`. Scalars are strings, numbers and booleans.

`same(a, b)`, for a property value or list element `a` and a condition value `b`:
both strings — identical code units; both numbers — numerically equal; both booleans —
equal; one string and one number — the string matches
`^-?(0|[1-9][0-9]*)(\.[0-9]+)?$` and parses to the other number; anything else —
false.

The value of `is`, `not`, `has`, `nhas` and `pre` is a list (possibly empty); a
non-list makes the condition false. For `gt`/`lt` it is a number; anything else makes
it false.

| Op | Holds when |
|---|---|
| `is` | the property is a scalar that `same`s a listed value, or a list with a scalar element that does |
| `not` | the property is a scalar or a list and `is` does not hold (an empty list property: true) |
| `has` | the property is a string containing a listed string (non-strings in the list are ignored) |
| `nhas` | the property is a string containing none of the listed strings |
| `pre` | the property is a string starting with a listed string |
| `gt` / `lt` | the property is a number (never a boolean or numeric string) strictly greater / less |
| `set` | the property is not missing |
| `unset` | the property is missing |

Every operator except `unset` is false on a missing property; objects only satisfy
`set`. String comparisons are case-sensitive; `""` is contained in and a prefix of
every string.

**Segment condition** `["s", ref, not?]`: when `facts.segments` is an object and `ref`
is not in `unavailable`, it holds when `ref ∈ in` (or `ref ∉ in` with `1`). In every
other case — segments absent, `"unavailable"`, or the ref unavailable — it is false
for "in" and "not in" alike.

### 4.5 Hash

```
fnv1a32(bytes)        = h ← 0x811c9dc5; for each byte: h ← (h XOR byte) × 0x01000193 mod 2³²
bucket(seed, salt, u) = fnv1a32( ASCII( decimal( fnv1a32( UTF-8(seed ‖ salt ‖ u) ) ) ) ) mod 10000
salt: ".r" for the share, ".v" for the variant
```

Two salts keep share and variant independent: raising a share moves nobody between
variants. Golden values: `fnv1a32` of `abc`, `müller`, `user-42` is 440920331,
1392138076, 39875499; seed `3f9a1c0b7e2d`, unit `user-42` gives `.r` 6137 and `.v`
7627.

### 4.6 Seed

`^[0-9a-z]{12}$`, drawn by the server with a CSPRNG and fixed once a flag has split
anyone, so every unit keeps its bucket.

### 4.7 Facts a browser adds

Browser SDKs evaluate with four facts read from the current page, and never send
them: `$utm_source`, `$utm_medium`, `$utm_campaign` (from the page URL) and
`$referrer_host` (the referrer's hostname), each `null` when absent. Traits from
`identify()` and properties from `setFlagProperties()` are laid over them. Servers
have no page facts.

## 5. Reading flags in SDKs

### 5.1 Units and consent

- `u: "b"` flags use the anonymous id: in a browser the stored `aid` (PROTOCOL §7) and
  only with the `experiments` scope; on a server the id the page passed (the part
  before any `.`).
- `u: "p"` flags use the user id given to `identify()` or `for({ userId })`.
- A flag with `e: "r"` read in a browser before any consent answer uses the pending id
  `window.__mirafive_aid_next`, minting a UUID into it if unset. It becomes the
  anonymous id on consent (PROTOCOL §7).
- Under Do Not Track, GPC, `__mirafive_ignore` or prerendering (a server: the caller's
  opt-out) there is no unit, no segment lookup and no exposure.
- Without `targeting` consent segments are `"unavailable"`. While a browser lookup is
  in flight segments are `"pending"`; after 800 ms without an answer they become
  `"unavailable"`.
- A server read of an experiment counted in the browser (`c: "b"`) answers the
  default with `errorCode: "NOT_ALLOWED"`; only a bootstrap hands it to the page
  (§5.3). A server evaluates an experiment with the anonymous id only when
  `consent.experiments` is not `false`.
- In a browser, an experiment keeps the variant it first showed on a page unless it
  becomes DISABLED.

### 5.2 Overrides and previews

- `?mirafive-preview={flagKey}:{variant}` on the page URL (repeatable) makes the SDK
  answer that variant, if the flag has it (`on`/`off` for on/off flags; for a page
  experiment the snippet's `a`/`b`). A preview is never exposed.
- `?mirafive-preview-token={token}` on the page URL is forwarded unchanged, URL-encoded,
  as the same query parameter of the §2.1/§2.2 request. A valid token puts one code
  experiment's unstarted draft into the browser document for 24 hours. The token is
  opaque to SDKs.
- `overrides` (API.md) answer fixed variants (`true` → `on`, `false` → `off`) and are
  never exposed.

Precedence in a browser: override, preview, `orig` (§6.4), a snippet decision (§6.3),
the document.

### 5.3 Bootstrap block

A server rendering a page may hand its answers to the browser SDK:

```html
<script type="application/json" id="mirafive-flags">{"v":1,"at":1727430000000,"values":{"new-checkout":["on"],"limits":["pro",{"max":3}],"pricing-test":["b",null,1]},"browser":["hero-copy"],"unit":"39875499"}</script>
```

```ts
type Bootstrap = {
  v: 1
  at: number                                       // when the server's document was last confirmed, epoch ms
  values: Record<string, [variant: string, value?: Json, expose?: 1]>
  browser?: string[]                               // keys the browser must decide itself
  unit?: string                                    // String(fnv1a32(userId)) the values were computed for
}
```

- Only flags with `w: 1` (§5.4) may appear. Overrides are included as answered; a
  flag whose evaluation fails is left out.
- `u: "b"` flags whose no-id evaluation reaches a split rule (DEFAULT with a `rule`)
  are listed in `browser` instead: the server never has the browser's anonymous id.
- The third element `1` marks an experiment counted in the browser (`c: "b"`) that
  the server decided by SPLIT: the browser sends its exposure when read, and only if
  `unit` equals `String(fnv1a32(userId))` of its own identified user. The value slot is
  `null` when the variant has no value.
- Encoding: `JSON.stringify(bootstrap)`, then every `<`, `>`, `&`, U+2028 and U+2029
  replaced by `\u` and four lower-case hex digits (`<`, `>`, `&`,
  ` `, ` `). Nothing else is escaped.
- Responses carrying a block MUST send `Cache-Control: private, no-store`.
- A browser SDK reads the block once at start. It ignores a block older than 7 days,
  and fetches the document at once when the block is older than 60 seconds or
  `browser` is non-empty.

### 5.4 `w: 1`

Set in server documents on every flag the website reads as well. A server SDK MUST
put only `w: 1` flags into a bootstrap, so a value meant for servers only never
reaches a page. Browser documents never carry `w`.

### 5.5 Exposures

An exposure is the `$exposure` event of PROTOCOL §6, sent in a full batch with the
unit's `anonymousId` and/or `userId`:

| Property | Value |
|---|---|
| `$experiment` | the flag key |
| `$variant` | the variant shown |
| `$boot` | `1` when the consent answer was known when the page first drew, else `0` (browser) |
| `$snippet` | page experiments only: the snippet hash `h` (§6.2) |

Sent only when all hold:

- the flag has `e` and the decision's reason is SPLIT;
- it is read where it is counted: `c: "b"` and page experiments in the browser,
  `c: "s"` on the server;
- the read uses the value (`flag`, `config`, `enabled`, `variant`, a bootstrap's
  marked value) — never `evaluate()`, listeners or overrides and previews;
- in a browser, the `experiments` scope is granted (exposures read earlier are held
  until then and dropped on a decline), and evaluating again under the id it is counted
  under still gives the same variant.

On a server, generating a bootstrap for a unit counts as reading every marked
`c: "s"` experiment it contains: the page is handed the value, and the browser never
counts `c: "s"`.

Deduplication: a browser sends at most one exposure per flag per page load; a server
at most one per flag, variant and unit per hour — across requests and processes, so a
server SDK keeps its marks in a shared cache when it has one (PHP under FPM).

## 6. Page experiments

A page experiment is drawn before the page renders by a head snippet the MIRA FIVE app
generates per experiment (Full website sources only). The browser SDK counts it. Its
flag has variants `a` (the original) and `b`, 5,000 basis points each today.

### 6.1 The snippet

Placed in `<head>` above the tracker, as a `<style>` and a `<script>`. It stores
nothing. In order it:

1. shows a preview: `?mirafive-preview={k}:{variant}` with a variant it has sets that
   variant and stops (works on any host, pushes nothing);
2. shows the original (`V[0]`) and stops when the hostname is not one of its hosts
   (the allowed origins and their `www.` twins), after `until`, under Do Not Track,
   GPC, `__mirafive_ignore` or prerendering — before any storage read;
3. with `__mirafive_consent.experiments === true`, reads the anonymous id from
   `localStorage["mirafive:{ns}:aid"]` (`{id}.{lastSeenMs}` or the bare legacy `{id}`;
   ignored when empty, the suffix is not a number, or last seen 365 days or more ago);
4. in random mode (`e: "r"`), without a stored id and when the consent answer is not
   known yet or grants experiments, uses `window.__mirafive_aid_next`, minting a UUIDv4
   into it if unset;
5. with an id, draws `b = bucket(seed, ".v", id)` and walks the weights like §4.2;
   without one, shows the original;
6. sets `data-mirafive-{k}="{variant}"` on `<html>` and, only when it drew with an id,
   pushes an entry onto `window.__mirafive_experiments`.

The style hides every `[data-mirafive-experiment="{k}"]` element whose
`data-mirafive-variant` is not the variant on `<html>` (the original while none is set).

### 6.2 `window.__mirafive_experiments`

An array; each entry:

| Field | Type | Meaning |
|---|---|---|
| `k` | string | flag key |
| `v` | string | variant shown |
| `s` | string | the flag's seed |
| `w` | number[] | weights per variant in basis points, in variant order (`a`, `b`) |
| `m` | `"r"` \| `"o"` | random or original mode before consent |
| `h` | string | the snippet's hash (8 hex characters); identifies the snippet copy |
| `b` | `0` \| `1` | `1` when `__mirafive_consent` was set when the snippet ran |

### 6.3 What the browser SDK does

- `flag(k)` answers the entry's `v` (after overrides, previews and `orig`).
- For each entry, once the `experiments` scope is granted: the pending id has become
  the anonymous id; recompute the variant with `bucket(s, ".v", anonymousId)` over `w`.
  If it equals `v` and `k` is not in the document's `orig`, send one exposure with
  `$experiment: k`, `$variant: v`, `$boot: b`, `$snippet: h`. Otherwise send nothing.
- A non-empty `__mirafive_experiments` makes the tracker load its flags and
  experiments chunks even when flags were not otherwise requested (API.md).

### 6.4 `orig`

Keys in a document's `orig` are page experiments that now show everyone the original
(decided for it, or ended early). The SDK answers `a` for them, sets
`data-mirafive-{k}="a"` on `<html>`, and sends no exposure.

## 7. Conformance fixtures

In `fixtures/`, generated by the server's reference engine and copied here
byte-identical (sha256 pinned in tests). Never edit them by hand.

| File | An SDK must |
|---|---|
| `flag-hash.cases.json` | reproduce every `fnv1a32` and `bucket` value |
| `flag-eval.cases.json` | return every `expect` from `evaluate(flag, facts)`, keys omitted when absent; its `junk` list is §4.3's |
| `page-snippet.cases.json` | (browser SDKs, trackers) agree with the snippet: its variant for an entry equals `bucket` over the entry's weights |
| `reserved-names.json` | reserve exactly these event names (PROTOCOL §6) |

The evaluator must also pass the property tests: a chi-square over 10 equal buckets
for 100,000 UUIDv7s, `"1".."100000"` and `"user_1".."user_100000"` below 21.666 for
both salts; two seeds independent on a 10×10 table below 126.083; and share
monotonicity. Test ids come from a seeded PRNG, never from `crypto`.
