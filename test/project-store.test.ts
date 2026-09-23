import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectStore } from "../src/project-store.js";
import { ProfileStore } from "../src/store.js";

async function makeStore() { return new ProjectStore(await mkdtemp(join(tmpdir(), "project-profile-"))); }

test("project profile is independent and supports authorized reads", async () => {
  const store = await makeStore();
  const project = await store.create({ name: "AI 项目管理助手", goal: "一周内完成最小闭环", allowedAgents: ["codex"] });
  assert.equal(project.version, 1);
  assert.equal((await store.list("codex")).length, 1);
  await assert.rejects(() => store.get(project.projectId, "claude-code"), /not authorized/);
  assert.equal((await store.get(project.projectId, "codex")).goal, "一周内完成最小闭环");
});

test("project updates require confirmation and create a new version", async () => {
  const store = await makeStore();
  const project = await store.create({ name: "Demo", goal: "验证" }, "user");
  const proposal = await store.propose(project.projectId, { status: "active", tasks: [{ id: "t1", title: "实现 MCP 工具", status: "in_progress" }] }, "user", project.version, "开始实现");
  assert.equal((await store.get(project.projectId)).version, 1);
  assert.equal((await store.decide(proposal.proposalId, project.projectId, "confirm")).status, "confirmed");
  const updated = await store.get(project.projectId);
  assert.equal(updated.version, 2);
  assert.equal(updated.tasks[0]?.title, "实现 MCP 工具");
});

test("stale project proposals are not applied", async () => {
  const store = await makeStore();
  const project = await store.create({ name: "Demo", goal: "验证" }, "user");
  const first = await store.propose(project.projectId, { description: "第一次" }, "user", 1);
  const second = await store.propose(project.projectId, { description: "第二次" }, "user", 1);
  await store.decide(first.proposalId, project.projectId, "confirm");
  const stale = await store.decide(second.proposalId, project.projectId, "confirm");
  assert.equal(stale.status, "stale");
  assert.equal((await store.get(project.projectId)).description, "第一次");
  assert.match(await readFile(join(store.rootDir, "audit.jsonl"), "utf8"), /project_update_confirmed/);
});

test("only the user can change project Agent access", async () => {
  const store = await makeStore();
  const project = await store.create({ name: "Private", goal: "test", allowedAgents: ["codex"] });
  await assert.rejects(() => store.authorize(project.projectId, ["claude-code"], "codex"), /Only the user/);
  const changed = await store.authorize(project.projectId, ["claude-code"]);
  assert.deepEqual(changed.allowedAgents, ["user", "claude-code"]);
});

test("only the user can confirm a project update", async () => {
  const store = await makeStore();
  const project = await store.create({ name: "Demo", goal: "test", allowedAgents: ["codex"] });
  const proposal = await store.propose(project.projectId, { description: "proposed" }, "codex");
  await assert.rejects(() => store.decide(proposal.proposalId, project.projectId, "confirm", "codex"), /Only the user/);
  assert.equal((await store.get(project.projectId)).description, "");
});

test("project lifecycle does not modify personal Profile data", async () => {
  const root = await mkdtemp(join(tmpdir(), "project-profile-isolation-"));
  const profileStore = new ProfileStore(root);
  const personalBefore = await profileStore.initialize([{ kind: "goal", scope: "global", statement: "个人长期目标" }], "user");
  const projects = new ProjectStore(root);
  const project = await projects.create({ name: "工作项目", goal: "保存项目上下文" });
  const proposal = await projects.propose(project.projectId, { status: "active" }, "user");
  await projects.decide(proposal.proposalId, project.projectId, "confirm");
  const personalAfter = await profileStore.getProfile();
  assert.equal(personalAfter.version, personalBefore.version);
  assert.equal(JSON.stringify(personalAfter.items), JSON.stringify(personalBefore.items));
});

test("project IDs cannot escape the project data directory", async () => {
  const store = await makeStore();
  await assert.rejects(() => store.get("../../profile.json"), /Invalid Project Profile ID/);
});

test("decision feedback is append-only and does not update either Profile", async () => {
  const root = await mkdtemp(join(tmpdir(), "project-decision-log-"));
  const profileStore = new ProfileStore(root);
  const personal = await profileStore.initialize([{ kind: "goal", scope: "global", statement: "个人目标" }], "user");
  const projects = new ProjectStore(root);
  const project = await projects.create({ name: "AI 项目", goal: "完成 MVP", allowedAgents: ["codex"] });
  const entry = await projects.recordDecision({ projectId: project.projectId, goal: "选择项目架构", candidateIds: ["a", "b"], recommendedCandidateId: "a", action: "modified", selectedCandidateId: "a", modification: "保留独立数据层", reason: "避免污染个人 Profile", evaluator: "rule", profileVersion: personal.version, agentId: "codex" });
  assert.equal(entry.action, "modified");
  assert.equal((await projects.listDecisions(project.projectId, "codex")).length, 1);
  assert.equal((await projects.get(project.projectId, "codex")).version, project.version);
  assert.equal((await profileStore.getProfile()).version, personal.version);
});

test("unauthorized Agent cannot write decision feedback", async () => {
  const store = await makeStore();
  const project = await store.create({ name: "Private", goal: "test", allowedAgents: ["codex"] });
  await assert.rejects(() => store.recordDecision({ projectId: project.projectId, goal: "test", candidateIds: [], action: "rejected", evaluator: "rule", agentId: "claude-code" }), /not authorized/);
});
