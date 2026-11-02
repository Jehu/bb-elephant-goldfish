import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewStatusLabel } from "../lib/review-status.ts";

test("review status names the actual stale cause, including legacy checkout assignment", () => {
  for (const [reason, expected] of [
    ["Checkout assigned after migration; start a fresh review.", "Review outdated: checkout assigned"],
    ["superseded by a new review", "Superseded by a new review"],
    ["the document changed during the review; the remaining stages did not run", "Stopped: document changed"],
    ["the document changed during the review", "Stopped: document changed"],
    ["the document changed before the next round; start a fresh review", "Stopped: document changed"],
    ["document changed by an ad hoc proposal; a fresh review is scheduled", "Document changed: new review scheduled"],
    [null, "Review outdated"],
    ["", "Review outdated"],
    ["unrecognized cause mentioning document changed", "Review outdated"],
  ] as const) assert.equal(reviewStatusLabel("stale", reason), expected, String(reason));
});

test("ordinary review states and specific limit causes retain their labels", () => {
  assert.equal(reviewStatusLabel("completed"), "Completed");
  assert.equal(reviewStatusLabel("running"), "Running");
  assert.equal(reviewStatusLabel("awaiting_decisions"), "Waiting for your decisions");
  assert.equal(reviewStatusLabel("failed"), "Failed");
  assert.equal(reviewStatusLabel("cancelled"), "Cancelled");
  assert.equal(reviewStatusLabel("unknown"), "Unknown");
  assert.equal(reviewStatusLabel("limit_reached", "round limit (3) reached"), "Round limit reached");
  assert.equal(reviewStatusLabel("limit_reached", "output limit"), "Output limit reached");
  assert.equal(reviewStatusLabel("limit_reached", "HTTP 429"), "Reviewer rate limit reached");
  assert.equal(reviewStatusLabel("limit_reached", "no answer within 120 s"), "Reviewer timed out");
  assert.equal(reviewStatusLabel("limit_reached"), "Review stopped at a limit");
});
