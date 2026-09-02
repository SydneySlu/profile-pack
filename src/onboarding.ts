import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { ProfileUpdate } from "./types.js";
import { ProfileStore } from "./store.js";

export async function runOnboarding(store: ProfileStore, agentId = "onboarding"): Promise<void> {
  const status = await store.status();
  if (status.state === "ready") {
    console.log("Profile Pack 已经初始化。如需修改，请使用 Agent 提交更新建议。\n");
    return;
  }
  const rl = createInterface({ input, output });
  const ask = async (question: string, optional = true): Promise<string> => {
    const answer = (await rl.question(`${question}${optional ? "（可跳过）" : ""}: `)).trim();
    return answer;
  };
  try {
    console.log("\nAI Me Profile Pack 初始化\n这些内容由你控制，敏感信息可以跳过，之后也可以修改。\n");
    const items: ProfileUpdate[] = [];
    const name = await ask("希望 AI 如何称呼你");
    if (name) items.push({ kind: "fact", scope: "global", statement: `称呼用户为 ${name}` });
    const role = await ask("你目前主要做什么");
    if (role) items.push({ kind: "fact", scope: "global", statement: `用户目前主要从事：${role}` });
    const style = await ask("你偏好的回答风格");
    if (style) items.push({ kind: "preference", scope: "global", statement: `用户偏好的回答风格：${style}` });
    const goal = await ask("你当前最重要的目标");
    if (goal) items.push({ kind: "goal", scope: "global", statement: `用户当前的重要目标：${goal}` });
    const boundary = await ask("有哪些事情你不希望 AI 默认做或默认提及");
    if (boundary) items.push({ kind: "boundary", scope: "global", statement: `用户边界：${boundary}` });
    const sensitive = await ask("是否现在添加一条敏感信息（例如健康、家庭或财务）？输入内容即可，直接回车跳过");
    if (sensitive) items.push({ kind: "fact", scope: "global", statement: sensitive, sensitivity: "high" });
    if (!items.length) throw new Error("至少需要填写一项基础信息才能初始化 Profile Pack");
    await store.initialize(items, agentId);
    console.log(`\n初始化完成，共保存 ${items.length} 项。敏感信息默认不会提供给 Agent。`);
  } finally {
    rl.close();
  }
}
