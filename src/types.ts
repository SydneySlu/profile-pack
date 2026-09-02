export type ProfileScope = "global" | string;
export type ProfileItemKind = "fact" | "preference" | "goal" | "constraint" | "boundary" | "trait";
export type Sensitivity = "normal" | "sensitive" | "high";
export type ProposalStatus = "proposed" | "confirmed" | "rejected";

export interface ProfileItem {
  id: string;
  kind: ProfileItemKind;
  scope: ProfileScope;
  statement: string;
  sensitivity: Sensitivity;
  confidence: number;
  evidenceCount: number;
  sourceAgents: string[];
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export interface PresentationPolicy {
  mode: "implicit_personalization" | "explicit";
  avoid: string[];
  prefer: string[];
}

export interface ProfilePack {
  schemaVersion: "0.1";
  profileId: string;
  version: number;
  initialized: boolean;
  createdAt: string;
  updatedAt: string;
  items: ProfileItem[];
  presentationPolicy: PresentationPolicy;
}

export interface ProfileUpdate {
  kind: ProfileItemKind;
  scope: ProfileScope;
  statement: string;
  sensitivity?: Sensitivity;
  confidence?: number;
  evidenceCount?: number;
  expiresAt?: string;
}

export interface ProfileEvent {
  eventId: string;
  type: "profile_initialized" | "profile_imported" | "profile_rolled_back" | "profile_update_proposed" | "profile_update_confirmed" | "profile_update_rejected";
  agentId: string;
  createdAt: string;
  payload: Record<string, unknown>;
}

export interface Proposal {
  id: string;
  update: ProfileUpdate;
  agentId: string;
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
  evidence?: string[];
}

export interface ProfileStatus {
  state: "empty" | "ready";
  profileId: string;
  itemCount: number;
  pendingProposalCount: number;
  nextAction: "onboarding_required" | "none";
}

export interface AuditEntry {
  timestamp: string;
  agentId: string;
  action: string;
  scopes: string[];
  purpose?: string;
}

export interface AgentPolicy {
  agentId: string;
  allowedScopes: string[];
  allowSensitive: boolean;
  /** Explicit per-item grants for sensitive fields. `allowSensitive` remains the broad opt-in. */
  sensitiveItemIds?: string[];
  token?: string;
}

export interface ProfileObservation {
  observationId: string;
  agentId: string;
  scope: string;
  dimension: string;
  value: string;
  statement: string;
  confidence: number;
  evidence?: string;
  createdAt: string;
}

export interface TraitCandidate {
  candidateId: string;
  scope: string;
  dimension: string;
  value: string;
  statement: string;
  confidence: number;
  evidenceCount: number;
  sourceAgents: string[];
  observationIds: string[];
  status: "candidate" | "promoted" | "dismissed";
  updatedAt: string;
}

export interface TraitConflict {
  conflictId: string;
  scope: string;
  dimension: string;
  candidateIds: string[];
  reason: string;
  status: "open" | "resolved" | "dismissed";
  resolution?: "keep_left" | "keep_right" | "keep_both" | "dismiss";
  classification?: "contradiction" | "contextual_variation" | "unknown";
  updatedAt: string;
}

export interface TraitCandidateSummary {
  candidate: TraitCandidate;
  effectiveConfidence: number;
  ageDays: number;
  promotable: boolean;
}
