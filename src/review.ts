import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { LearningEngine } from "./learning.js";
import type { ProfileStore } from "./store.js";

export async function runReview(store: ProfileStore, learning: LearningEngine): Promise<void> {
  const rl = createInterface({ input, output });
  try {
    console.log("\nProfile Pack 审核\n命令：p <candidateId> 提升候选，d <candidateId> 忽略候选，c <conflictId> dismiss 冲突，q 退出\n");
    while (true) {
      const snapshot = await learning.listCandidateSummaries();
      console.log(snapshot.filter((item) => item.candidate.status === "candidate").map((item) => `${item.candidate.candidateId} | ${item.candidate.scope}/${item.candidate.dimension} | ${item.candidate.statement} | confidence=${item.effectiveConfidence.toFixed(2)} | evidence=${item.candidate.evidenceCount} | ${item.promotable ? "可提升" : "继续观察"}`).join("\n") || "暂无候选");
      const command = (await rl.question("\nreview> ")).trim();
      if (command === "q" || command === "quit") break;
      const [action, id] = command.split(/\s+/, 2);
      if (!id) continue;
      if (action === "d") { await learning.dismissCandidate(id); continue; }
      if (action === "c") { await learning.resolveConflict(id, "dismiss"); continue; }
      if (action === "p") {
        const candidate = await learning.getCandidate(id);
        if (candidate.status !== "candidate" || candidate.evidenceCount < 2 || candidate.confidence < 0.7) { console.log("候选尚未达到默认提升阈值。\n"); continue; }
        const proposal = await store.propose({ kind: "trait", scope: candidate.scope, statement: candidate.statement, confidence: candidate.confidence, evidenceCount: candidate.evidenceCount }, "learning", candidate.observationIds);
        await learning.markPromoted(id);
        console.log(`已生成待用户确认的 Profile Proposal：${proposal.id}\n`);
      }
    }
  } finally { rl.close(); }
}
