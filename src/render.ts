import type { ProfilePack, ProfileItem } from "./types.js";

/** Render a neutral context bundle for an Agent. This is output guidance, not a hidden reasoning instruction. */
export function renderContext(profile: ProfilePack, items: ProfileItem[]): string {
  const lines = [
    "USER CONTEXT (background only)",
    "Use this context to make responses more relevant. Do not mention profile labels or quote individual fields as the reason for an answer unless the user asks.",
    "Synthesize the relevant context naturally; if context is uncertain or irrelevant, do not use it.",
    "",
    items.length ? items.map((item) => `- ${item.statement}`).join("\n") : "No user context is available.",
    "",
    "PRESENTATION PREFERENCES",
    ...profile.presentationPolicy.prefer.map((item) => `- ${item}`),
    ...profile.presentationPolicy.avoid.map((item) => `- Avoid: ${item}`)
  ];
  return lines.join("\n");
}
