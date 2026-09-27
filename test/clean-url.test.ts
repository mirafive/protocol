import { expect, it } from "vitest"

import { cleanUrl } from "../src/clean-url.ts"

it.each([
  ["https://shop.example/pricing", false, "https://shop.example/pricing"],
  [
    "https://shop.example/p?utm_source=news&email=a%40b.de&gclid=x1&token=s3cret#section",
    false,
    "https://shop.example/p?utm_source=news&gclid=x1"
  ],
  ["https://shop.example/p?session=1&page=2", false, "https://shop.example/p"],
  [
    "https://shop.example/p?ref=hn&source=x&gbraid=a&wbraid=b&fbclid=c&msclkid=d&ttclid=e&li_fat_id=f&utm_x=%20y",
    false,
    "https://shop.example/p?ref=hn&source=x&gbraid=a&wbraid=b&fbclid=c&msclkid=d&ttclid=e&li_fat_id=f&utm_x=%20y"
  ],
  ["https://shop.example/p?UTM_SOURCE=x", false, "https://shop.example/p"],
  ["https://shop.example/#/cart", true, "https://shop.example/#/cart"],
  [
    "https://shop.example/?q=1#/reset?token=abc&utm_medium=mail",
    true,
    "https://shop.example/#/reset?utm_medium=mail"
  ],
  ["https://shop.example/#/reset?token=abc", true, "https://shop.example/#/reset"],
  ["/relative?email=a#x", false, "/relative"]
])("cleanUrl(%s, %s)", (href, hash, expected) => {
  expect(cleanUrl(href, hash)).toBe(expected)
})
