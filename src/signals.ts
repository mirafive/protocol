import { maskingModes, type MaskingMode } from "./replay";

/**
 * Behavior signals: where visitors struggle, detected in the browser and sent as ordinary events
 * of every visit, recorded or not. The definitions' numbers come in a batch's `202` (`signals`),
 * so they can change without a new SDK; these are the defaults. The MIRA FIVE ingest checks its
 * own schema against these on every build. Browser-safe, no dependencies.
 */

/** The signal events. Reserved names: only MIRA FIVE's SDKs send them, as `track` events. */
export const signalEvents = [
  "$rage_click",
  "$dead_click",
  "$form_abandon",
  "$error",
  "$slow_page",
] as const;
export type SignalEvent = (typeof signalEvents)[number];

/**
 * The lowest consent tier at which signals are detected and sent: 0, no consent needed, as they
 * are about the page and read nothing from the device. When it is 1, the `202` says
 * `consent: "analytics"` and the browser waits for analytics consent.
 */
export const SIGNAL_TIER: 0 | 1 = 0;

/** The definitions' numbers (see the ingest's `signalsAnswer` for what each means). */
export const SIGNAL_RULES = {
  /**
   * Rage click: at least `clicks` clicks, each within `gapMs` of the one before and within
   * `radiusPx` of the first, of which the page answered at most one.
   */
  rage: { clicks: 4, gapMs: 600, radiusPx: 30 },
  /** Dead click: nothing happens for `waitMs` after a click on something that looks clickable. */
  dead: { waitMs: 1_000 },
  /** Slow page: LCP over `lcpMs`, INP over `inpMs` or CLS over `cls` (Google's "poor"). */
  slow: { lcpMs: 4_000, inpMs: 500, cls: 0.25 },
  /** Quick back, derived by the server: back to the page before within `withinMs`. */
  quickBack: { withinMs: 10_000 },
} as const;

/** Caps that keep a broken page from flooding the ingest. */
export const SIGNAL_LIMITS = {
  /** Signals of one kind per page view. */
  perKind: 10,
  /** Signals per page view. */
  perPage: 25,
  /** Signals per document (an SPA's pages share one). */
  perDocument: 50,
  /** Signals the ingest stores per session. */
  perSession: 200,
  /** Characters of an element's label, an error's message or a field's name. */
  textLength: 200,
  /** Characters of an element's selector. */
  selectorLength: 160,
} as const;

/** The rules as the ingest sends them, without quick back (the browser does not detect it). */
export interface SignalRules {
  rage: { clicks: number; gapMs: number; radiusPx: number };
  dead: { waitMs: number };
  slow: { lcpMs: number; inpMs: number; cls: number };
}

/**
 * The `signals` field of a batch's `202`: this project detects behavior signals. Present when the
 * project has them on and the batch's latest event has at least `SIGNAL_TIER`. On a page matching
 * `sensitive`, and on every page in `strict` masking, no label or message is sent.
 */
export interface SignalsAnswer {
  /** What the browser needs before it detects anything. */
  consent: "none" | "analytics";
  masking: MaskingMode;
  sensitive: string[];
  rules: SignalRules;
}

const isMasking = (value: unknown): value is MaskingMode =>
  maskingModes.some((mode) => mode === value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const inRange = (value: unknown, min: number, max: number, int = true): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max &&
  (!int || Number.isInteger(value));

function readRules(value: unknown): SignalRules | undefined {
  if (!isRecord(value)) return undefined;
  const { rage, dead, slow } = value;
  if (!isRecord(rage) || !isRecord(dead) || !isRecord(slow)) return undefined;
  if (
    !inRange(rage.clicks, 3, 20) ||
    !inRange(rage.gapMs, 100, 3_000) ||
    !inRange(rage.radiusPx, 5, 200) ||
    !inRange(dead.waitMs, 300, 5_000) ||
    !inRange(slow.lcpMs, 1_000, 60_000) ||
    !inRange(slow.inpMs, 100, 10_000) ||
    !inRange(slow.cls, 0.01, 10, false)
  ) {
    return undefined;
  }
  return {
    rage: { clicks: rage.clicks, gapMs: rage.gapMs, radiusPx: rage.radiusPx },
    dead: { waitMs: dead.waitMs },
    slow: { lcpMs: slow.lcpMs, inpMs: slow.inpMs, cls: slow.cls },
  };
}

/**
 * The `signals` field of a batch answer as the ingest's schema reads it, or `undefined` when it is
 * missing or malformed. Takes the whole answer body; unknown keys are dropped.
 */
export function readSignalsAnswer(body: unknown): SignalsAnswer | undefined {
  const signals = isRecord(body) ? body.signals : undefined;
  if (!isRecord(signals)) return undefined;
  const { consent, masking, sensitive } = signals;
  if (consent !== "none" && consent !== "analytics") return undefined;
  if (!isMasking(masking)) return undefined;
  if (!Array.isArray(sensitive) || !sensitive.every((item) => typeof item === "string")) {
    return undefined;
  }
  const rules = readRules(signals.rules);
  if (!rules) return undefined;
  return { consent, masking, sensitive: [...sensitive], rules };
}
