import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LearningEngine } from "../src/learning.js";
import { ProfileStore } from "../src/store.js";

async function makeLearning() { return new LearningEngine(await mkdtemp(join(tmpdir(), "profile-learning-"))); }

test("observations aggregate into a candidate without changing Profile Pack", async () => {
  const learning = await makeLearning();
  await learning.observe({ agentId: "codex", scope: "coding", dimension: "decision_style", value: "tradeoffs", statement: "偏好先看方案取舍", confidence: 0.7 });
  await learning.observe({ agentId: "claude-code", scope: "coding", dimension: "decision_style", value: "tradeoffs", statement: "偏好先看方案取舍", confidence: 0.9 });
  const candidates = await learning.listCandidates();
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.evidenceCount, 2);
  assert.deepEqual(candidates[0]?.sourceAgents.sort(), ["claude-code", "codex"]);
});

test("different values in one dimension create a conflict", async () => {
  const learning = await makeLearning();
  await learning.observe({ agentId: "codex", scope: "global", dimension: "response_length", value: "concise", statement: "偏好简洁回答", confidence: 0.8 });
  const result = await learning.observe({ agentId: "codex", scope: "global", dimension: "response_length", value: "detailed", statement: "偏好详细回答", confidence: 0.8 });
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0]?.status, "open");
  assert.equal(result.conflicts[0]?.classification, "contradiction");
  const resolved = await learning.resolveConflict(result.conflicts[0]!.conflictId, "keep_both");
  assert.equal(resolved.resolution, "keep_both");
  assert.equal(resolved.status, "resolved");
});

test("different Agents' interaction styles coexist as Agent-specific candidates", async () => {
  const learning = await makeLearning();
  await learning.observe({ agentId: "codex", scope: "global", dimension: "response_length", value: "detailed", statement: "在学习场景偏好详细解释", confidence: 0.8, purpose: "learning" });
  const result = await learning.observe({ agentId: "claude-code", scope: "global", dimension: "response_length", value: "concise", statement: "在编程场景偏好简洁说明", confidence: 0.8, purpose: "coding" });
  assert.equal(result.conflicts.length, 0);
  const summaries = await learning.listCandidateSummaries();
  assert.equal(summaries.every((item) => item.candidate.portability === "agent_specific"), true);
  assert.equal(summaries.some((item) => item.promotable), false);
});

test("one Agent can keep different preferences for different purposes", async () => {
  const learning = await makeLearning();
  await learning.observe({ agentId: "codex", scope: "global", dimension: "response_length", value: "detailed", statement: "学习时偏好详细解释", confidence: 0.8, purpose: "learning" });
  const result = await learning.observe({ agentId: "codex", scope: "global", dimension: "response_length", value: "concise", statement: "执行时偏好简洁说明", confidence: 0.8, purpose: "execution" });
  assert.equal(result.conflicts.length, 0);
});

test("a candidate can be promoted without bypassing profile confirmation", async () => {
  const root = await mkdtemp(join(tmpdir(), "profile-promotion-"));
  const learning = new LearningEngine(root);
  const store = new ProfileStore(root);
  await learning.observe({ agentId: "codex", scope: "coding", dimension: "decision_style", value: "tradeoffs", statement: "偏好先看方案取舍", confidence: 0.9 });
  const candidate = (await learning.listCandidates())[0]!;
  const proposal = await store.propose({ kind: "trait", scope: candidate.scope, statement: candidate.statement, confidence: candidate.confidence, evidenceCount: candidate.evidenceCount }, "learning", candidate.observationIds);
  await learning.markPromoted(candidate.candidateId);
  assert.equal((await store.status()).itemCount, 0);
  assert.equal((await store.listProposals())[0]?.id, proposal.id);
  assert.equal((await learning.getCandidate(candidate.candidateId)).status, "promoted");
});

test("promotion threshold prevents weak one-off observations", async () => {
  const learning = await makeLearning();
  await learning.observe({ agentId: "codex", scope: "coding", dimension: "format", value: "concise", statement: "偏好简洁示例", confidence: 0.6 });
  assert.equal((await learning.listPromotableCandidates()).length, 0);
});
