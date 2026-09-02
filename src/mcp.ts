import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { homedir } from "node:os";
import { join } from "node:path";
import { ProfileStore } from "./store.js";

const rootDir = process.env.PROFILE_PACK_DIR ?? join(homedir(), ".profile-pack");
const store = new ProfileStore(rootDir);
const result = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const resource = (uri: URL, value: unknown) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(value, null, 2) }] });

export function createServer(profileStore: ProfileStore): McpServer {
  const server = new McpServer({ name: "profile-pack", version: "0.1.0" });
  server.registerTool("profile_status", { description: "Check whether the user's Profile Pack is empty and whether onboarding is required.", inputSchema: {} }, async () => result(await profileStore.status()));
  server.registerTool("initialize_profile", { description: "Initialize an empty Profile Pack with user-approved facts and preferences.", inputSchema: { items: z.array(z.object({ kind: z.enum(["fact", "preference", "goal", "constraint", "boundary", "trait"]), scope: z.string(), statement: z.string().min(1), sensitivity: z.enum(["normal", "sensitive", "high"]).default("normal"), confidence: z.number().min(0).max(1).default(1), evidenceCount: z.number().int().min(0).default(1) })), agentId: z.string().default("onboarding") } }, async ({ items, agentId }) => result(await profileStore.initialize(items, agentId)));
  server.registerTool("get_profile", { description: "Read a purpose-scoped, privacy-filtered view of the user's Profile Pack. Access is limited by the local agent policy.", inputSchema: { scopes: z.array(z.string()).default(["global"]), purpose: z.string().optional(), agentId: z.string().default("unknown"), includeSensitive: z.boolean().default(false) } }, async ({ scopes, purpose, agentId, includeSensitive }) => result(await profileStore.getView(scopes, agentId, purpose, includeSensitive)));
  server.registerTool("propose_profile_update", { description: "Submit a candidate profile update. It is not applied until the user confirms it.", inputSchema: { kind: z.enum(["fact", "preference", "goal", "constraint", "boundary", "trait"]), scope: z.string(), statement: z.string().min(1), sensitivity: z.enum(["normal", "sensitive", "high"]).default("normal"), confidence: z.number().min(0).max(1).default(0.5), evidenceCount: z.number().int().min(0).default(0), evidence: z.array(z.string()).default([]), agentId: z.string().default("unknown") } }, async ({ kind, scope, statement, sensitivity, confidence, evidenceCount, evidence, agentId }) => result(await profileStore.propose({ kind, scope, statement, sensitivity, confidence, evidenceCount }, agentId, evidence)));
  server.registerTool("list_pending_updates", { description: "List profile updates awaiting user review.", inputSchema: {} }, async () => result(await profileStore.listProposals()));
  server.registerTool("decide_profile_update", { description: "Confirm or reject a pending profile update.", inputSchema: { proposalId: z.string(), decision: z.enum(["confirm", "reject"]), reviewerId: z.string().default("user") } }, async ({ proposalId, decision, reviewerId }) => result(await profileStore.decideProposal(proposalId, decision, reviewerId)));
  server.registerTool("export_profile", { description: "Export a portable Profile Pack bundle for migration to another Agent.", inputSchema: { scopes: z.array(z.string()).default([]), includeSensitive: z.boolean().default(false) } }, async ({ scopes, includeSensitive }) => result(await profileStore.exportBundle(scopes, includeSensitive)));
  server.registerTool("import_profile", { description: "Import a previously exported Profile Pack bundle. Existing items are preserved and duplicates are skipped.", inputSchema: { bundle: z.record(z.string(), z.unknown()), agentId: z.string().default("migration") } }, async ({ bundle, agentId }) => result(await profileStore.importBundle(bundle, agentId)));
  server.registerResource("profile-status", "profile://status", { description: "Current Profile Pack state and onboarding status.", mimeType: "application/json" }, async (uri) => resource(uri, await profileStore.status()));
  server.registerResource("presentation-policy", "profile://presentation-policy", { description: "User's preferred implicit personalization policy.", mimeType: "application/json" }, async (uri) => resource(uri, (await profileStore.getProfile()).presentationPolicy));
  return server;
}

if (process.argv[1]?.endsWith("/mcp.ts") || process.argv[1]?.endsWith("/mcp.js")) {
  await store.ensure();
  await createServer(store).connect(new StdioServerTransport());
}
