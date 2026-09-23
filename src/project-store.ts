import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AuditEntry, ProjectCreateInput, ProjectProfile, ProjectProposal, ProjectUpdatePatch } from "./types.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class ProjectStore {
  private readonly projectsDir: string;
  private readonly lockPath: string;
  private readonly auditPath: string;

  constructor(readonly rootDir: string) {
    this.projectsDir = join(rootDir, "projects");
    this.lockPath = join(rootDir, ".projects.write.lock");
    this.auditPath = join(rootDir, "audit.jsonl");
  }

  async ensure(): Promise<void> {
    await mkdir(this.projectsDir, { recursive: true });
  }

  async create(input: ProjectCreateInput, agentId = "user"): Promise<ProjectProfile> {
    return this.withLock(async () => {
      const now = new Date().toISOString();
      const project: ProjectProfile = {
        schemaVersion: "0.1",
        projectId: randomUUID(),
        name: input.name,
        description: input.description ?? "",
        goal: input.goal,
        status: input.status ?? "idea",
        tags: unique(input.tags ?? []),
        constraints: unique(input.constraints ?? []),
        milestones: [],
        tasks: [],
        decisions: [],
        risks: [],
        allowedAgents: unique(input.allowedAgents?.length ? input.allowedAgents : [agentId]),
        version: 1,
        createdAt: now,
        updatedAt: now
      };
      await this.writeProject(project);
      await this.writeJson(this.proposalsPath(project.projectId), []);
      await this.appendEvent(project.projectId, { eventId: randomUUID(), type: "project_created", agentId, createdAt: now, payload: { version: project.version } });
      await this.audit({ timestamp: now, agentId, action: "create_project", scopes: [project.projectId], purpose: "project_management" });
      return project;
    });
  }

  async list(agentId = "user"): Promise<Array<Pick<ProjectProfile, "projectId" | "name" | "goal" | "status" | "version" | "updatedAt">>> {
    await this.ensure();
    const names = await this.readDirNames();
    const result: Array<Pick<ProjectProfile, "projectId" | "name" | "goal" | "status" | "version" | "updatedAt">> = [];
    for (const projectId of names) {
      const project = await this.readProject(projectId).catch(() => undefined);
      if (project && this.canAccess(project, agentId)) result.push({ projectId, name: project.name, goal: project.goal, status: project.status, version: project.version, updatedAt: project.updatedAt });
    }
    return result.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async get(projectId: string, agentId = "user", purpose = "project_context"): Promise<ProjectProfile> {
    const project = await this.readProject(projectId);
    this.assertAccess(project, agentId);
    await this.audit({ timestamp: new Date().toISOString(), agentId, action: "read_project", scopes: [projectId], purpose });
    return project;
  }

  async authorize(projectId: string, agentIds: string[], reviewerId = "user"): Promise<ProjectProfile> {
    return this.withLock(async () => {
      if (reviewerId !== "user") throw new Error("Only the user can authorize Project Profile Agents");
      const project = await this.readProject(projectId);
      project.allowedAgents = unique(["user", ...agentIds]);
      project.version += 1;
      project.updatedAt = new Date().toISOString();
      await this.writeProject(project);
      await this.appendEvent(projectId, { eventId: randomUUID(), type: "project_access_changed", agentId: reviewerId, createdAt: project.updatedAt, payload: { allowedAgents: project.allowedAgents } });
      await this.audit({ timestamp: project.updatedAt, agentId: reviewerId, action: "authorize_project_agents", scopes: [projectId], purpose: "project_permissions" });
      return project;
    });
  }

  async propose(projectId: string, patch: ProjectUpdatePatch, agentId: string, baseVersion?: number, reason?: string, evidence: string[] = []): Promise<ProjectProposal> {
    const project = await this.get(projectId, agentId, "project_update_proposal");
    const proposal: ProjectProposal = { proposalId: randomUUID(), projectId, baseVersion: baseVersion ?? project.version, patch, reason, evidence, agentId, status: "proposed", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    return this.withLock(async () => {
      const proposals = await this.readProposals(projectId);
      proposals.push(proposal);
      await this.writeJson(this.proposalsPath(projectId), proposals);
      await this.appendEvent(projectId, { eventId: randomUUID(), type: "project_update_proposed", agentId, createdAt: proposal.createdAt, payload: { proposalId: proposal.proposalId, baseVersion: proposal.baseVersion } });
      return proposal;
    });
  }

  async listProposals(projectId: string, agentId = "user"): Promise<ProjectProposal[]> {
    const project = await this.get(projectId, agentId, "project_proposals");
    return (await this.readProposals(project.projectId)).filter((proposal) => proposal.status === "proposed");
  }

  async decide(proposalId: string, projectId: string, decision: "confirm" | "reject", reviewerId = "user"): Promise<ProjectProposal> {
    return this.withLock(async () => {
      if (reviewerId !== "user") throw new Error("Only the user can confirm or reject Project Profile updates");
      const project = await this.readProject(projectId);
      this.assertAccess(project, reviewerId);
      const proposals = await this.readProposals(projectId);
      const proposal = proposals.find((item) => item.proposalId === proposalId);
      if (!proposal) throw new Error(`Project proposal not found: ${proposalId}`);
      if (proposal.status !== "proposed") return proposal;
      proposal.updatedAt = new Date().toISOString();
      if (decision === "reject") proposal.status = "rejected";
      else if (proposal.baseVersion !== project.version) {
        proposal.status = "stale";
        await this.appendEvent(projectId, { eventId: randomUUID(), type: "project_update_stale", agentId: reviewerId, createdAt: proposal.updatedAt, payload: { proposalId, baseVersion: proposal.baseVersion, currentVersion: project.version } });
        await this.writeJson(this.proposalsPath(projectId), proposals);
        return proposal;
      } else {
        applyPatch(project, proposal.patch);
        project.version += 1;
        project.updatedAt = proposal.updatedAt;
        proposal.status = "confirmed";
        await this.writeProject(project);
      }
      await this.writeJson(this.proposalsPath(projectId), proposals);
      await this.appendEvent(projectId, { eventId: randomUUID(), type: decision === "confirm" ? "project_update_confirmed" : "project_update_rejected", agentId: reviewerId, createdAt: proposal.updatedAt, payload: { proposalId, version: project.version } });
      await this.audit({ timestamp: proposal.updatedAt, agentId: reviewerId, action: decision === "confirm" ? "project_update_confirmed" : "project_update_rejected", scopes: [projectId], purpose: "project_management" });
      return proposal;
    });
  }

  private canAccess(project: ProjectProfile, agentId: string): boolean { return agentId === "user" || project.allowedAgents.includes("*") || project.allowedAgents.includes(agentId); }
  private assertAccess(project: ProjectProfile, agentId: string): void { if (!this.canAccess(project, agentId)) throw new Error(`Agent ${agentId} is not authorized for Project Profile ${project.projectId}`); }
  private projectDir(projectId: string): string { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) throw new Error("Invalid Project Profile ID"); return join(this.projectsDir, projectId); }
  private projectPath(projectId: string): string { return join(this.projectDir(projectId), "project.json"); }
  private proposalsPath(projectId: string): string { return join(this.projectDir(projectId), "proposals.json"); }
  private eventsPath(projectId: string): string { return join(this.projectDir(projectId), "events.jsonl"); }
  private async writeProject(project: ProjectProfile): Promise<void> { await mkdir(join(this.projectDir(project.projectId), "snapshots"), { recursive: true }); await this.writeJson(this.projectPath(project.projectId), project); await this.writeJson(join(this.projectDir(project.projectId), "snapshots", `v${String(project.version).padStart(6, "0")}.json`), project); }
  private async readProject(projectId: string): Promise<ProjectProfile> { await this.ensure(); return JSON.parse(await readFile(this.projectPath(projectId), "utf8")) as ProjectProfile; }
  private async readProposals(projectId: string): Promise<ProjectProposal[]> { return JSON.parse(await readFile(this.proposalsPath(projectId), "utf8")) as ProjectProposal[]; }
  private async appendEvent(projectId: string, event: Record<string, unknown>): Promise<void> { await writeFile(this.eventsPath(projectId), `${JSON.stringify(event)}\n`, { encoding: "utf8", flag: "a" }); }
  private async audit(entry: AuditEntry): Promise<void> { await mkdir(this.rootDir, { recursive: true }); await writeFile(this.auditPath, `${JSON.stringify(entry)}\n`, { encoding: "utf8", flag: "a" }); }
  private async readDirNames(): Promise<string[]> { const { readdir } = await import("node:fs/promises"); return readdir(this.projectsDir); }
  private async writeJson(path: string, value: unknown): Promise<void> { const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`; await writeFile(tmp, JSON.stringify(value, null, 2), "utf8"); await rename(tmp, path); }
  private async withLock<T>(fn: () => Promise<T>): Promise<T> { await this.ensure(); let handle; for (let attempt = 0; attempt < 100; attempt++) { try { handle = await open(this.lockPath, "wx"); break; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; await sleep(10); } } if (!handle) throw new Error("Could not acquire Project Profile write lock"); try { return await fn(); } finally { await handle.close(); await unlink(this.lockPath).catch(() => undefined); } }
}

function applyPatch(project: ProjectProfile, patch: ProjectUpdatePatch): void {
  for (const key of ["name", "description", "goal", "status", "tags", "constraints", "milestones", "tasks", "decisions", "risks"] as const) if (patch[key] !== undefined) project[key] = patch[key] as never;
  project.tags = unique(project.tags); project.constraints = unique(project.constraints);
}
function unique(values: string[]): string[] { return [...new Set(values.map((value) => value.trim()).filter(Boolean))]; }
