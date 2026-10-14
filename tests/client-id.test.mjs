import assert from "node:assert/strict";
import { test } from "node:test";
import { webcrypto } from "node:crypto";
import { createClientId } from "../lib/client-id.ts";

test("uses native randomUUID when available", () => {
  const expected = "2befaaab-b26e-441e-88de-d1f6af366f3a";
  assert.equal(
    createClientId({
      randomUUID: () => expected,
      getRandomValues: () => {
        throw new Error("Unexpected fallback");
      },
    }),
    expected,
  );
});
test("HTTP LAN fallback generates unique valid UUID v4 IDs without randomUUID", () => {
  const source = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) };
  const ids = Array.from({ length: 1000 }, () => createClientId(source));
  assert.equal(new Set(ids).size, 1000);
  for (const id of ids)
    assert.match(
      id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
});
