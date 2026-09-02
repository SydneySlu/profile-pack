import { homedir } from "node:os";
import { join } from "node:path";
import { ProfileStore } from "./store.js";
import type { ProfileUpdate } from "./types.js";
import { runOnboarding } from "./onboarding.js";

const rootDir = process.env.PROFILE_PACK_DIR ?? join(homedir(), ".profile-pack");
const store = new ProfileStore(rootDir);
const [command, ...args] = process.argv.slice(2);

async function main(): Promise<void> {
  if (command === "init") { await store.ensure(); console.log(JSON.stringify(await store.status(), null, 2)); return; }
  if (command === "onboard") { await runOnboarding(store); return; }
  if (command === "status" || !command) { console.log(JSON.stringify(await store.status(), null, 2)); return; }
  if (command === "propose") {
    const [kind, scope, statement] = args;
    if (!kind || !scope || !statement) throw new Error("Usage: profile-pack propose <kind> <scope> <statement>");
    const update: ProfileUpdate = { kind: kind as ProfileUpdate["kind"], scope, statement, confidence: 0.5, evidenceCount: 1 };
    console.log(JSON.stringify(await store.propose(update, "cli"), null, 2)); return;
  }
  if (command === "review") { console.log(JSON.stringify(await store.listProposals(), null, 2)); return; }
  if (command === "export") { console.log(JSON.stringify(await store.exportBundle(), null, 2)); return; }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
