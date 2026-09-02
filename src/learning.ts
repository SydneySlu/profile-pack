import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProfileObservation, TraitCandidate, TraitConflict } from "./types.js";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class LearningEngine {
  readonly rootDir: string;
  private readonly observationsPath: string;
  private readonly candidatesPath: string;
  private readonly conflictsPath: string;
  private readonly lockPath: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.observationsPath = join(rootDir, "observations.jsonl");
    this.candidatesPath = join(rootDir, "candidates.json");
    this.conflictsPath = join(rootDir, "conflicts.json");
    this.lockPath = join(rootDir, ".learning.lock");
  }

  async ensure(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    if (!(await this.exists(this.observationsPath))) await writeFile(this.observationsPath, "", "utf8");
    if (!(await this.exists(this.candidatesPath))) await this.writeJson(this.candidatesPath, []);
    if (!(await this.exists(this.conflictsPath))) await this.writeJson(this.conflictsPath, []);
  }

  async observe(input: Omit<ProfileObservation, "observationId" | "createdAt">): Promise<{ observation: ProfileObservation; candidates: TraitCandidate[]; conflicts: TraitConflict[] }> {
    return this.withLock(async () => {
      const observation: ProfileObservation = { ...input, observationId: randomUUID(), confidence: clamp(input.confidence), createdAt: new Date().toISOString() };
      await writeFile(this.observationsPath, `${JSON.stringify(observation)}\n`, { encoding: "utf8", flag: "a" });
      const candidates = await this.readCandidates();
      const key = `${observation.scope}|${observation.dimension}|${normalize(observation.value)}`;
      let candidate = candidates.find((item) => `${item.scope}|${item.dimension}|${normalize(item.value)}` === key && item.status !== "dismissed");
      if (!candidate) {
        candidate = { candidateId: randomUUID(), scope: observation.scope, dimension: observation.dimension, value: observation.value, statement: observation.statement, confidence: observation.confidence, evidenceCount: 0, sourceAgents: [], observationIds: [], status: "candidate", updatedAt: observation.createdAt };
        candidates.push(candidate);
      }
      candidate.evidenceCount += 1;
      candidate.confidence = aggregateConfidence(candidate.confidence, observation.confidence, candidate.evidenceCount);
      if (!candidate.sourceAgents.includes(observation.agentId)) candidate.sourceAgents.push(observation.agentId);
      candidate.observationIds.push(observation.observationId);
      candidate.updatedAt = observation.createdAt;
      await this.writeJson(this.candidatesPath, candidates);
      const conflicts = await this.rebuildConflicts(candidates);
      return { observation, candidates, conflicts };
    });
  }

  async listCandidates(): Promise<TraitCandidate[]> { await this.ensure(); return this.readCandidates(); }
  async listPromotableCandidates(minEvidence = 2, minConfidence = 0.7): Promise<TraitCandidate[]> { return (await this.listCandidates()).filter((candidate) => candidate.status === "candidate" && candidate.evidenceCount >= minEvidence && candidate.confidence >= minConfidence); }
  async getCandidate(candidateId: string): Promise<TraitCandidate> {
    const candidate = (await this.readCandidates()).find((item) => item.candidateId === candidateId);
    if (!candidate) throw new Error(`Candidate not found: ${candidateId}`);
    return candidate;
  }

  async markPromoted(candidateId: string): Promise<TraitCandidate> {
    return this.withLock(async () => {
      const candidates = await this.readCandidates();
      const candidate = candidates.find((item) => item.candidateId === candidateId);
      if (!candidate) throw new Error(`Candidate not found: ${candidateId}`);
      candidate.status = "promoted";
      candidate.updatedAt = new Date().toISOString();
      await this.writeJson(this.candidatesPath, candidates);
      return candidate;
    });
  }

  async dismissCandidate(candidateId: string): Promise<TraitCandidate> {
    return this.withLock(async () => {
      const candidates = await this.readCandidates();
      const candidate = candidates.find((item) => item.candidateId === candidateId);
      if (!candidate) throw new Error(`Candidate not found: ${candidateId}`);
      candidate.status = "dismissed";
      candidate.updatedAt = new Date().toISOString();
      await this.writeJson(this.candidatesPath, candidates);
      return candidate;
    });
  }
  async listConflicts(): Promise<TraitConflict[]> { await this.ensure(); return this.readConflicts(); }

  async resolveConflict(conflictId: string, resolution: TraitConflict["resolution"]): Promise<TraitConflict> {
    return this.withLock(async () => {
      const conflicts = await this.readConflicts();
      const conflict = conflicts.find((item) => item.conflictId === conflictId);
      if (!conflict) throw new Error(`Conflict not found: ${conflictId}`);
      conflict.status = resolution === "dismiss" ? "dismissed" : "resolved";
      conflict.resolution = resolution;
      conflict.updatedAt = new Date().toISOString();
      await this.writeJson(this.conflictsPath, conflicts);
      return conflict;
    });
  }

  private async rebuildConflicts(candidates: TraitCandidate[]): Promise<TraitConflict[]> {
    const conflicts = await this.readConflicts();
    const active = conflicts.filter((conflict) => conflict.status !== "dismissed");
    const groups = new Map<string, TraitCandidate[]>();
    for (const candidate of candidates.filter((item) => item.status === "candidate")) {
      const key = `${candidate.scope}|${candidate.dimension}`;
      groups.set(key, [...(groups.get(key) ?? []), candidate]);
    }
    for (const [key, group] of groups) {
      const distinct = group.filter((candidate) => candidate.evidenceCount > 0);
      if (distinct.length < 2) continue;
      const [scope, dimension] = key.split("|");
      const ids = distinct.map((candidate) => candidate.candidateId).sort();
      const existing = active.find((conflict) => conflict.scope === scope && conflict.dimension === dimension && sameIds(conflict.candidateIds, ids));
      if (!existing) active.push({ conflictId: randomUUID(), scope, dimension, candidateIds: ids, reason: "同一场景和维度出现了不同用户倾向，需要用户判断是冲突还是情境差异。", status: "open", updatedAt: new Date().toISOString() });
    }
    await this.writeJson(this.conflictsPath, active);
    return active;
  }

  private async readCandidates(): Promise<TraitCandidate[]> { return JSON.parse(await readFile(this.candidatesPath, "utf8")) as TraitCandidate[]; }
  private async readConflicts(): Promise<TraitConflict[]> { return JSON.parse(await readFile(this.conflictsPath, "utf8")) as TraitConflict[]; }
  private async exists(path: string): Promise<boolean> { try { await readFile(path); return true; } catch { return false; } }
  private async writeJson(path: string, value: unknown): Promise<void> { const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`; await writeFile(tmp, JSON.stringify(value, null, 2), "utf8"); await rename(tmp, path); }
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensure();
    let handle;
    for (let attempt = 0; attempt < 100; attempt++) { try { handle = await open(this.lockPath, "wx"); break; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; await wait(10); } }
    if (!handle) throw new Error("Could not acquire learning write lock");
    try { return await fn(); } finally { await handle.close(); await unlink(this.lockPath).catch(() => undefined); }
  }
}

function normalize(value: string): string { return value.trim().toLocaleLowerCase(); }
function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }
function aggregateConfidence(previous: number, incoming: number, count: number): number { return clamp(previous + (incoming - previous) / count); }
function sameIds(a: string[], b: string[]): boolean { return a.length === b.length && a.every((value, index) => value === b[index]); }
