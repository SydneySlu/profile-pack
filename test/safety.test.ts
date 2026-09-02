import test from "node:test";
import assert from "node:assert/strict";
import { filterAutomaticObservations } from "../src/safety.js";

test("automatic learning blocks sensitive identity inference", () => {
  const result = filterAutomaticObservations([
    { scope: "global", dimension: "personality", value: "INTJ", statement: "用户是 INTJ", confidence: 0.9 },
    { scope: "coding", dimension: "format", value: "concise", statement: "用户偏好简洁代码示例", confidence: 0.8 }
  ]);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.blocked.length, 1);
});
