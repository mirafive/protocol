# MIRA FIVE SDK family — public API contract (0.5.0)

Every package implements exactly this surface. Changing it means changing this file
first. Wire details are in [PROTOCOL.md](PROTOCOL.md), flag semantics in
[FLAGS.md](FLAGS.md).

## Shared rules

- Default host `https://events.mirafive.io`. A host without a scheme is an error.
- SDK identity in `context.sdk`: `mirafive-browser`, `mirafive-tracker`,
  `mirafive-server`, `mirafive-php`. Framework packages report the SDK they run on,
  unchanged, and never invent their own transport.
- Env var names: `MIRAFIVE_SECRET_KEY`, `MIRAFIVE_WEBSITE_KEY`, `MIRAFIVE_HOST`; public
  prefixes per framework (`NEXT_PUBLIC_MIRAFIVE_KEY`, `VITE_MIRAFIVE_KEY`,
  `PUBLIC_MIRAFIVE_KEY`, `NUXT_PUBLIC_MIRAFIVE_KEY`).
- A secret key (`MIRAFIVE_SECRET_KEY`) handed to a browser SDK must fail loudly and
  send nothing. Browser SDKs cannot tell key kinds apart by shape; they refuse a key
  passed as `secretKey` and servers refuse secret keys in paths (PROTOCOL §1).
- Typed events are **types only** (no runtime schema code in bundles):
  `createMira<Events>()` / `new Mira<Events>()` where
  `Events extends Record<string, Record<string, unknown> | undefined>` narrows
  `track(name, properties)`.
- Server-side flag reads honour the visitor's opt-out: framework integrations read
  `Sec-GPC: 1` / `DNT: 1` from the incoming request and pass `optedOut`.
- The tracker's mode (`script_mode`, default `consentless`) is configured separately
  from server events (`mode`, default `full`): a consentless site needs no banner.
- Nothing throws for transport reasons. Browser: warn once in development
  (`location.hostname` is local) and drop. Server: `onError(error)` callback, and
  `send()` rejects with `MiraError`.
- `MiraError { code, status?, retryable, retryAfterMs?, errors? }` with codes from
  PROTOCOL §5 plus `network_error`, `timeout`, `aborted`, `invalid_event`, and
  `unexpected` for a non-2xx answer without a code (e.g. a bare 502 from a proxy).
  In PHP the string code is `$error->errorCode` and `getCode()` is the HTTP status.

## `@mirafive/sdk-browser`

Every feature is its own subpath (`sideEffects: false`). What is not imported is not
shipped.

```ts
import { createMira } from "@mirafive/sdk-browser"
import { pageviews } from "@mirafive/sdk-browser/pageviews"
import { identity } from "@mirafive/sdk-browser/identity"      // required for mode "full"
import { autocapture } from "@mirafive/sdk-browser/autocapture"
import { siteSearch } from "@mirafive/sdk-browser/search"
import { flags } from "@mirafive/sdk-browser/flags"
import { experiments } from "@mirafive/sdk-browser/experiments" // needs flags + identity

const mira = createMira({
  key: "mf_…",                      // website key
  host?: string,
  mode?: "consentless" | "full",    // default "consentless"
  plugins?: Plugin[],
  flushAt?: number,                  // default 20, 1–1000
  flushAfterMs?: number,             // default 5000
  trackLocalhost?: boolean,
})
```

| Member | Plugin | Behaviour |
|---|---|---|
| `track(name, properties?)` | core | queue an event |
| `pageview(page?: { url?, title?, referrer? })` | core | queue `$pageview` for the current or given page |
| `flush(): Promise<void>` | core | send now |
| `use(plugin): void` | core | add a plugin after creation (the tracker loads chunks this way) |
| `destroy(): void` | core | stop timers and listeners, undo patches |
| `consent(answer: boolean \| { statistics?, experiments?, targeting? })` | identity | `true` = statistics only; scopes by name; `false` forgets everything local and clears the queue |
| `identify(userId, traits?)` | identity | `$identify`, then `userId` on later events; a different user resets ids first |
| `reset()` | identity | forget ids, user and session |
| `anonymousId(): string \| undefined` | identity | |
| `search(query)` | search | queue `$search` |
| `flag(key, fallback): string \| boolean` | flags | variant or on/off |
| `config<T>(key, fallback: T): T` | flags | remote-config value |
| `onFlags(listener): () => void` | flags | called when flags (re)load |
| `setFlagProperties(properties)` | flags | facts for targeting rules |

Calling a member whose plugin is missing warns once in development and does nothing.
`mode: "full"` without `identity()` throws at creation.

Plugin options:

- `pageviews({ hash?: boolean, initial?: boolean /* default true */ })` — the one
  pageview mechanism for every SPA router (Navigation API, else `pushState`/
  `replaceState`/`popstate`; `hashchange` in hash mode). Title read one macrotask after
  navigation. Same path+query twice is sent once. In-app referrer after the first view.
- `identity()` — PROTOCOL §7 storage; nothing stored before consent; the landing
  pageview is resent when consent is first granted; honours `__mirafive_consent`.
- `autocapture({ selectorAttributes?: string[] })` — `$autocapture` for click/submit/
  change; skips `password`/`email`/`hidden` inputs and anything under
  `[data-mira-no-capture]`.
- `siteSearch({ parameters?: string[] /* q, s, search, query */ })` — reads the search
  parameter before URL cleaning, settles 1 s, full mode only.
- `flags({ bootstrap?: FlagBootstrap, overrides?: Record<string, string | boolean>, refreshSeconds?: number })`
  — reads `<script type="application/json" id="mirafive-flags">` when present.
- `experiments()` — sends `$exposure` for page experiments decided by the snippet.

`Plugin` is exported as a type: `{ name: string; setup(core: MiraCore): void | (() => void) }`.
`MiraCore` is the documented internal surface plugins use (enqueue, hooks for
`beforeSend`/`pageview`/`consent`, config, state). Framework packages may use it.

## `@mirafive/tracker` (hosted script)

```html
<script>window.mirafive=window.mirafive||function(){(mirafive.q=mirafive.q||[]).push(arguments)}</script>
<script defer src="https://cdn.mirafive.io/mira.js" data-key="mf_…"></script>
```

Attributes: `data-key` (required), `data-host`, `data-mode="full"`, `data-hash`,
`data-manual` (no automatic pageviews), `data-autocapture`, `data-site-search`
(bare or a comma list of parameters), `data-flags`, `data-track-localhost`.

Until a chunk arrives: `track`, `pageview` and `flush` issued after a consent grant wait
for identity and replay in order; `flag`/`config` return the fallback and are not replayed
(a replayed read would count an exposure the page never showed) — read flags inside the
`flags` listener; `search` without `data-site-search` does nothing. The flags chunk needs
`Object.hasOwn` (Safari 15.4+).

Verbs on `mirafive(verb, ...args)`: `track`, `pageview`, `flush`, `consent`,
`identify`, `reset`, `anonymousId` (callback as last argument), `search`, `flag`,
`config`, `flags` (listener), `flagProperties`. Unknown verbs warn in development.

The loader contains the core, pageviews and the command queue. It loads feature
chunks from its own origin, content-hashed and with SRI, only when needed:

| Chunk | Loaded when |
|---|---|
| identity | `data-mode="full"`, on the first consent grant (or a pre-set granting `__mirafive_consent`); a decline loads it only when ids from an earlier visit must be forgotten |
| autocapture | `data-autocapture` |
| search | `data-site-search` in full mode, after consent |
| flags | `data-flags`, the first flag verb, a flag bootstrap block, or a snippet decision |
| experiments | full mode, and `window.__mirafive_experiments` is non-empty |

Build output: `dist/mira.js`, `dist/mira.<hash>.js` (pinned copy),
`dist/chunks/<feature>.<hash>.js`, `dist/manifest.json` (`{ file, integrity }` of the
loader and every chunk). Also on npm for self-hosting.

## `@mirafive/sdk-server`

WinterTC APIs only (`fetch`, `crypto.subtle`, `crypto.randomUUID`, `AbortController`,
timers). ESM only. Node ≥ 20, Bun, Deno, workerd, Vercel/Netlify edge.

```ts
import { Mira, MiraError } from "@mirafive/sdk-server"

const mira = new Mira({
  key: process.env.MIRAFIVE_SECRET_KEY,
  host?, mode?: "full" | "consentless",   // default "full"
  flushAt?: number,          // default 100
  flushAfterMs?: number,     // default 1000
  timeoutMs?: number,        // default 10000
  maxRetries?: number,       // default 3
  fetch?: typeof fetch,
  waitUntil?: (p: Promise<unknown>) => void,
  onError?: (error: MiraError) => void,
})

mira.track(name, { userId?, anonymousId?, sessionId?, properties?, time?, page? })  // buffered
mira.identify(userId, traits?, { anonymousId? })                                     // buffered
await mira.send(events, { idempotencyKey?, signal? })  // unbuffered, resolves to the receipt
await mira.flush()
await mira.shutdown()   // flush and stop timers
```

In `consentless` mode identifiers throw a `TypeError` (programming error, not
transport). Retries resend the identical body. `idempotencyKey` derives the batch id
per PROTOCOL §5.

### `@mirafive/sdk-server/flags`

```ts
import { MiraFlags } from "@mirafive/sdk-server/flags"

const flags = new MiraFlags({
  key: process.env.MIRAFIVE_SECRET_KEY,
  host?, refreshSeconds?: number /* 30, min 10 */, timeoutMs?,
  document?: FlagDocument,   // a snapshot to start from
  mira?: Mira,               // counts server-side exposures
  fetch?, waitUntil?, onError?,
})

const user = await flags.for({ userId?, anonymousId?, properties?, consent?: { experiments?, targeting? }, optedOut? },
                            { waitUntil? })   // per-call waitUntil: keep one MiraFlags per isolate on Workers
user.enabled("new-checkout")         // boolean
user.variant("pricing-test")         // string
user.config("limits", { max: 3 })    // typed remote config
user.evaluate("pricing-test")        // { variant, reason, rule?, errorCode? } — NOT_ALLOWED / MEMBERSHIP_UNAVAILABLE serve the default
                                     // variant with an errorCode (FLAGS §5.1); { reason: "ERROR", errorCode: "UNSUPPORTED" | "NOT_READY" | "FLAG_NOT_FOUND" } has none
user.bootstrap()                     // HTML <script type="application/json" id="mirafive-flags">…</script>, escaped
await flags.ready(); flags.snapshot(); flags.status()
```

Responses carrying `bootstrap()` should send `Cache-Control: private, no-store`
(`bootstrapHeaders` export).

## Framework packages

All are thin: no transport, no evaluator of their own. Peers:
`@mirafive/sdk-browser` (client) and `@mirafive/sdk-server` (server).

### `@mirafive/sdk-react`

`<MiraProvider client={mira}>` (client from `createMira`), `useMira()`,
`useFlag(key, fallback)`, `useFlagConfig(key, fallback)`,
`useTrackOnMount(name, properties?)`. Flag hooks use `useSyncExternalStore` and return
the bootstrap value during SSR and hydration, so both renders match.

### `@mirafive/sdk-next`

- `@mirafive/sdk-next` (client, `"use client"`): `MiraProvider`
  (`key`/`mode`/`plugins` props, creates the client once), re-exports the sdk-react
  hooks.
- `@mirafive/sdk-next/server`: `mira()` (a process-wide `Mira` from env, flushed via
  `after()`), `flagsFor(unit)` (reads `Sec-GPC`/`DNT` via `next/headers`),
  `<MiraFlagsScript flags={…} />` (bootstrap block).

### `@mirafive/sdk-tanstack`

- `@mirafive/sdk-tanstack`: `MiraProvider`, re-exported sdk-react hooks.
- `@mirafive/sdk-tanstack/start`: `miraMiddleware()` (TanStack Start request
  middleware: puts `mira` and `flagsFor` on `context`, flushes after the response),
  `MiraFlagsScript`.

### `@mirafive/sdk-vue`

`app.use(createMiraPlugin(client))`, `useMira()`, `useFlag(key, fallback)` and
`useFlagConfig(key, fallback)` returning refs.

### `@mirafive/sdk-nuxt`

Module config key `mirafive`: `{ key, host, mode, features: ("autocapture" | "search" | "flags" | "experiments")[], secretKey }`.
Only the listed features are bundled (generated virtual module). Auto-imports
`useMira`, `useFlag`, `useFlagConfig`; server utils `useServerMira(event)`,
`miraFlagsFor(event, unit)`; bootstrap written to the head with no-store headers.

### `@mirafive/sdk-astro`

`integrations: [mirafive({ key, host, mode, features, dev, trackLocalhost })]` (named and
default export, so `astro add @mirafive/sdk-astro` works) bundles sdk-browser into the
site's own JS (no third-party script); key defaults to `PUBLIC_MIRAFIVE_KEY`. Off in
`astro dev` unless `dev: true`. `@mirafive/sdk-astro/client`: `mirafive(verb, ...args)`
(same verbs as the tracker, `anonymousId` with a callback too; also `window.mirafive`),
`astro()` plugin (holds pageviews across view transitions). `@mirafive/sdk-astro/server`:
`miraFlagsFor(context, unit, { waitUntil? })`, `MiraFlagsScript` component.

### `@mirafive/sdk-convex`

`new MiraConvex({ deliver, key?, host?, mode?, outbox?: boolean, enqueue?, disabled? })`
where `deliver` is the customer's exported internal action reference:
`track(ctx, name, options)`, `trackMany(ctx, events)`,
`identify(ctx, userId, traits?, { anonymousId? })` from mutations and actions;
`deliverAction()` (the internal action delivering one batch), `miraOutboxTable`
(table `miraOutbox`), and `flushOutbox()` returning `{ flushOutbox, outboxRows }`,
both exported next to `deliver` and drained by a cron. A mutation never sends; it
schedules (`runAfter(0)`) or writes to the outbox, so rolled-back events are never
sent. The delivery action throws on failure (Convex logs, workpool retries); `track`
calls never throw for transport reasons.

## PHP

### `mirafive/sdk-php` (namespace `MiraFive`)

PHP ≥ 8.3, `ext-json`, `ext-curl` or any PSR-18 client.

```php
use MiraFive\Mira;
use MiraFive\Mode;

$mira = new Mira(key: getenv('MIRAFIVE_SECRET_KEY'), host: null, mode: Mode::Full);

$mira->track('signup', userId: 'u_42', properties: ['plan' => 'pro']);
$mira->identify('u_42', ['plan' => 'pro']);
$receipt = $mira->send([...events], idempotencyKey: 'order-981');
$mira->flush();   // also runs on shutdown unless flushOnShutdown: false
// handOff: fn (string $body, string $batchId) => …  replaces delivery for buffered flushes;
// a worker then calls $mira->deliverPrepared($body). Also: enabled:, flushOnShutdown:, flagsRefreshSeconds:

$flags = $mira->flags();                       // MiraFive\Flags\MiraFlags, document cached (PSR-16 optional)
$user  = $flags->for(userId: 'u_42', properties: ['plan' => 'pro'],
                     consent: ['experiments' => true, 'targeting' => false], optedOut: false);
$user->enabled('new-checkout'); $user->variant('pricing-test'); $user->config('limits', []);
$user->bootstrap();                            // escaped <script> block
```

### `mirafive/sdk-laravel`

Auto-discovered provider; `config/mirafive.php` (`enabled`, `secret_key`, `website_key`,
`host`, `mode`, `script_mode`, `script_url`, `queue` as `queue` or `connection:queue`,
`flags.refresh_seconds`, `flags.cache_store`); `mirafive:check` artisan command;
`Mira::forUser($user)`, `Mira::optedOut($request)`; `MiraFive\Laravel\Facades\Mira`; flush on `terminating`; optional
queued delivery (`MIRAFIVE_QUEUE`); Blade `@mirafiveScript` (tracker tag with the
website key) and `@mirafiveFlags($unit)`; `Mira::fake()` for tests with
`assertTracked()`.

### `mirafive/sdk-symfony`

`MiraFive\Symfony\MiraFiveBundle`; config `mirafive: { secret_key, website_key, host, mode }`;
autowired `MiraFive\Mira` and `MiraFlags`; flush on `kernel.terminate`
(and `console.terminate`); Twig `mirafive_script()` and `mirafive_flags(unit)`; config also takes `script_mode`;
`mirafive:check` console command.
