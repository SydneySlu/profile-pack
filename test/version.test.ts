import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProfileStore } from "../src/store.js";

test("profile versions can be compared and rolled back without deleting history", async () => {
  const store = new ProfileStore(await mkdtemp(join(tmpdir(), "profile-version-")));
  await store.initialize([{ kind: "preference", scope: "global", statement: "偏好简洁回答" }], "user");
  const proposal = await store.propose({ kind: "preference", scope: "global", statement: "偏好先看取舍", confidence: 1, evidenceCount: 2 }, "codex");
  await store.decideProposal(proposal.id, "confirm");
  assert.equal((await store.listVersions()).length, 2);
  const diff = await store.compareVersions(1, 2);
  assert.equal(diff.added.length, 1);
  const restored = await store.rollback(1);
  assert.equal(restored.version, 3);
  assert.equal(restored.items.length, 1);
  assert.equal((await store.listVersions()).length, 3);
});
