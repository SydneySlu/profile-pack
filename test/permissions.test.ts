import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProfileStore } from "../src/store.js";

test("configured Agent tokens are required for profile reads", async () => {
  const store = new ProfileStore(await mkdtemp(join(tmpdir(), "profile-permission-")));
  await store.initialize([{ kind: "fact", scope: "global", statement: "普通资料" }], "user");
  await store.setAgentToken("codex", "secret-token");
  await assert.rejects(() => store.getView(["global"], "codex"), /authentication failed/);
  const view = await store.getView(["global"], "codex", "coding", false, "secret-token");
  assert.equal(view.items.length, 1);
});

test("sensitive access can be granted per item without broad Agent access", async () => {
  const store = new ProfileStore(await mkdtemp(join(tmpdir(), "profile-permission-item-")));
  await store.initialize([
    { kind: "fact", scope: "global", statement: "公开资料" },
    { kind: "fact", scope: "global", statement: "仅授权资料", sensitivity: "sensitive" }
  ], "user");
  const profile = await store.getProfile();
  const sensitive = profile.items.find((item) => item.sensitivity === "sensitive")!;
  await store.setAgentSensitiveItems("codex", [sensitive.id]);
  assert.equal((await store.getView(["global"], "codex", "coding", true)).items.some((item) => item.id === sensitive.id), true);
  assert.equal((await store.getView(["global"], "claude-code", "coding", true)).items.some((item) => item.id === sensitive.id), false);
});

test("decision context honors Agent token and sensitive filtering", async () => {
  const store = new ProfileStore(await mkdtemp(join(tmpdir(), "profile-decision-permission-")));
  await store.initialize([
    { kind: "goal", scope: "global", statement: "学习 AI 项目规划", sensitivity: "normal" },
    { kind: "fact", scope: "finance", statement: "理财目标是保值并盈利", sensitivity: "high" }
  ], "user");
  await store.setAgentToken("codex", "decision-token");
  await assert.rejects(() => store.getDecisionContext({ goal: "AI 项目规划", agentId: "codex" }), /authentication failed/);
  const result = await store.getDecisionContext({ goal: "AI 项目规划", agentId: "codex", token: "decision-token", allowSensitive: true });
  assert.equal(result.evidence.some((entry) => entry.item.scope === "finance"), false);
  assert.equal(result.evidence.some((entry) => entry.item.scope === "global"), true);
});
