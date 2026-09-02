import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { ProfileStore } from "./store.js";
import { LearningEngine } from "./learning.js";

const rootDir = process.env.PROFILE_PACK_DIR ?? join(homedir(), ".profile-pack");
const host = process.env.PROFILE_PACK_WEB_HOST ?? "127.0.0.1";
const port = Number(process.env.PROFILE_PACK_WEB_PORT ?? 8787);
const store = new ProfileStore(rootDir);
const learning = new LearningEngine(rootDir);

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Me · Profile Pack</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:1000px;margin:32px auto;padding:0 20px;color:#202124}h1{margin-bottom:4px}.muted{color:#666}section{margin:24px 0}pre{background:#f6f8fa;padding:16px;border-radius:8px;overflow:auto;white-space:pre-wrap}.row{display:flex;gap:8px;align-items:center;margin:8px 0}button{border:1px solid #bbb;background:#fff;border-radius:5px;padding:6px 10px;cursor:pointer}button:hover{background:#f1f3f4}.card{border:1px solid #ddd;border-radius:8px;padding:12px;margin:8px 0}</style></head><body><h1>AI Me · Profile Pack</h1><div class="muted">本地管理界面（默认只绑定 127.0.0.1，不展示敏感字段）</div><section><h2>状态</h2><pre id="status">加载中…</pre></section><section><h2>正式画像</h2><pre id="profile">加载中…</pre></section><section><h2>候选特质</h2><div id="candidates">加载中…</div></section><section><h2>待确认 Proposal</h2><div id="proposals">加载中…</div></section><section><h2>冲突</h2><div id="conflicts">加载中…</div></section><script>
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path,options){const r=await fetch(path,options);if(!r.ok)throw new Error(await r.text());return r.json()}
async function act(path,body){await api(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});await load()}
async function load(){
 try{document.querySelector('#status').textContent=JSON.stringify(await api('/api/status'),null,2);document.querySelector('#profile').textContent=JSON.stringify(await api('/api/profile'),null,2);
 const c=await api('/api/candidates');document.querySelector('#candidates').innerHTML=c.map(x=>'<div class="card"><b>'+esc(x.candidate.statement)+'</b><div class="muted">'+esc(x.candidate.scope)+'/'+esc(x.candidate.dimension)+' · confidence '+x.effectiveConfidence.toFixed(2)+' · evidence '+x.candidate.evidenceCount+' · '+(x.promotable?'可提升':'继续观察')+'</div>'+(x.promotable?'<button onclick="act(\'/api/candidates/'+x.candidate.candidateId+'/promote\',{})">生成 Proposal</button>':'')+' <button onclick="act(\'/api/candidates/'+x.candidate.candidateId+'/dismiss\',{})">忽略</button></div>').join('')||'暂无候选';
 const p=await api('/api/proposals');document.querySelector('#proposals').innerHTML=p.map(x=>'<div class="card"><b>'+esc(x.update.statement)+'</b><div class="muted">'+esc(x.update.scope)+' · 来自 '+esc(x.agentId)+'</div><button onclick="act(\'/api/proposals/'+x.id+'/decision\',{decision:\'confirm\'})">确认</button> <button onclick="act(\'/api/proposals/'+x.id+'/decision\',{decision:\'reject\'})">拒绝</button></div>').join('')||'暂无待确认 Proposal';
 const f=await api('/api/conflicts');document.querySelector('#conflicts').innerHTML=f.map(x=>'<div class="card"><b>'+esc(x.scope)+'/'+esc(x.dimension)+'</b><pre>'+esc(JSON.stringify(x,null,2))+'</pre><button onclick="act(\'/api/conflicts/'+x.conflictId+'/resolve\',{resolution:\'keep_both\'})">保留两者</button> <button onclick="act(\'/api/conflicts/'+x.conflictId+'/resolve\',{resolution:\'dismiss\'})">忽略</button></div>').join('')||'暂无冲突';
 }catch(e){document.body.insertAdjacentHTML('beforeend','<p class="muted">加载失败：'+esc(e.message)+'</p>')}
} load();</script></body></html>`;

async function body(req: AsyncIterable<Buffer>): Promise<Record<string, unknown>> { const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}; }
function sendJson(res: import("node:http").ServerResponse, value: unknown, status = 200): void { res.writeHead(status, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(value)); }

await store.ensure();
await learning.ensure();
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url ?? "/", `http://${host}:${port}`).pathname;
    if (req.method === "GET" && path === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html); return; }
    if (req.method === "GET" && path === "/api/status") { sendJson(res, await store.status()); return; }
    if (req.method === "GET" && path === "/api/profile") { sendJson(res, (await store.getView(["global", "*"], "user", "web_ui")).profile); return; }
    if (req.method === "GET" && path === "/api/candidates") { sendJson(res, await learning.listCandidateSummaries()); return; }
    if (req.method === "GET" && path === "/api/conflicts") { sendJson(res, await learning.listConflicts()); return; }
    if (req.method === "GET" && path === "/api/proposals") { sendJson(res, await store.listProposals()); return; }
    const segments = path.split("/").filter(Boolean);
    if (req.method === "POST" && segments[0] === "api" && segments[1] === "proposals" && segments[3] === "decision") { const payload = await body(req); sendJson(res, await store.decideProposal(segments[2]!, payload.decision as "confirm" | "reject")); return; }
    if (req.method === "POST" && segments[0] === "api" && segments[1] === "candidates" && segments[3] === "dismiss") { sendJson(res, await learning.dismissCandidate(segments[2]!)); return; }
    if (req.method === "POST" && segments[0] === "api" && segments[1] === "candidates" && segments[3] === "promote") { const candidate = await learning.getCandidate(segments[2]!); if (candidate.evidenceCount < 2 || candidate.confidence < 0.7) { sendJson(res, { error: "Candidate does not meet promotion threshold" }, 422); return; } const proposal = await store.propose({ kind: "trait", scope: candidate.scope, statement: candidate.statement, confidence: candidate.confidence, evidenceCount: candidate.evidenceCount }, "learning", candidate.observationIds); await learning.markPromoted(candidate.candidateId); sendJson(res, { candidate, proposal }); return; }
    if (req.method === "POST" && segments[0] === "api" && segments[1] === "conflicts" && segments[3] === "resolve") { const payload = await body(req); sendJson(res, await learning.resolveConflict(segments[2]!, payload.resolution as "keep_left" | "keep_right" | "keep_both" | "dismiss")); return; }
    sendJson(res, { error: "Not found" }, 404);
  } catch (error) { sendJson(res, { error: error instanceof Error ? error.message : String(error) }, 500); }
});
server.listen(port, host, () => console.error(`Profile Pack web UI listening on http://${host}:${port}`));
