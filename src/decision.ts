import type { DecisionContextEvidence, DecisionContextResult, DecisionRequest, ProfileItem, ProfilePack } from "./types.js";

/**
 * Conservative, dependency-free relevance gate for decision requests.
 * It is intentionally deterministic: an LLM is not required to decide which
 * Profile fields are relevant or to grant access to sensitive fields.
 */
export function retrieveDecisionContext(profile: ProfilePack, items: ProfileItem[], request: DecisionRequest): DecisionContextResult {
  const query = [request.goal, request.taskContext ?? "", ...(request.constraints ?? []), request.taskType ?? "", request.outputType ?? ""].join(" ");
  const queryTerms = terms(query);
  const evidence = items.map((item) => scoreItem(item, queryTerms, request)).filter((item): item is DecisionContextEvidence => item !== undefined).sort((left, right) => right.relevanceScore - left.relevanceScore);
  const missingInformation = missingFor(request, evidence);
  const personalized = evidence.length > 0;
  const { token: _token, ...safeRequest } = request;
  return {
    personalized,
    message: personalized ? "已找到与当前决策相关的 Profile 证据；建议仅将这些证据用于个性化，不要读取完整 Profile。" : "未找到足够相关的 Profile 信息；当前建议应标注为通用建议，并先确认缺失条件。",
    request: safeRequest,
    profileVersion: profile.version,
    evidence,
    missingInformation
  };
}

function scoreItem(item: ProfileItem, queryTerms: Set<string>, request: DecisionRequest): DecisionContextEvidence | undefined {
  if (item.expiresAt && new Date(item.expiresAt).getTime() < Date.now()) return undefined;
  const itemTerms = terms(item.statement);
  const matchedTerms = [...itemTerms].filter((term) => queryTerms.has(term));
  let score = matchedTerms.length ? Math.min(0.85, 0.3 + matchedTerms.length * 0.16) : 0;
  const isGlobal = item.scope === "global";
  const scopeMatch = !request.scopes?.length || request.scopes.includes(item.scope) || (isGlobal && request.scopes.includes("global"));
  if (!scopeMatch) return undefined;
  if (isGlobal && ["preference", "constraint", "boundary", "goal"].includes(item.kind)) score += 0.18;
  if (request.taskType && item.scope === request.taskType) score += 0.2;
  score *= Math.max(0.5, item.confidence);
  if (score < 0.2) return undefined;
  const reason = matchedTerms.length ? `与任务关键词匹配：${matchedTerms.join("、")}` : "属于用户确认的全局偏好或边界，作为背景参考";
  return { item, relevanceScore: Number(Math.min(1, score).toFixed(3)), matchedTerms, reason };
}

function missingFor(request: DecisionRequest, evidence: DecisionContextEvidence[]): string[] {
  const missing: string[] = [];
  if (!request.constraints?.length) missing.push("尚未提供明确的约束条件（时间、预算、技术栈或资源限制）");
  if (!evidence.some((entry) => entry.item.kind === "goal")) missing.push("未找到与该决策直接相关的长期目标");
  if (!evidence.length) missing.push("没有找到足够相关的用户背景，不能声称这是个性化建议");
  return missing;
}

function terms(value: string): Set<string> {
  const normalized = value.toLocaleLowerCase();
  const result = new Set<string>();
  for (const token of normalized.match(/[a-z0-9][a-z0-9+#.-]{1,}|[\u4e00-\u9fff]{2,}/g) ?? []) {
    result.add(token);
    if (/^[\u4e00-\u9fff]+$/.test(token)) for (let index = 0; index < token.length - 1; index++) result.add(token.slice(index, index + 2));
  }
  return result;
}
