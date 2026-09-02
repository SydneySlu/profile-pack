import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentPolicy, AuditEntry, PresentationPolicy, ProfileEvent, ProfileItem, ProfilePack, ProfileStatus, ProfileUpdate, Proposal } from "./types.js";

const DEFAULT_POLICY: PresentationPolicy = {
  mode: "implicit_personalization",
  avoid: ["直接点出画像标签作为回答依据", "使用单个画像字段解释用户", "在用户未询问时主动提及敏感属性"],
  prefer: ["综合多个相关维度形成回答", "把画像作为背景而不是话题", "不确定时询问而不是擅自推断"]
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class ProfileStore {
  readonly rootDir: string;
  private readonly profilePath: string;
  private readonly eventsPath: string;
  private readonly proposalsPath: string;
  private readonly auditPath: string;
  private readonly lockPath: string;
  private readonly agentsPath: string;
  private readonly snapshotsDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.profilePath = join(rootDir, "profile.json");
    this.eventsPath = join(rootDir, "events.jsonl");
    this.proposalsPath = join(rootDir, "proposals.json");
    this.auditPath = join(rootDir, "audit.jsonl");
    this.lockPath = join(rootDir, ".write.lock");
    this.agentsPath = join(rootDir, "agents.json");
    this.snapshotsDir = join(rootDir, "snapshots");
  }

  async ensure(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    await mkdir(this.snapshotsDir, { recursive: true });
    if (!(await this.exists(this.profilePath))) {
      const now = new Date().toISOString();
      await this.writeJson(this.profilePath, {
        schemaVersion: "0.1",
        profileId: randomUUID(),
        version: 0,
        initialized: false,
        createdAt: now,
        updatedAt: now,
        items: [],
        presentationPolicy: DEFAULT_POLICY
      } satisfies ProfilePack);
    }
    if (!(await this.exists(this.proposalsPath))) await this.writeJson(this.proposalsPath, []);
    if (!(await this.exists(this.eventsPath))) await writeFile(this.eventsPath, "", "utf8");
    if (!(await this.exists(this.auditPath))) await writeFile(this.auditPath, "", "utf8");
    if (!(await this.exists(this.agentsPath))) await this.writeJson(this.agentsPath, [
      { agentId: "codex", allowedScopes: ["global", "*"], allowSensitive: false },
      { agentId: "claude-code", allowedScopes: ["global", "*"], allowSensitive: false },
      { agentId: "workbuddy", allowedScopes: ["global", "*"], allowSensitive: false },
      { agentId: "user", allowedScopes: ["global", "*"], allowSensitive: true }
    ] satisfies AgentPolicy[]);
  }

  async status(): Promise<ProfileStatus> {
    await this.ensure();
    const profile = await this.getProfile();
    const proposals = await this.getProposals();
    const state = profile.initialized && profile.items.length > 0 ? "ready" : "empty";
    return { state, profileId: profile.profileId, itemCount: profile.items.length, pendingProposalCount: proposals.filter((p) => p.status === "proposed").length, nextAction: state === "empty" ? "onboarding_required" : "none" };
  }

  async getProfile(): Promise<ProfilePack> {
    await this.ensure();
    const profile = JSON.parse(await readFile(this.profilePath, "utf8")) as ProfilePack;
    if (typeof profile.version !== "number") profile.version = 0;
    return profile;
  }

  async getView(scopes: string[], agentId: string, purpose?: string, includeSensitive = false, token?: string): Promise<{ profile: ProfilePack; items: ProfileItem[]; summary: string }> {
    const profile = await this.getProfile();
    const policy = await this.getAgentPolicy(agentId);
    if (policy.token && policy.token !== token) throw new Error(`Agent authentication failed for ${agentId}`);
    const requested = new Set(scopes.length ? scopes : ["global"]);
    const allowed = (scope: string) => scope === "global" || (policy.allowedScopes.includes("*") || policy.allowedScopes.includes(scope));
    const effectiveScopes = [...requested].filter(allowed);
    const grantedSensitive = new Set(policy.sensitiveItemIds ?? []);
    const items = profile.items.filter((item) => (item.scope === "global" || effectiveScopes.includes(item.scope)) && (item.sensitivity === "normal" || (includeSensitive && (policy.allowSensitive || grantedSensitive.has(item.id)))));
    await this.audit({ timestamp: new Date().toISOString(), agentId, action: "read_profile", scopes: effectiveScopes, purpose });
    const summary = items.length === 0 ? "当前没有可用的用户画像内容。" : items.map((item) => `- ${item.statement}`).join("\n");
    return { profile: { ...profile, items }, items, summary };
  }

  async initialize(items: ProfileUpdate[], agentId: string): Promise<ProfilePack> {
    return this.withLock(async () => {
      const profile = await this.getProfile();
      const now = new Date().toISOString();
      profile.initialized = true;
      profile.version += 1;
      profile.updatedAt = now;
      profile.items = items.map((update) => this.toItem(update, agentId, now));
      await this.commitProfile(profile);
      await this.appendEventUnlocked({ eventId: randomUUID(), type: "profile_initialized", agentId, createdAt: now, payload: { itemIds: profile.items.map((i) => i.id) } });
      return profile;
    });
  }

  async propose(update: ProfileUpdate, agentId: string, evidence: string[] = []): Promise<Proposal> {
    return this.withLock(async () => {
      const proposals = await this.getProposals();
      const now = new Date().toISOString();
      const proposal: Proposal = { id: randomUUID(), update: { ...update, confidence: clamp(update.confidence ?? 0.5), sensitivity: update.sensitivity ?? "normal", evidenceCount: update.evidenceCount ?? evidence.length }, agentId, status: "proposed", createdAt: now, updatedAt: now, evidence };
      proposals.push(proposal);
      await this.writeJson(this.proposalsPath, proposals);
      await this.appendEventUnlocked({ eventId: randomUUID(), type: "profile_update_proposed", agentId, createdAt: now, payload: proposal as unknown as Record<string, unknown> });
      return proposal;
    });
  }

  async listProposals(): Promise<Proposal[]> { return (await this.getProposals()).filter((proposal) => proposal.status === "proposed"); }

  async decideProposal(id: string, decision: "confirm" | "reject", reviewerId = "user"): Promise<Proposal> {
    return this.withLock(async () => {
      const proposals = await this.getProposals();
      const proposal = proposals.find((p) => p.id === id);
      if (!proposal) throw new Error(`Proposal not found: ${id}`);
      if (proposal.status !== "proposed") return proposal;
      proposal.status = decision === "confirm" ? "confirmed" : "rejected";
      proposal.updatedAt = new Date().toISOString();
      if (decision === "confirm") {
        const profile = await this.getProfile();
        const existing = profile.items.find((item) => item.scope === proposal.update.scope && item.kind === proposal.update.kind && item.statement === proposal.update.statement);
        if (existing) {
          existing.confidence = Math.max(existing.confidence, proposal.update.confidence ?? existing.confidence);
          existing.evidenceCount = Math.max(existing.evidenceCount, proposal.update.evidenceCount ?? existing.evidenceCount);
          existing.updatedAt = proposal.updatedAt;
          if (!existing.sourceAgents.includes(proposal.agentId)) existing.sourceAgents.push(proposal.agentId);
        } else profile.items.push(this.toItem(proposal.update, proposal.agentId, proposal.updatedAt));
        profile.initialized = true;
        profile.version += 1;
        profile.updatedAt = proposal.updatedAt;
        await this.commitProfile(profile);
      }
      await this.writeJson(this.proposalsPath, proposals);
      await this.appendEventUnlocked({ eventId: randomUUID(), type: decision === "confirm" ? "profile_update_confirmed" : "profile_update_rejected", agentId: reviewerId, createdAt: proposal.updatedAt, payload: { proposalId: id, sourceAgentId: proposal.agentId, update: proposal.update } });
      return proposal;
    });
  }

  async exportBundle(scopes: string[] = [], includeSensitive = false): Promise<Record<string, unknown>> {
    // Export is an explicit user action, so use the user policy rather than an
    // unknown Agent policy. Sensitive data is still excluded unless requested.
    const view = await this.getView(scopes, "user", "profile_export", includeSensitive);
    return { manifest: { schemaVersion: view.profile.schemaVersion, profileId: view.profile.profileId, exportedAt: new Date().toISOString(), scopes }, profile: { ...view.profile, items: view.items } };
  }

  async importBundle(bundle: unknown, agentId = "migration"): Promise<ProfilePack> {
    return this.withLock(async () => {
      const candidate = bundle as { manifest?: { schemaVersion?: string }; profile?: Partial<ProfilePack> };
      if (candidate?.manifest?.schemaVersion !== "0.1" || !candidate.profile || !Array.isArray(candidate.profile.items)) throw new Error("Invalid Profile Pack bundle: expected manifest.schemaVersion 0.1 and profile.items");
      const profile = await this.getProfile();
      const existingKeys = new Set(profile.items.map((item) => `${item.scope}|${item.kind}|${item.statement}`));
      for (const raw of candidate.profile.items) {
        const item = raw as ProfileItem;
        const key = `${item.scope}|${item.kind}|${item.statement}`;
        if (!existingKeys.has(key)) { profile.items.push({ ...item, id: item.id || randomUUID(), sourceAgents: [...new Set([...(item.sourceAgents ?? []), agentId])] }); existingKeys.add(key); }
      }
      profile.initialized = profile.items.length > 0;
      profile.version += 1;
      profile.updatedAt = new Date().toISOString();
      await this.commitProfile(profile);
      await this.appendEventUnlocked({ eventId: randomUUID(), type: "profile_imported", agentId, createdAt: profile.updatedAt, payload: { importedCount: candidate.profile.items.length, sourceProfileId: candidate.profile.profileId } });
      return profile;
    });
  }

  async audit(entry: AuditEntry): Promise<void> {
    await this.ensure();
    await writeFile(this.auditPath, `${JSON.stringify(entry)}\n`, { encoding: "utf8", flag: "a" });
  }

  async getAgentPolicy(agentId: string): Promise<AgentPolicy> {
    await this.ensure();
    const policies = JSON.parse(await readFile(this.agentsPath, "utf8")) as AgentPolicy[];
    return policies.find((policy) => policy.agentId === agentId) ?? { agentId, allowedScopes: ["global"], allowSensitive: false };
  }

  async setAgentToken(agentId: string, token: string): Promise<AgentPolicy> {
    return this.withLock(async () => {
      await this.ensure();
      const policies = JSON.parse(await readFile(this.agentsPath, "utf8")) as AgentPolicy[];
      const policy = policies.find((item) => item.agentId === agentId) ?? { agentId, allowedScopes: ["global"], allowSensitive: false };
      policy.token = token;
      if (!policies.includes(policy)) policies.push(policy);
      await this.writeJson(this.agentsPath, policies);
      return policy;
    });
  }

  async listAgentPolicies(): Promise<AgentPolicy[]> {
    await this.ensure();
    const policies = JSON.parse(await readFile(this.agentsPath, "utf8")) as AgentPolicy[];
    return policies.map(({ token: _token, ...publicPolicy }) => publicPolicy);
  }

  async setAgentSensitiveItems(agentId: string, itemIds: string[]): Promise<AgentPolicy> {
    return this.withLock(async () => {
      const policies = JSON.parse(await readFile(this.agentsPath, "utf8")) as AgentPolicy[];
      const policy = policies.find((item) => item.agentId === agentId) ?? { agentId, allowedScopes: ["global"], allowSensitive: false };
      policy.sensitiveItemIds = [...new Set(itemIds)];
      if (!policies.includes(policy)) policies.push(policy);
      await this.writeJson(this.agentsPath, policies);
      await this.audit({ timestamp: new Date().toISOString(), agentId: "user", action: "set_sensitive_item_grants", scopes: ["global"], purpose: `target:${agentId}` });
      const { token: _token, ...publicPolicy } = policy;
      return publicPolicy;
    });
  }

  async listVersions(): Promise<Array<{ version: number; updatedAt: string }>> {
    await this.ensure();
    const profile = await this.getProfile();
    const versions: Array<{ version: number; updatedAt: string }> = [];
    for (let version = 1; version <= profile.version; version++) {
      const snapshot = await this.readSnapshot(version).catch(() => undefined);
      if (snapshot) versions.push({ version, updatedAt: snapshot.updatedAt });
    }
    return versions;
  }

  async compareVersions(fromVersion: number, toVersion: number): Promise<{ fromVersion: number; toVersion: number; added: ProfileItem[]; removed: ProfileItem[]; changed: Array<{ before: ProfileItem; after: ProfileItem }> }> {
    const before = await this.readSnapshot(fromVersion);
    const after = await this.readSnapshot(toVersion);
    const beforeMap = new Map(before.items.map((item) => [item.id, item]));
    const afterMap = new Map(after.items.map((item) => [item.id, item]));
    const added = after.items.filter((item) => !beforeMap.has(item.id));
    const removed = before.items.filter((item) => !afterMap.has(item.id));
    const changed = after.items.flatMap((item) => { const old = beforeMap.get(item.id); return old && JSON.stringify(old) !== JSON.stringify(item) ? [{ before: old, after: item }] : []; });
    return { fromVersion, toVersion, added, removed, changed };
  }

  async rollback(version: number, agentId = "user"): Promise<ProfilePack> {
    return this.withLock(async () => {
      const previous = await this.readSnapshot(version);
      const profile = await this.getProfile();
      const now = new Date().toISOString();
      const restored: ProfilePack = { ...previous, version: profile.version + 1, updatedAt: now };
      await this.commitProfile(restored);
      await this.appendEventUnlocked({ eventId: randomUUID(), type: "profile_rolled_back", agentId, createdAt: now, payload: { fromVersion: version, toVersion: restored.version } });
      return restored;
    });
  }

  private toItem(update: ProfileUpdate, agentId: string, now: string): ProfileItem {
    return { id: randomUUID(), kind: update.kind, scope: update.scope, statement: update.statement, sensitivity: update.sensitivity ?? "normal", confidence: clamp(update.confidence ?? 1), evidenceCount: update.evidenceCount ?? 1, sourceAgents: [agentId], createdAt: now, updatedAt: now, expiresAt: update.expiresAt };
  }

  private async getProposals(): Promise<Proposal[]> { await this.ensure(); return JSON.parse(await readFile(this.proposalsPath, "utf8")) as Proposal[]; }
  private async appendEventUnlocked(event: ProfileEvent): Promise<void> { await writeFile(this.eventsPath, `${JSON.stringify(event)}\n`, { encoding: "utf8", flag: "a" }); }
  private async exists(path: string): Promise<boolean> { try { await readFile(path); return true; } catch { return false; } }
  private async writeJson(path: string, value: unknown): Promise<void> { const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`; await writeFile(tmp, JSON.stringify(value, null, 2), "utf8"); await rename(tmp, path); }
  private async commitProfile(profile: ProfilePack): Promise<void> { await this.writeJson(this.profilePath, profile); await this.writeJson(join(this.snapshotsDir, `v${String(profile.version).padStart(6, "0")}.json`), profile); }
  private async readSnapshot(version: number): Promise<ProfilePack> { return JSON.parse(await readFile(join(this.snapshotsDir, `v${String(version).padStart(6, "0")}.json`), "utf8")) as ProfilePack; }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensure();
    let handle;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { handle = await open(this.lockPath, "wx"); break; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; await sleep(10); }
    }
    if (!handle) throw new Error("Could not acquire Profile Pack write lock");
    try { return await fn(); } finally { await handle.close(); await unlink(this.lockPath).catch(() => undefined); }
  }
}

function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }
