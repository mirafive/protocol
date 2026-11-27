import { describe, expect, test } from "bun:test";

import {
  isGzip,
  isTabId,
  matchesAnyPage,
  matchesPage,
  readReplayAnswer,
  replayChunkUrl,
  replayWithdrawUrl,
  type ReplayAnswer,
} from "./replay";

const SESSION = "019ac6a4-1c2b-7d3e-8f40-123456789abc";
const answer: ReplayAnswer = {
  session_id: SESSION,
  masking: "standard",
  never_record: ["/account/*"],
  sensitive: ["/checkout*"],
};

describe("matchesPage", () => {
  test.each([
    ["/account/*", "/account/", true],
    ["/account/*", "/account/orders/7", true],
    ["/account/*", "/account", false],
    ["/checkout*", "/checkout", true],
    ["/checkout*", "/checkout/", true],
    ["/checkout*", "/checkout/payment", true],
    ["/checkout", "/checkout/", false],
    ["/Checkout", "/checkout", false],
    ["/a/*/edit", "/a/1/edit", true],
    ["/a/*/edit", "/a/edit", false],
    ["/a*a", "/a", false],
    ["/a*a", "/aa", true],
    ["*", "/anything", true],
    ["/x/%C3%A4*", "/x/%C3%A4/y", true],
  ] as const)("%s against %s is %s", (pattern, path, expected) => {
    expect(matchesPage(pattern, path)).toBe(expected);
  });

  test("any of several", () => {
    expect(matchesAnyPage(["/a", "/b/*"], "/b/c")).toBe(true);
    expect(matchesAnyPage([], "/b/c")).toBe(false);
  });
});

describe("readReplayAnswer", () => {
  test("reads the field of a batch answer and drops unknown keys", () => {
    expect(
      readReplayAnswer({ accepted: 1, duplicates: 0, rejected: [], replay: { ...answer, x: 1 } }),
    ).toEqual(answer);
  });

  test("is undefined when the field is missing or malformed", () => {
    for (const body of [
      undefined,
      null,
      "x",
      { accepted: 1 },
      { replay: null },
      { replay: { ...answer, session_id: "not-a-uuid" } },
      { replay: { ...answer, masking: "loose" } },
      { replay: { ...answer, never_record: "/a" } },
      { replay: { ...answer, sensitive: [1] } },
      { replay: { ...answer, sensitive: undefined } },
    ]) {
      expect(readReplayAnswer(body)).toBeUndefined();
    }
  });
});

describe("URLs", () => {
  test("a chunk's URL repeats page and leaves out missing ids", () => {
    const url = new URL(
      replayChunkUrl("https://events.example", {
        key: "mira_pk_1",
        session: SESSION,
        tab: "Xk2_9-pQr7Ta",
        seq: 3,
        start: 1,
        end: 2,
        sent: 3,
        page: ["/", "/cart"],
        consent_analytics: "granted",
        consent_marketing: "denied",
        anonymous_id: "a 1",
      }),
    );
    expect(url.pathname).toBe("/v1/replay");
    expect(url.searchParams.getAll("page")).toEqual(["/", "/cart"]);
    expect(url.searchParams.get("anonymous_id")).toBe("a 1");
    expect(url.searchParams.has("user_id")).toBe(false);
    expect(url.searchParams.get("seq")).toBe("3");
    expect(url.searchParams.get("tab")).toBe("Xk2_9-pQr7Ta");
  });

  test("a withdrawal's URL", () => {
    expect(replayWithdrawUrl("https://e.example", { key: "k", session: SESSION })).toBe(
      `https://e.example/v1/replay/withdraw?key=k&session=${SESSION}`,
    );
  });
});

test("a tab id is 8 to 32 characters of base64url", () => {
  for (const good of ["abcdefgh", "A-_09zZy", "x".repeat(32)]) expect(isTabId(good)).toBe(true);
  for (const bad of [
    "",
    "abcdefg",
    "x".repeat(33),
    "abcd/efg",
    "abcd.efg",
    "abcdefg\n",
    "abcd=efg",
  ]) {
    expect(isTabId(bad)).toBe(false);
  }
});

test("isGzip knows a gzip member by its header", () => {
  expect(isGzip(Bun.gzipSync(new TextEncoder().encode("[]")))).toBe(true);
  expect(isGzip(new TextEncoder().encode("[]".repeat(20)))).toBe(false);
});
