/**
 * The PII patterns: emails, IBANs, phone numbers and payment card numbers in free text. The MIRA
 * FIVE ingest blanks them in everything a public key sends, and the browser blanks them before a
 * session recording leaves the device, with this one function. No dependencies; browser-safe.
 *
 * Every search runs in time linear in the text's length, on any input: the browser runs it on
 * every text of a page. Emails and card numbers are found by hand-written scanners; the regular
 * expressions left have no nested quantifiers that can split one run of characters in many ways.
 */

/** The kinds of personal data the guard finds, in the order they are reported. */
export const piiKinds = ["email", "iban", "phone", "card"] as const;
export type PiiKind = (typeof piiKinds)[number];

/** Matches per kind, counted per match. */
export type PiiCounts = Record<PiiKind, number>;

/** What a match is replaced with. The default is `[redacted:<kind>]`. */
export type PiiBlank = (kind: PiiKind, match: string) => string;

/** `[start, end)` of a match in the text. */
type Span = [start: number, end: number];

/** The first match at or after `from`, or undefined. */
type Find = (text: string, from: number) => Span | undefined;

const isDigit = (code: number) => code >= 48 && code <= 57;
/** `\w` without the `u` flag: ASCII letters, digits and `_`. */
const isWord = (code: number) =>
  isDigit(code) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95;
const charAt = (text: string, index: number) =>
  index >= 0 && index < text.length ? text.charCodeAt(index) : -1;

/** Characters of an email's local part: `[\w.+-]`. */
const isLocal = (code: number) => isWord(code) || code === 46 || code === 43 || code === 45;
/** Characters of a domain label: `[\w-]`. */
const isLabel = (code: number) => isWord(code) || code === 45;

/**
 * `[\w.+-]+@[\w-]+(?:\.[\w-]+)+`, leftmost and longest like the regular expression, without its
 * quadratic retries along a long run that has no `@`. Each `@` is looked at once: the local part
 * is the run of local characters right before it (from `from` on), the domain the labels after it.
 */
const findEmail: Find = (text, from) => {
  let at = text.indexOf("@", from);
  while (at !== -1) {
    let start = at;
    while (start > from && isLocal(charAt(text, start - 1))) start -= 1;
    let end = at + 1;
    while (isLabel(charAt(text, end))) end += 1;
    let labels = 0;
    if (end > at + 1) {
      while (charAt(text, end) === 46 && isLabel(charAt(text, end + 1))) {
        end += 2;
        while (isLabel(charAt(text, end))) end += 1;
        labels += 1;
      }
    }
    if (start < at && labels > 0) return [start, end];
    at = text.indexOf("@", at + 1);
  }
  return undefined;
};

/**
 * The next match of a global regular expression from `from`. Called from arrow functions in
 * `passes` rather than returning one: a call at the top of the module would keep this file in every
 * bundle that imports the package, used or not.
 */
const findPattern = (pattern: RegExp, text: string, from: number): ReturnType<Find> => {
  pattern.lastIndex = from;
  const match = pattern.exec(text);
  return match ? [match.index, match.index + match[0].length] : undefined;
};

/**
 * IBANs: two letters, two check digits, 11–30 alphanumerics, optionally in groups of four. A
 * match is at most 44 characters long, so a failed attempt costs a bounded number of steps.
 */
const iban = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g;

/**
 * Phone numbers in international format (+49 …, 0049 …): country code, area code (optionally in
 * parentheses), then at least two groups of two or more digits. The groups are one run of digit
 * blocks joined by single separators, written so a run of digits can be read only one way; a run
 * of four or more digits counts as two groups. It is the same language as
 * `(?:[\s/.-]?\d{2,}){2,}`, which splits a long run of digits in exponentially many ways before it
 * gives up.
 */
const internationalPhone =
  /(?:\+|\b00)\d{1,3}[\s/.-]?\(?\d{1,5}\)?[\s/.-]?(?:\d{2,}(?:[\s/.-]\d{2,})+|\d{4,})\b/g;

/** Phone numbers in German national format (030 1234567, 0170-1234567). */
const nationalPhone = /\b0\d{2,5}[\s/-]\d{3,}(?:[\s-]\d{2,})*\b/g;

/**
 * Card networks by prefix, with the lengths they issue. A number is a card only when its prefix
 * and length belong to a network and it passes the Luhn check: that keeps timestamps (`17…`),
 * most order and tracking numbers and platform ids (`1…`, `7…`, `0…`) and EAN-13 barcodes (13
 * digits, so no network's length) out. Visa's old 13-digit numbers are no longer issued.
 */
const networks: readonly [from: number, to: number, digits: number, lengths: readonly number[]][] =
  [
    [2200, 2204, 4, [16, 17, 18, 19]], // Mir
    [2221, 2720, 4, [16]], // Mastercard
    [30, 30, 2, [14, 15, 16, 17, 18, 19]], // Diners Club
    [34, 34, 2, [15]], // American Express
    [3528, 3589, 4, [16, 17, 18, 19]], // JCB
    [36, 36, 2, [14, 15, 16, 17, 18, 19]], // Diners Club
    [37, 37, 2, [15]], // American Express
    [38, 39, 2, [16, 17, 18, 19]], // Diners Club
    [4, 4, 1, [16, 19]], // Visa
    [50, 50, 2, [16, 17, 18, 19]], // Maestro
    [51, 55, 2, [16]], // Mastercard
    [56, 69, 2, [16, 17, 18, 19]], // Maestro, Discover, UnionPay, RuPay
    [81, 82, 2, [16, 17, 18, 19]], // UnionPay, RuPay
    [9792, 9792, 4, [16]], // Troy
  ];

/** Whether `digits` has a card network's prefix and length. */
function issued(digits: string): boolean {
  return networks.some(
    ([from, to, length, lengths]) =>
      lengths.includes(digits.length) &&
      Number(digits.slice(0, length)) >= from &&
      Number(digits.slice(0, length)) <= to,
  );
}

/** The Luhn check digit test (ISO/IEC 7812). */
function luhn(digits: string): boolean {
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    let digit = digits.charCodeAt(digits.length - 1 - index) - 48;
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return digits.length > 0 && sum % 10 === 0;
}

const isCardSeparator = (code: number) => code === 32 || code === 45;

/** Whether a number may start at `start`: no word character or `+` before it, no decimal. */
function freeBefore(text: string, start: number): boolean {
  const before = charAt(text, start - 1);
  if (isWord(before) || before === 43) return false;
  return !((before === 46 || before === 44) && isDigit(charAt(text, start - 2)));
}

/** Whether a number may end at `end`: no word character after it, no decimal. */
function freeAfter(text: string, end: number): boolean {
  const after = charAt(text, end);
  if (isWord(after)) return false;
  return !((after === 46 || after === 44) && isDigit(charAt(text, end + 1)));
}

/** Whether `digits` is a card number: a network's prefix and length, and the Luhn check. */
const isCard = (digits: string) =>
  digits.length >= 13 && digits.length <= 19 && issued(digits) && luhn(digits);

/**
 * The card number that starts with the group `[start, headEnd)`, if any: the group alone, or the
 * longest stretch of groups from it. Looks at most 19 digits ahead.
 */
function cardAt(text: string, start: number, headEnd: number): Span | undefined {
  if (headEnd - start > 19) return undefined;
  let digits = text.slice(start, headEnd);
  if (isCard(digits) && freeAfter(text, headEnd)) return [start, headEnd];
  const separator = charAt(text, headEnd);
  if (digits.length !== 4 || !isCardSeparator(separator)) return undefined;
  let found: Span | undefined;
  let end = headEnd;
  while (charAt(text, end) === separator && isDigit(charAt(text, end + 1))) {
    const groupStart = end + 1;
    end = groupStart;
    while (isDigit(charAt(text, end)) && end - groupStart <= 6) end += 1;
    const size = end - groupStart;
    if (size < 3 || size > 6) break;
    digits += text.slice(groupStart, end);
    if (digits.length > 19) break;
    if (isCard(digits) && freeAfter(text, end)) found = [start, end];
  }
  return found;
}

/**
 * Payment card numbers: 13 to 19 digits with a network's prefix and length that pass the Luhn
 * check, written plain or in groups joined by one kind of separator, a space or a dash
 * (`4111 1111 1111 1111`, `3782-822463-10005`). A grouped number starts with a group of four, and
 * its other groups have three to six digits. In a longer row of groups (`4111 1111 1111 1111
 * 12/27`), the card is the first stretch of groups that is one, the longest from its start. Each
 * group is read once and looks a bounded distance ahead.
 */
const findCard: Find = (text, from) => {
  let index = from;
  while (index < text.length) {
    if (!isDigit(text.charCodeAt(index)) || isDigit(charAt(text, index - 1))) {
      index += 1;
      continue;
    }
    let end = index;
    while (isDigit(charAt(text, end))) end += 1;
    // A group after a separator continues a row; the first group of a row must not be glued to a
    // word or a number on its left.
    const before = charAt(text, index - 1);
    const continues = isCardSeparator(before) && isDigit(charAt(text, index - 2));
    if (continues || freeBefore(text, index)) {
      const card = cardAt(text, index, end);
      if (card) return card;
    }
    index = end;
  }
  return undefined;
};

/**
 * A UUID (any version, either case). Its digit groups can look like a phone number
 * (`…-0265-7282-…`), so a match that lies wholly inside an id is kept as it is. Everything else is
 * searched on the whole text, so PII that merely contains an id (`jana+<uuid>@example.com`) is
 * still found. A UUID is 36 characters, so a failed attempt costs a bounded number of steps.
 */
const uuid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/** The spans of the ids in `text`, in order. Found once per pass, so the search stays linear. */
function idSpans(text: string): Span[] {
  return Array.from(text.matchAll(uuid), (match) => [match.index, match.index + match[0].length]);
}

/** Whether `[start, end)` lies wholly inside one of `spans` (sorted, not overlapping). */
function insideId(spans: readonly Span[], start: number, end: number): boolean {
  let low = 0;
  let high = spans.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const [from, to] = spans[middle]!;
    if (end <= from) high = middle - 1;
    else if (start >= to) low = middle + 1;
    else return start >= from && end <= to;
  }
  return false;
}

/**
 * The passes, in order: each searches the text the passes before it left. Card numbers come before
 * phone numbers, whose national pattern would take a card's groups of zeros (`5500 0000 0000
 * 0004`).
 */
const passes: readonly [kind: PiiKind, find: Find][] = [
  ["email", findEmail],
  ["iban", (text, from) => findPattern(iban, text, from)],
  ["card", findCard],
  ["phone", (text, from) => findPattern(internationalPhone, text, from)],
  ["phone", (text, from) => findPattern(nationalPhone, text, from)],
];

const token: PiiBlank = (kind) => `[redacted:${kind}]`;

/**
 * Blanks the emails, IBANs, phone numbers and payment card numbers in `text`, and counts them per
 * kind. A match that lies wholly inside a UUID is kept. Pure and linear in the text's length.
 *
 * @param blank What a match becomes; by default `[redacted:<kind>]`.
 */
export function redactPii(
  text: string,
  blank: PiiBlank = token,
): { text: string; counts: PiiCounts } {
  const counts: PiiCounts = { email: 0, iban: 0, phone: 0, card: 0 };
  let result = text;
  for (const [kind, find] of passes) {
    const spans = idSpans(result);
    let output = "";
    let copied = 0;
    let from = 0;
    for (let match = find(result, from); match; match = find(result, from)) {
      const [start, end] = match;
      from = end;
      if (insideId(spans, start, end)) continue;
      output += result.slice(copied, start) + blank(kind, result.slice(start, end));
      copied = end;
      counts[kind] += 1;
    }
    if (copied > 0) result = output + result.slice(copied);
  }
  return { text: result, counts };
}
