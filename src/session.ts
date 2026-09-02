import { randomUUID } from "node:crypto";
import type { LearningEngine } from "./learning.js";
import type { ExtractedObservation } from "./extractor.js";
import { observationsToInput } from "./extractor.js";
import { filterAutomaticObservations } from "./safety.js";

export interface SessionExtractor {
  extract(transcript: string, defaultScope: string): Promise<ExtractedObservation[]>;
}

export interface ProfileSession {
  sessionId: string;
  agentId: string;
  scope: string;
  purpose?: string;
  startedAt: string;
}

export class SessionManager {
  constructor(private readonly learning: LearningEngine, private readonly extractor: SessionExtractor) {}

  start(agentId: string, scope: string, purpose?: string): ProfileSession {
    return { sessionId: randomUUID(), agentId, scope, purpose, startedAt: new Date().toISOString() };
  }

  async end(session: ProfileSession, transcript: string): Promise<{ sessionId: string; extractedCount: number; blockedCount: number; results: unknown[]; blocked: unknown[]; endedAt: string }> {
    const extracted = await this.extractor.extract(transcript, session.scope);
    const filtered = filterAutomaticObservations(extracted);
    const results = [];
    for (const observation of filtered.accepted) results.push(await this.learning.observe({ ...observationsToInput(observation, session.agentId), purpose: session.purpose, portability: "unknown" }));
    return { sessionId: session.sessionId, extractedCount: filtered.accepted.length, blockedCount: filtered.blocked.length, blocked: filtered.blocked, results, endedAt: new Date().toISOString() };
  }
}
