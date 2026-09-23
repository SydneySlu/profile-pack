import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCandidates } from "../src/decision-evaluator.js";
import type { DecisionCandidate, DecisionContextResult } from "../src/types.js";

const context = { personalized: true, message: "", profileVersion: 13, evidence: [{ item: { id: "g", kind: "goal", scope: "global", statement: "AI 项目", sensitivity: "normal", confidence: 1, evidenceCount: 1, sourceAgents: ["user"], createdAt: "", updatedAt: "" }, relevanceScore: 1, matchedTerms: ["项目"], reason: "" }], missingInformation: [], request: { goal: "项目规划", taskContext: "", constraints: ["一周内实现"], outputType: "plan", agentId: "codex" } } satisfies DecisionContextResult;
const candidates: DecisionCandidate[] = [
  { id: "thin", title: "轻量项目资料层", summary: "复用现有 Profile Store 增加项目上下文和状态", steps: ["定义独立项目资料结构", "增加 MCP 读取和用户确认更新入口"], estimatedDays: 6, risks: ["状态模型需要约束"], assumptions: ["复用现有权限和版本机制"] },
  { id: "large", title: "完整项目管理平台", summary: "增加多人协作、远程同步和复杂任务系统", steps: ["搭建服务端", "实现账号体系"], estimatedDays: 20, risks: ["范围过大"], assumptions: [] }
];

test("rule evaluator prefers a feasible candidate and requires confirmation", () => {
  const result = evaluateCandidates(context, candidates);
  assert.equal(result.recommendedCandidateId, "thin");
  assert.equal(result.requiresUserConfirmation, true);
  assert.ok(result.scores.find((score) => score.candidateId === "large")?.constraintConflicts.length);
});

test("rule evaluator does not invent a winner for tied candidates", () => {
  const tied = candidates.map((candidate) => ({ ...candidate, id: `${candidate.id}-tie`, title: "项目管理助手", summary: "AI 项目规划 Profile Pack", estimatedDays: 6, risks: ["存在范围取舍"] }));
  const result = evaluateCandidates(context, tied);
  assert.equal(result.recommendedCandidateId, undefined);
  assert.match(result.message, /不强行排序/);
});
