import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { ProfileStore } from "../src/store.js";

async function makeStore() { return new ProfileStore(await mkdtemp(join(tmpdir(), "profile-pack-"))); }

test("empty profile requires onboarding", async () => {
  const store = await makeStore();
  const status = await store.status();
  assert.equal(status.state, "empty");
  assert.equal(status.nextAction, "onboarding_required");
});

test("proposals require confirmation before changing profile", async () => {
  const store = await makeStore();
  const proposal = await store.propose({ kind: "trait", scope: "coding", statement: "偏好先看取舍", confidence: 0.8, evidenceCount: 3 }, "codex", ["e1", "e2", "e3"]);
  assert.equal((await store.status()).itemCount, 0);
  await store.decideProposal(proposal.id, "confirm");
  const view = await store.getView(["coding"], "claude", "coding_task");
  assert.equal(view.items[0]?.statement, "偏好先看取舍");
});

test("sensitive items are hidden by default", async () => {
  const store = await makeStore();
  await store.initialize([{ kind: "fact", scope: "global", statement: "普通信息", sensitivity: "normal" }, { kind: "fact", scope: "global", statement: "敏感信息", sensitivity: "sensitive" }], "user");
  const filtered = await store.getView(["global"], "codex");
  assert.equal(filtered.items.length, 1);
  assert.equal(filtered.profile.items.length, 1);
  assert.equal((await store.getView(["global"], "codex", undefined, true)).items.length, 2);
});

test("concurrent proposals preserve all events", async () => {
  const store = await makeStore();
  await Promise.all(Array.from({ length: 10 }, (_, i) => store.propose({ kind: "trait", scope: "coding", statement: `trait-${i}`, evidenceCount: 2 }, `agent-${i}`)));
  assert.equal((await store.listProposals()).length, 10);
  const events = (await readFile(join(store.rootDir, "events.jsonl"), "utf8")).trim().split("\n");
  assert.equal(events.length, 10);
});

test("exported bundles can be imported without duplicating items", async () => {
  const source = await makeStore();
  await source.initialize([{ kind: "preference", scope: "global", statement: "喜欢简洁回答" }], "user");
  const bundle = await source.exportBundle();
  const target = await makeStore();
  await target.importBundle(bundle);
  await target.importBundle(bundle);
  assert.equal((await target.getProfile()).items.length, 1);
});
