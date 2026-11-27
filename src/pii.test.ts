import { describe, expect, test } from "bun:test";

import { piiKinds, redactPii } from "./pii";

const blanked = (text: string) => redactPii(text).text;
const stars = (_: string, match: string) => "*".repeat(match.length);
/** The fastest of three runs, in milliseconds: the least disturbed by the collector. */
const time = (input: string) => {
  let best = Infinity;
  for (let run = 0; run < 3; run += 1) {
    const started = performance.now();
    redactPii(input);
    best = Math.min(best, performance.now() - started);
  }
  return best;
};

describe("card numbers", () => {
  test("test numbers of every network are blanked, plain, spaced or dashed", () => {
    for (const card of [
      "4111111111111111",
      "4111 1111 1111 1111",
      "4111-1111-1111-1111",
      "4000 0000 0000 0000 006",
      "5555 5555 5555 4444",
      "2223 0031 2200 3222",
      "3782 822463 10005",
      "378282246310005",
      "3056 930902 5904",
      "6011 1111 1111 1117",
      "3530 1113 3330 0000",
      "6200 0000 0000 0005",
      "6759 6498 2643 8453",
    ]) {
      expect(redactPii(card)).toEqual({
        text: "[redacted:card]",
        counts: { email: 0, iban: 0, phone: 0, card: 1 },
      });
    }
  });

  test("in a sentence, with the expiry date after it", () => {
    expect(blanked("Karte 4111 1111 1111 1111, gültig bis 12/27")).toBe(
      "Karte [redacted:card], gültig bis 12/27",
    );
    expect(blanked("card: 4111 1111 1111 1111 12/27")).toBe("card: [redacted:card] 12/27");
    expect(blanked("paid with 5555555555554444.")).toBe("paid with [redacted:card].");
  });

  test("an order number is kept, even with 16 digits", () => {
    for (const order of [
      // A card network's prefix and length, but not the Luhn check.
      "order 4000004500000000",
      "Bestellung 5123 4567 8901 2345",
      // The Luhn check, but no card network's prefix.
      "order 1000004500000005",
      "#1001",
      "ORD-2026-000123",
      "gid://shopify/Order/5678901234567",
      "invoice INV-2026-4711",
      "A-1000-2000-3000-4000",
    ]) {
      expect(redactPii(order).counts.card).toBe(0);
      expect(blanked(order)).toBe(order);
    }
  });

  test("a tracking number is kept", () => {
    for (const tracking of [
      "1Z999AA10123456784",
      "449044304137821",
      "9400111899223197428490",
      "9400 1118 9922 3197 4284 90",
      "JJD000390007012345678",
      "01234567890123",
    ]) {
      expect(redactPii(tracking).counts.card).toBe(0);
    }
  });

  test("a timestamp is kept", () => {
    for (const time of [
      // Milliseconds, microseconds and nanoseconds; the first passes the Luhn check.
      "1764240000000",
      "1764240000000000",
      "1764240000000000000",
      "2026-11-27T12:34:56.789Z",
      "20261127123456789",
      "2026 1127 1234 5678",
    ]) {
      expect(redactPii(time).counts.card).toBe(0);
      expect(blanked(time)).toBe(time);
    }
  });

  test("a UUID is kept, even when it is all digits", () => {
    for (const id of [
      "41111111-1111-4111-8111-111111111111",
      "0190f5a2-4111-7111-8111-111111111111",
      "E621E1F8-4111-1111-1111-AB12CDEF1234",
    ]) {
      expect(blanked(id)).toBe(id);
    }
  });

  test("other numbers are kept", () => {
    for (const value of [
      // EAN-13 barcode that happens to pass the Luhn check too.
      "gtin 4006381333924",
      "0.4111111111111111",
      "4111111111111111.50",
      "1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16",
      "4 111 111 111 111 111",
      "23851234567890123",
      "7301234567890123456",
      "41111111111111111111",
      "x4111111111111111",
      "4111111111111111x",
    ]) {
      expect(redactPii(value).counts.card).toBe(0);
    }
  });
});

describe("redactPii", () => {
  test("counts every match per kind", () => {
    const { text, counts } = redactPii(
      "jana@example.com, max@example.org, DE89 3704 0044 0532 0130 00, +49 30 12345678, 4111 1111 1111 1111",
    );
    expect(text).toBe(
      "[redacted:email], [redacted:email], [redacted:iban], [redacted:phone], [redacted:card]",
    );
    expect(counts).toEqual({ email: 2, iban: 1, phone: 1, card: 1 });
  });

  test("a card's groups of zeros are a card, not a phone number", () => {
    expect(redactPii("5500 0000 0000 0004").counts).toEqual({
      email: 0,
      iban: 0,
      phone: 0,
      card: 1,
    });
  });

  test("blanks with what the caller gives", () => {
    expect(redactPii("mail jana@example.com", stars).text).toBe("mail ****************");
  });

  test("text without personal data is the same string", () => {
    const text = "Paket komplett, € 249,00, v1.2.3";
    expect(redactPii(text)).toEqual({ text, counts: { email: 0, iban: 0, phone: 0, card: 0 } });
  });

  test("the kinds, in the order they are reported", () => {
    expect([...piiKinds]).toEqual(["email", "iban", "phone", "card"]);
  });
});

describe("hostile input", () => {
  // Strings that make a backtracking pattern retry along one long run. Each must take time linear
  // in its length.
  const hostile: [name: string, text: (n: number) => string][] = [
    ["a run with no @", (n) => "a".repeat(n)],
    ["@ after @", (n) => "a@".repeat(n / 2)],
    ["labels with no end", (n) => "a@b.".repeat(n / 4)],
    ["one long international number", (n) => `+49${"1".repeat(n)}a`],
    ["groups of an international number", (n) => `+49 ${"12 ".repeat(n / 3)}1a`],
    ["one long national number", (n) => `030 ${"1".repeat(n)}x`],
    ["many starts", (n) => `${"001 ".repeat(n / 8)}${"0".repeat(n / 2)}x`],
    ["groups of four", (n) => "4111 ".repeat(n / 5)],
    ["cards in a row", (n) => "4111 1111 1111 1111 ".repeat(n / 20)],
    ["capitals and digits", (n) => "AB12CDEF".repeat(n / 8)],
    ["ids", (n) => "01a1c5c5-0265-7282-b7ba-5061593b6ceb ".repeat(n / 37)],
    ["a page", (n) => "jana@example.com +49 30 1234567 4111 1111 1111 1111 ".repeat(n / 52)],
  ];

  test.each(hostile)("%s", (_, text) => {
    const once = time(text(25_000));
    const fourfold = time(text(100_000));
    expect(once).toBeLessThan(250);
    // Linear time takes about four times as long for four times the text, quadratic sixteen
    // times, and an exponential search never returns. The floor absorbs timer noise.
    expect(fourfold).toBeLessThan(Math.max(once, 10) * 8);
  });
});
