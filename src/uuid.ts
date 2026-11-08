/**
 * UUIDv7 (RFC 9562): 48 bits of Unix milliseconds, then randomness. Ids sort by creation time,
 * which keeps ClickHouse inserts local and makes a retried batch easy to recognise.
 *
 * Monotonic within one page or process: when two ids fall into the same millisecond, the 12-bit `rand_a`
 * field is used as a counter (RFC 9562, section 6.2, method 1), so ids made in a loop still sort
 * in the order they were made. If the counter overflows, the timestamp is moved forward by 1 ms.
 */
let lastMs = 0;
let counter = 0;

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export function uuidv7(now: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  if (now > lastMs) {
    lastMs = now;
    // Start each millisecond at a random point in the lower half, so there is room to count up.
    counter = ((bytes[6]! & 0x07) << 8) | bytes[7]!;
  } else {
    counter += 1;
    if (counter > 0xfff) {
      lastMs += 1;
      counter = 0;
    }
  }

  // 48-bit timestamp, big-endian. Division instead of bit shifts: shifts are 32-bit in JavaScript.
  let ms = lastMs;
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  bytes[6] = 0x70 | (counter >> 8);
  bytes[7] = counter & 0xff;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const value = hex(bytes);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
