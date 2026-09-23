import type { DecisionCandidate, DecisionCandidateScore, DecisionContextResult, DecisionEvaluation } from "./types.js";

export interface DecisionEvaluator {
  readonly id: string;
  evaluate(context: DecisionContextResult, candidates: DecisionCandidate[]): DecisionEvaluation;
}

export class RuleEvaluator implements DecisionEvaluator {
  readonly id = "rule";

  evaluate(context: DecisionContextResult, candidates: DecisionCandidate[]): DecisionEvaluation {
    return evaluateCandidates(context, candidates);
  }
}

export function evaluateCandidates(context: DecisionContextResult, candidates: DecisionCandidate[]): DecisionEvaluation {
  if (candidates.length < 2 || candidates.length > 3) throw new Error("Decision evaluation requires 2-3 candidates");
  const scores = candidates.map((candidate) => scoreCandidate(context, candidate));
  const ranked = [...scores].sort((left, right) => right.scores.total - left.scores.total);
  const winner = ranked[0];
  const clearWinner = winner && (!ranked[1] || winner.scores.total - ranked[1].scores.total >= 0.05);
  const recommendation = clearWinner && winner.constraintConflicts.length === 0 ? winner : undefined;
  return {
    evaluator: "rule",
    recommendedCandidateId: recommendation?.candidateId,
    scores,
    missingInformation: [...context.missingInformation, ...missingCandidateData(candidates)],
    requiresUserConfirmation: true,
    message: recommendation
      ? `规则评估更倾向于“${candidates.find((candidate) => candidate.id === recommendation.candidateId)?.title ?? recommendation.candidateId}”，但仍需要用户确认。`
      : winner?.constraintConflicts.length
        ? "当前候选方案存在约束冲突，不能自动推荐；请先补充条件或修改方案。"
        : "候选方案的规则得分接近或证据不足，评估器不强行排序；请由用户比较关键取舍。"
  };
}

function scoreCandidate(context: DecisionContextResult, candidate: DecisionCandidate): DecisionCandidateScore {
  const text = [candidate.title, candidate.summary, ...candidate.steps, ...candidate.assumptions].join(" ").toLocaleLowerCase();
  const goalTerms = tokenize(context.request.goal);
  const matchedGoalTerms = [...goalTerms].filter((term) => text.includes(term));
  const relevance = clamp(0.4 + matchedGoalTerms.length * 0.12);
  const constraintConflicts = detectConflicts(context.request.constraints ?? [], candidate);
  const dayLimit = extractDayLimit(context.request.constraints ?? []);
  const feasibility = clamp(candidate.estimatedDays === undefined ? 0.5 : dayLimit === undefined ? 0.65 : candidate.estimatedDays <= dayLimit ? 0.95 : 0.25);
  const highRiskMatches = candidate.risks.join(" ").match(/高风险|严重|泄露|数据丢失|权限失控|远程暴露|不可逆/g) ?? [];
  const risk = clamp(0.85 - Math.min(0.6, highRiskMatches.length * 0.2));
  const profileFit = profileMatch(context, text);
  const total = Number((relevance * 0.3 + feasibility * 0.35 + risk * 0.15 + profileFit * 0.2 - constraintConflicts.length * 0.25).toFixed(3));
  const reasons = [`相关性 ${relevance.toFixed(2)}`, `可行性 ${feasibility.toFixed(2)}`, `风险分 ${risk.toFixed(2)}`, `Profile 匹配 ${profileFit.toFixed(2)}`];
  if (matchedGoalTerms.length) reasons.push(`覆盖目标词：${matchedGoalTerms.join("、")}`);
  if (constraintConflicts.length) reasons.push(`存在约束冲突：${constraintConflicts.join("；")}`);
  return { candidateId: candidate.id, scores: { relevance, feasibility, risk, profileFit, total }, constraintConflicts, matchedEvidenceIds: context.evidence.map((entry) => entry.item.id), reasons };
}

function profileMatch(context: DecisionContextResult, candidateText: string): number {
  if (!context.evidence.length) return 0.5;
  const evidenceMatches = context.evidence.filter((entry) => {
    const terms = tokenize(entry.item.statement).filter((term) => term.length > 2 && !["用户", "希望", "偏好", "当前"].includes(term));
    return terms.some((term) => candidateText.includes(term));
  }).length;
  return clamp(0.45 + Math.min(0.45, evidenceMatches * 0.12));
}

function detectConflicts(constraints: string[], candidate: DecisionCandidate): string[] {
  const conflicts: string[] = [];
  const limit = extractDayLimit(constraints);
  if (limit !== undefined && candidate.estimatedDays !== undefined && candidate.estimatedDays > limit) conflicts.push(`预计 ${candidate.estimatedDays} 天，超过 ${limit} 天限制`);
  return conflicts;
}

function extractDayLimit(constraints: string[]): number | undefined {
  for (const constraint of constraints) {
    const match = constraint.match(/(?:一|两|三|四|五|六|七|1|2|3|4|5|6|7)\s*(?:个)?\s*(?:礼拜|周|星期|天|日)/);
    if (match) {
      const digit = match[0].match(/[1-7]/)?.[0];
      if (digit) return Number(digit) === 1 && /一/.test(match[0]) ? 7 : Number(digit);
      if (/一/.test(match[0])) return 7;
    }
    const arabic = constraint.match(/(\d+)\s*(?:天|日)/);
    if (arabic) return Number(arabic[1]);
  }
  return undefined;
}

function missingCandidateData(candidates: DecisionCandidate[]): string[] {
  return candidates.some((candidate) => candidate.steps.length > 0 && candidate.risks.length > 0) ? [] : ["候选方案缺少完整步骤或风险说明"];
}

function tokenize(value: string): string[] { return value.toLocaleLowerCase().match(/[a-z0-9+#.-]{2,}|[\u4e00-\u9fff]{2,}/g) ?? []; }
function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }
