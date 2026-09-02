import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LearningEngine } from "../src/learning.js";
import { SessionManager } from "../src/session.js";

test("session end reflects safely and stores no transcript", async () => {
  const root = await mkdtemp(join(tmpdir(), "profile-session-"));
  const learning = new LearningEngine(root);
  const sessions = new SessionManager(learning, { extract: async () => [{ scope: "coding", dimension: "format", value: "concise", statement: "偏好简洁示例", confidence: 0.8 }] });
  const session = sessions.start("codex", "coding", "coding_task");
  const result = await sessions.end(session, "这是不应被保存的原始对话");
  assert.equal(result.extractedCount, 1);
  assert.equal(result.sessionId, session.sessionId);
  assert.equal((await learning.listCandidates()).length, 1);
});
