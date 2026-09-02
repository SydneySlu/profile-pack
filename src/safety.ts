import type { ExtractedObservation } from "./extractor.js";

// Automatic learning must not infer sensitive or high-impact identity attributes.
const UNSAFE_TERMS = [
  "mbti", "intj", "intp", "entj", "entp", "infj", "infp", "enfj", "enfp", "istj", "istp", "estj", "estp", "isfj", "isfp", "esfj", "esfp", "人格障碍", "精神疾病", "抑郁", "焦虑症", "健康", "疾病", "病史", "诊断",
  "政治", "政党", "宗教", "信仰", "民族", "种族", "国籍", "籍贯", "性取向", "性别认同",
  "收入", "债务", "财务状况", "犯罪", "违法", "怀孕", "药物", "medical", "political", "religion",
  "race", "ethnicity", "nationality", "sexual orientation", "diagnosis"
];

export interface SafetyFilterResult {
  accepted: ExtractedObservation[];
  blocked: Array<{ observation: ExtractedObservation; reason: string }>;
}

export function filterAutomaticObservations(observations: ExtractedObservation[]): SafetyFilterResult {
  const accepted: ExtractedObservation[] = [];
  const blocked: Array<{ observation: ExtractedObservation; reason: string }> = [];
  for (const observation of observations) {
    const haystack = `${observation.dimension} ${observation.value} ${observation.statement}`.toLocaleLowerCase();
    const term = UNSAFE_TERMS.find((candidate) => haystack.includes(candidate.toLocaleLowerCase()));
    if (term) blocked.push({ observation, reason: `自动学习禁止推断敏感或高风险属性：${term}` });
    else accepted.push(observation);
  }
  return { accepted, blocked };
}
