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
  type: "profile_initialized" | "profile_imported" | "profile_update_proposed" | "profile_update_confirmed" | "profile_update_rejected";
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
