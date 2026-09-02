import test from "node:test";
import assert from "node:assert/strict";
import { evaluateResponse } from "../src/eval.js";
import type { ProfilePack } from "../src/types.js";

const profile: ProfilePack = { schemaVersion: "0.1", profileId: "p", version: 1, initialized: true, createdAt: "", updatedAt: "", items: [{ id: "s", kind: "fact", scope: "global", statement: "用户的健康信息", sensitivity: "high", confidence: 1, evidenceCount: 1, sourceAgents: ["user"], createdAt: "", updatedAt: "" }], presentationPolicy: { mode: "implicit_personalization", prefer: [], avoid: [] } };

test("response evaluator catches explicit profile references and sensitive leakage", () => {
  const result = evaluateResponse("作为一个INTJ，因为你是INTJ所以这样做；用户的健康信息需要保密。", profile, []);
  assert.equal(result.passed, false);
  assert.ok(result.findings.some((finding) => finding.rule === "sensitive_leakage"));
});

test("natural response passes hard safety checks", () => {
  const result = evaluateResponse("我会先比较几个方案的取舍，再给出建议。", profile, []);
  assert.equal(result.passed, true);
});
