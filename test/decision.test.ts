import test from "node:test";
import assert from "node:assert/strict";
import { retrieveDecisionContext } from "../src/decision.js";
import type { DecisionRequest, ProfilePack } from "../src/types.js";

const profile: ProfilePack = { schemaVersion: "0.1", profileId: "p", version: 3, initialized: true, createdAt: "", updatedAt: "", presentationPolicy: { mode: "implicit_personalization", prefer: [], avoid: [] }, items: [
  { id: "p1", kind: "preference", scope: "global", statement: "希望先讲清方案和取舍，再执行", sensitivity: "normal", confidence: 1, evidenceCount: 1, sourceAgents: ["user"], createdAt: "", updatedAt: "" },
  { id: "g1", kind: "goal", scope: "global", statement: "长期学习和开发 AI 产品、Agent 与 AI 应用", sensitivity: "normal", confidence: 1, evidenceCount: 1, sourceAgents: ["user"], createdAt: "", updatedAt: "" },
  { id: "s1", kind: "fact", scope: "astrology", statement: "出生日期 2003 年 9 月 13 日", sensitivity: "high", confidence: 1, evidenceCount: 1, sourceAgents: ["user"], createdAt: "", updatedAt: "" }
] };

const request: DecisionRequest = { goal: "为个人 AI Agent 项目选择技术方案", taskContext: "需要规划第一版", constraints: ["时间有限"], taskType: "technical-selection", agentId: "codex", purpose: "decision_test" };

test("decision retrieval returns relevant evidence and missing constraints", () => {
  const result = retrieveDecisionContext(profile, profile.items.slice(0, 2), request);
  assert.equal(result.personalized, true);
  assert.ok(result.evidence.some((entry) => entry.item.id === "p1"));
});

test("decision output never echoes an Agent token", () => {
  const result = retrieveDecisionContext(profile, profile.items, { ...request, token: "do-not-return" });
  assert.equal(JSON.stringify(result).includes("do-not-return"), false);
});

test("irrelevant sensitive fields are not selected by the gate", () => {
  const result = retrieveDecisionContext(profile, profile.items, request);
  assert.equal(result.evidence.some((entry) => entry.item.id === "s1"), false);
});

test("no related context is explicitly marked as generic", () => {
  const result = retrieveDecisionContext(profile, profile.items, { ...request, goal: "今天晚餐吃什么", taskContext: "只需要一个随机建议", taskType: "casual", constraints: [] });
  assert.equal(result.personalized, false);
  assert.match(result.message, /通用建议/);
  assert.ok(result.missingInformation.some((item) => item.includes("长期目标")));
});

test("broad AI and project words alone do not make an unrelated fact relevant", () => {
  const unrelated = profile.items.find((item) => item.id === "s1")!;
  const result = retrieveDecisionContext(profile, [unrelated], { ...request, goal: "AI 项目管理助手", taskContext: "查看 Profile Pack 架构" });
  assert.equal(result.personalized, false);
});
