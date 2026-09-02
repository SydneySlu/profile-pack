import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { homedir } from "node:os";
import { join } from "node:path";
import { ProfileStore } from "./store.js";
import { LearningEngine } from "./learning.js";

const rootDir = process.env.PROFILE_PACK_DIR ?? join(homedir(), ".profile-pack");
const store = new ProfileStore(rootDir);
const result = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const resource = (uri: URL, value: unknown) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(value, null, 2) }] });

export function createServer(profileStore: ProfileStore, learning = new LearningEngine(profileStore.rootDir)): McpServer {
  const server = new McpServer({ name: "profile-pack", version: "0.1.0" });
  server.registerTool("profile_status", { description: "Check whether the user's Profile Pack is empty and whether onboarding is required.", inputSchema: {} }, async () => result(await profileStore.status()));
  server.registerTool("initialize_profile", { description: "Initialize an empty Profile Pack with user-approved facts and preferences.", inputSchema: { items: z.array(z.object({ kind: z.enum(["fact", "preference", "goal", "constraint", "boundary", "trait"]), scope: z.string(), statement: z.string().min(1), sensitivity: z.enum(["normal", "sensitive", "high"]).default("normal"), confidence: z.number().min(0).max(1).default(1), evidenceCount: z.number().int().min(0).default(1) })), agentId: z.string().default("onboarding") } }, async ({ items, agentId }) => result(await profileStore.initialize(items, agentId)));
  server.registerTool("get_profile", { description: "Read a purpose-scoped, privacy-filtered view of the user's Profile Pack. Access is limited by the local agent policy.", inputSchema: { scopes: z.array(z.string()).default(["global"]), purpose: z.string().optional(), agentId: z.string().default("unknown"), includeSensitive: z.boolean().default(false) } }, async ({ scopes, purpose, agentId, includeSensitive }) => result(await profileStore.getView(scopes, agentId, purpose, includeSensitive)));
  server.registerTool("propose_profile_update", { description: "Submit a candidate profile update. It is not applied until the user confirms it.", inputSchema: { kind: z.enum(["fact", "preference", "goal", "constraint", "boundary", "trait"]), scope: z.string(), statement: z.string().min(1), sensitivity: z.enum(["normal", "sensitive", "high"]).default("normal"), confidence: z.number().min(0).max(1).default(0.5), evidenceCount: z.number().int().min(0).default(0), evidence: z.array(z.string()).default([]), agentId: z.string().default("unknown") } }, async ({ kind, scope, statement, sensitivity, confidence, evidenceCount, evidence, agentId }) => result(await profileStore.propose({ kind, scope, statement, sensitivity, confidence, evidenceCount }, agentId, evidence)));
  server.registerTool("list_pending_updates", { description: "List profile updates awaiting user review.", inputSchema: {} }, async () => result(await profileStore.listProposals()));
  server.registerTool("decide_profile_update", { description: "Confirm or reject a pending profile update.", inputSchema: { proposalId: z.string(), decision: z.enum(["confirm", "reject"]), reviewerId: z.string().default("user") } }, async ({ proposalId, decision, reviewerId }) => result(await profileStore.decideProposal(proposalId, decision, reviewerId)));
  server.registerTool("export_profile", { description: "Export a portable Profile Pack bundle for migration to another Agent.", inputSchema: { scopes: z.array(z.string()).default([]), includeSensitive: z.boolean().default(false) } }, async ({ scopes, includeSensitive }) => result(await profileStore.exportBundle(scopes, includeSensitive)));
  server.registerTool("import_profile", { description: "Import a previously exported Profile Pack bundle. Existing items are preserved and duplicates are skipped.", inputSchema: { bundle: z.record(z.string(), z.unknown()), agentId: z.string().default("migration") } }, async ({ bundle, agentId }) => result(await profileStore.importBundle(bundle, agentId)));
  server.registerTool("record_profile_observation", { description: "Record a distilled observation from an Agent. Observations become candidates and never change the official profile automatically.", inputSchema: { scope: z.string(), dimension: z.string().min(1), value: z.string().min(1), statement: z.string().min(1), confidence: z.number().min(0).max(1).default(0.5), evidence: z.string().optional(), agentId: z.string().default("unknown") } }, async ({ scope, dimension, value, statement, confidence, evidence, agentId }) => result(await learning.observe({ scope, dimension, value, statement, confidence, evidence, agentId })));
  server.registerTool("list_trait_candidates", { description: "List distilled user-trait candidates awaiting review.", inputSchema: {} }, async () => result(await learning.listCandidates()));
  server.registerTool("promote_trait_candidate", { description: "Turn a reviewed trait candidate into a normal Profile proposal. The user must still confirm the resulting profile proposal.", inputSchema: { candidateId: z.string(), agentId: z.string().default("learning") } }, async ({ candidateId, agentId }) => { const candidate = await learning.getCandidate(candidateId); const proposal = await profileStore.propose({ kind: "trait", scope: candidate.scope, statement: candidate.statement, confidence: candidate.confidence, evidenceCount: candidate.evidenceCount }, agentId, candidate.observationIds); await learning.markPromoted(candidateId); return result({ candidate, proposal }); });
  server.registerTool("list_trait_conflicts", { description: "List possible conflicts where Agents observed different values for the same user dimension and scope.", inputSchema: {} }, async () => result(await learning.listConflicts()));
  server.registerTool("resolve_trait_conflict", { description: "Record the user's decision for a trait conflict. This MVP records the decision; promotion into the official profile remains an explicit confirmation step.", inputSchema: { conflictId: z.string(), resolution: z.enum(["keep_left", "keep_right", "keep_both", "dismiss"]) } }, async ({ conflictId, resolution }) => result(await learning.resolveConflict(conflictId, resolution)));
  server.registerResource("profile-status", "profile://status", { description: "Current Profile Pack state and onboarding status.", mimeType: "application/json" }, async (uri) => resource(uri, await profileStore.status()));
  server.registerResource("presentation-policy", "profile://presentation-policy", { description: "User's preferred implicit personalization policy.", mimeType: "application/json" }, async (uri) => resource(uri, (await profileStore.getProfile()).presentationPolicy));
  return server;
}

if (process.argv[1]?.endsWith("/mcp.ts") || process.argv[1]?.endsWith("/mcp.js")) {
  await store.ensure();
  const learning = new LearningEngine(rootDir);
  await learning.ensure();
  await createServer(store, learning).connect(new StdioServerTransport());
}
