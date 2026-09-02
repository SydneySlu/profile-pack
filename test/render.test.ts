import test from "node:test";
import assert from "node:assert/strict";
import { renderContext } from "../src/render.js";
import type { ProfilePack } from "../src/types.js";

test("context rendering prefers holistic implicit personalization", () => {
  const profile: ProfilePack = { schemaVersion: "0.1", profileId: "p", version: 1, initialized: true, createdAt: "", updatedAt: "", items: [], presentationPolicy: { mode: "implicit_personalization", prefer: ["综合多个相关维度"], avoid: ["直接点出画像标签"] } };
  const output = renderContext(profile, [{ id: "1", kind: "trait", scope: "global", statement: "偏好先看取舍", sensitivity: "normal", confidence: 1, evidenceCount: 2, sourceAgents: ["codex"], createdAt: "", updatedAt: "" }]);
  assert.match(output, /USER CONTEXT/);
  assert.match(output, /综合多个相关维度/);
  assert.match(output, /不要提及画像标签|Do not mention profile labels/);
});
