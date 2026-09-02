import test from "node:test";
import assert from "node:assert/strict";
import { decayConfidence } from "../src/learning.js";

test("candidate confidence decays over time without deleting evidence", () => {
  assert.equal(decayConfidence(0.8, 0), 0.8);
  assert.ok(decayConfidence(0.8, 90) < 0.8);
  assert.ok(decayConfidence(0.8, 180) < decayConfidence(0.8, 90));
});
