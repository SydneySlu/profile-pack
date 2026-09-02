import type { ProfileItem, ProfilePack } from "./types.js";

export interface EvalFinding {
  rule: "explicit_profile_reference" | "single_attribute_attribution" | "sensitive_leakage" | "holistic_review";
  severity: "error" | "warning" | "pass";
  message: string;
  matches?: string[];
}

export interface EvalResult {
  passed: boolean;
  score: number;
  findings: EvalFinding[];
}

export function evaluateResponse(response: string, profile: ProfilePack, visibleItems: ProfileItem[]): EvalResult {
  const findings: EvalFinding[] = [];
  const explicit = response.match(/作为一个[^，。！？]{0,20}(?:你|用户|INTJ|INTP|ENTJ|ENTP)|因为你是[^，。！？]{0,20}|根据你的[^，。！？]{0,20}|你的(?:MBTI|人格类型|籍贯|国籍)|\b(?:INTJ|INTP|ENTJ|ENTP|INFJ|INFP|ENFJ|ENFP|ISTJ|ISTP|ESTJ|ESTP|ISFJ|ISFP|ESFJ|ESFP)\b/gi) ?? [];
  findings.push(explicit.length ? { rule: "explicit_profile_reference", severity: "error", message: "回答显式点名了画像标签或画像字段。", matches: explicit } : { rule: "explicit_profile_reference", severity: "pass", message: "未发现生硬点名画像字段。" });
  const attribution = response.match(/(?:因为你|作为一个|既然你是)[^。！？\n]{0,60}(?:所以|因此)/g) ?? [];
  findings.push(attribution.length ? { rule: "single_attribute_attribution", severity: "warning", message: "回答可能用单个用户属性解释了结论。", matches: attribution } : { rule: "single_attribute_attribution", severity: "pass", message: "未发现明显的单属性归因。" });
  const sensitiveMatches = profile.items.filter((item) => item.sensitivity !== "normal" && item.statement.length >= 2 && response.includes(item.statement)).map((item) => item.statement);
  findings.push(sensitiveMatches.length ? { rule: "sensitive_leakage", severity: "error", message: "回答包含了不应默认暴露的敏感画像内容。", matches: sensitiveMatches } : { rule: "sensitive_leakage", severity: "pass", message: "未发现敏感画像泄露。" });
  findings.push(visibleItems.length >= 2 ? { rule: "holistic_review", severity: "warning", message: "建议人工确认回答是否综合了多个相关画像维度，而不是只使用一个字段。" } : { rule: "holistic_review", severity: "pass", message: "当前可见画像较少，跳过综合性判断。" });
  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.filter((finding) => finding.severity === "warning").length;
  return { passed: errors === 0, score: Math.max(0, 1 - errors * 0.5 - warnings * 0.1), findings };
}
