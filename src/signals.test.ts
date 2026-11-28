import { expect, test } from "bun:test";

import { readSignalsAnswer, SIGNAL_RULES, type SignalsAnswer } from "./signals";

const valid: SignalsAnswer = {
  consent: "none",
  masking: "standard",
  sensitive: ["/checkout*"],
  rules: {
    rage: { ...SIGNAL_RULES.rage },
    dead: { ...SIGNAL_RULES.dead },
    slow: { ...SIGNAL_RULES.slow },
  },
};

test("reads the field the ingest sends, without unknown keys", () => {
  expect(readSignalsAnswer({ accepted: 1, signals: { ...valid, extra: 1 } })).toEqual(valid);
});

test("a missing or malformed field reads as none", () => {
  expect(readSignalsAnswer({ accepted: 1 })).toBeUndefined();
  expect(readSignalsAnswer(null)).toBeUndefined();
  expect(readSignalsAnswer({ signals: { ...valid, consent: "maybe" } })).toBeUndefined();
  expect(readSignalsAnswer({ signals: { ...valid, rules: undefined } })).toBeUndefined();
  expect(
    readSignalsAnswer({
      signals: { ...valid, rules: { ...valid.rules, rage: { ...valid.rules.rage, clicks: 2 } } },
    }),
  ).toBeUndefined();
  expect(
    readSignalsAnswer({
      signals: {
        ...valid,
        rules: { ...valid.rules, slow: { ...valid.rules.slow, cls: Infinity } },
      },
    }),
  ).toBeUndefined();
});
