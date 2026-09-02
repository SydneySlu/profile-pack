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
