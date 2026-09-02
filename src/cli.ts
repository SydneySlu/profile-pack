import { homedir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { ProfileStore } from "./store.js";
import type { ProfileUpdate } from "./types.js";
import { runOnboarding } from "./onboarding.js";
import { LearningEngine } from "./learning.js";
import { createExtractorFromEnv, observationsToInput } from "./extractor.js";
import { filterAutomaticObservations } from "./safety.js";
import { SessionManager } from "./session.js";
import { runReview } from "./review.js";
import { evaluateResponse } from "./eval.js";

const rootDir = process.env.PROFILE_PACK_DIR ?? join(homedir(), ".profile-pack");
const store = new ProfileStore(rootDir);
const learning = new LearningEngine(rootDir);
const [command, ...args] = process.argv.slice(2);

function option(name: string, fallback?: string): string | undefined { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; }

async function main(): Promise<void> {
  if (command === "init") { await store.ensure(); console.log(JSON.stringify(await store.status(), null, 2)); return; }
  if (command === "onboard") { await runOnboarding(store); return; }
  if (command === "learn") {
    const file = option("--file");
    if (!file) throw new Error("Usage: profile-pack learn --file transcript.txt [--scope coding] [--agent-id codex]");
    const transcript = await readFile(file, "utf8");
    const extracted = await createExtractorFromEnv().extract(transcript, option("--scope", "global")!);
    const filtered = filterAutomaticObservations(extracted);
    const results = [];
    for (const observation of filtered.accepted) results.push(await learning.observe(observationsToInput(observation, option("--agent-id", "cli")!)));
    console.log(JSON.stringify({ extractedCount: filtered.accepted.length, blockedCount: filtered.blocked.length, blocked: filtered.blocked, results }, null, 2));
    return;
  }
  if (command === "session-start") { await store.ensure(); const session = { sessionId: randomUUID(), agentId: option("--agent-id", "cli")!, scope: option("--scope", "global")!, purpose: option("--purpose"), startedAt: new Date().toISOString() }; console.log(JSON.stringify(session, null, 2)); return; }
  if (command === "session-end") {
    const file = option("--file");
    if (!file) throw new Error("Usage: profile-pack session-end --file transcript.txt --session-file session.json");
    const sessionFile = option("--session-file");
    if (!sessionFile) throw new Error("Usage: profile-pack session-end --file transcript.txt --session-file session.json");
    const session = JSON.parse(await readFile(sessionFile, "utf8"));
    const transcript = await readFile(file, "utf8");
    const manager = new SessionManager(learning, createExtractorFromEnv());
    console.log(JSON.stringify(await manager.end(session, transcript), null, 2));
    return;
  }
  if (command === "status" || !command) { console.log(JSON.stringify(await store.status(), null, 2)); return; }
  if (command === "propose") {
    const [kind, scope, statement] = args;
    if (!kind || !scope || !statement) throw new Error("Usage: profile-pack propose <kind> <scope> <statement>");
    const update: ProfileUpdate = { kind: kind as ProfileUpdate["kind"], scope, statement, confidence: 0.5, evidenceCount: 1 };
    console.log(JSON.stringify(await store.propose(update, "cli"), null, 2)); return;
  }
  if (command === "review") { if (args.includes("--interactive")) { await runReview(store, learning); } else console.log(JSON.stringify({ proposals: await store.listProposals(), candidates: await learning.listCandidateSummaries(), conflicts: await learning.listConflicts() }, null, 2)); return; }
  if (command === "eval") { const file = option("--file"); if (!file) throw new Error("Usage: profile-pack eval --file response.txt [--scope coding]"); const profile = await store.getProfile(); const view = await store.getView([option("--scope", "global")!], "cli", "response_evaluation"); console.log(JSON.stringify(evaluateResponse(await readFile(file, "utf8"), profile, view.items), null, 2)); return; }
  if (command === "versions") { console.log(JSON.stringify(await store.listVersions(), null, 2)); return; }
  if (command === "compare") { const from = Number(option("--from")); const to = Number(option("--to")); if (!from || !to) throw new Error("Usage: profile-pack compare --from 1 --to 2"); console.log(JSON.stringify(await store.compareVersions(from, to), null, 2)); return; }
  if (command === "rollback") { const version = Number(option("--version")); if (!version) throw new Error("Usage: profile-pack rollback --version 1"); console.log(JSON.stringify(await store.rollback(version), null, 2)); return; }
  if (command === "promote") {
    const candidateId = option("--candidate-id");
    if (!candidateId) throw new Error("Usage: profile-pack promote --candidate-id <id>");
    const candidate = await learning.getCandidate(candidateId);
    const minEvidence = Number(option("--min-evidence", "2"));
    const minConfidence = Number(option("--min-confidence", "0.7"));
    if (candidate.status !== "candidate" || candidate.evidenceCount < minEvidence || candidate.confidence < minConfidence) throw new Error(`Candidate does not meet promotion threshold (evidence >= ${minEvidence}, confidence >= ${minConfidence})`);
    const proposal = await store.propose({ kind: "trait", scope: candidate.scope, statement: candidate.statement, confidence: candidate.confidence, evidenceCount: candidate.evidenceCount }, "learning", candidate.observationIds);
    await learning.markPromoted(candidateId);
    console.log(JSON.stringify({ candidate, proposal }, null, 2));
    return;
  }
  if (command === "export") { console.log(JSON.stringify(await store.exportBundle(), null, 2)); return; }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
