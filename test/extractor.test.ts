import test from "node:test";
import assert from "node:assert/strict";
import { ProfileExtractor, parseObservationResponse } from "../src/extractor.js";

test("parses fenced JSON observations", () => {
  const observations = parseObservationResponse('```json\n{"observations":[{"scope":"coding","dimension":"decision_style","value":"tradeoffs","statement":"偏好先看方案取舍","confidence":0.8,"evidence":"多次要求比较方案"}]}\n```');
  assert.equal(observations[0]?.dimension, "decision_style");
});

test("OpenAI-compatible extraction uses structured JSON and does not persist transcript", async () => {
  let requestBody = "";
  const fakeFetch: typeof fetch = async (_input, init) => { requestBody = String(init?.body); return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ observations: [{ scope: "coding", dimension: "format", value: "concise", statement: "偏好简洁代码示例", confidence: 0.75 }] }) } }] }), { status: 200, headers: { "content-type": "application/json" } }); };
  const extractor = new ProfileExtractor({ provider: "openai-compatible", baseUrl: "http://127.0.0.1:9999/v1", model: "test", apiKey: "x", allowRemote: false }, fakeFetch);
  const result = await extractor.extract("用户多次要求代码示例简短", "coding");
  assert.equal(result.length, 1);
  assert.match(requestBody, /代码示例简短/);
});

test("remote extraction is blocked by default", async () => {
  const extractor = new ProfileExtractor({ provider: "openai-compatible", baseUrl: "https://example.com/v1", model: "test", apiKey: "x", allowRemote: false }, async () => { throw new Error("must not call network"); });
  await assert.rejects(() => extractor.extract("敏感对话", "global"), /Remote profile extraction is disabled/);
});
