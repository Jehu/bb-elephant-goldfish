import assert from "node:assert/strict";
import { test } from "node:test";
import { egmLink, parseTargetPath, targetPath, targetSchema } from "../lib/egm-links.ts";

test("document, finding and proposal URLs resolve to the same panel target", () => {
  for (const [target, expectedPath] of [
    [{ projectId: "proj_a", specId: "spec-1" }, "proj_a/spec-1"],
    [{ projectId: "proj_a", specId: "spec-1", findingId: "finding-2" }, "proj_a/spec-1/finding/finding-2"],
    [{ projectId: "proj_a", specId: "spec-1", proposalId: "proposal-3" }, "proj_a/spec-1/proposal/proposal-3"],
  ] as const) {
    const link = egmLink("elephant-goldfish", target);
    assert.equal(targetPath(target), expectedPath);
    assert.equal(link.url, `/plugins/elephant-goldfish/specs/${expectedPath}`);
    assert.deepEqual(parseTargetPath(link.url.slice("/plugins/elephant-goldfish/specs/".length)), target);
    const attributes = Object.fromEntries([...link.directive.matchAll(/(\w+)="([^"]+)"/g)].map((match) => [match[1], match[2]]));
    assert.deepEqual(targetSchema.parse(attributes), target);
  }
});

test("malformed or ambiguous link targets cannot select an item", () => {
  for (const path of ["", "proj", "proj/spec/", "proj/spec/finding", "proj/spec/other/id", "proj/spec/proposal/id/extra", "../spec", "proj/%22onclick"]) {
    assert.equal(parseTargetPath(path), null, path);
  }
  for (const target of [null, {}, { projectId: "p", specId: "s", findingId: "f", proposalId: "r" }, { projectId: "p", specId: 's" onclick="bad' }]) {
    assert.equal(targetSchema.safeParse(target).success, false);
  }
});
