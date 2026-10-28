import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewLimitLabel } from "../lib/review-limit.ts";

test("review badges distinguish persisted limit reasons without guessing unknown causes", () => {
  for (const [reason, expected] of [
    ["round limit (3) reached: the changed document was not re-reviewed", "Round limit reached"],
    ["comprehension stage stopped at the model's output limit", "Output limit reached"],
    ["zoom_out stage: the reviewer endpoint rate-limited the request (HTTP 429)", "Reviewer rate limit reached"],
    ["zoom_out stage: no answer within 120 s", "Reviewer timed out"],
    [null, "Review stopped at a limit"],
    ["unrecognized reason", "Review stopped at a limit"],
  ] as const) assert.equal(reviewLimitLabel(reason), expected);
});
