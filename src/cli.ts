/**
 * `mirafive-validate`: checks batches the way the MIRA FIVE ingest does. Reads JSON from a file
 * or standard input: one batch, or a list of batches. Exits 1 and lists every problem when one is
 * invalid. For SDKs in other languages and for CI.
 *
 *   php emit.php | npx --yes @mirafive/protocol
 *   npx --yes @mirafive/protocol batches.json
 */
import { readFileSync } from "node:fs";

import { validateBatch } from "./validate";

const file = process.argv[2];
const text = readFileSync(file && file !== "-" ? file : 0, "utf8");

let input: unknown;
try {
  input = JSON.parse(text);
} catch (error) {
  console.error(`✗ not JSON: ${String(error)}`);
  process.exit(1);
}

const batches = Array.isArray(input) ? input : [input];
let failed = 0;
let events = 0;
batches.forEach((batch, index) => {
  const issues = validateBatch(batch);
  const list: unknown =
    typeof batch === "object" && batch !== null ? Reflect.get(batch, "events") : undefined;
  if (Array.isArray(list)) events += list.length;
  for (const issue of issues) {
    failed += 1;
    console.error(`✗ batch ${index}: ${issue.path || "(batch)"}: ${issue.message}`);
  }
});

if (failed) process.exit(1);
console.log(`✓ ${batches.length} batch(es), ${events} event(s): valid`);
