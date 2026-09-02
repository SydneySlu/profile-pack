import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { ProfileStore } from "./store.js";
import { LearningEngine } from "./learning.js";

const rootDir = process.env.PROFILE_PACK_DIR ?? join(homedir(), ".profile-pack");
const host = process.env.PROFILE_PACK_WEB_HOST ?? "127.0.0.1";
const port = Number(process.env.PROFILE_PACK_WEB_PORT ?? 8787);
const store = new ProfileStore(rootDir);
const learning = new LearningEngine(rootDir);

const html = String.raw`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI Me · Profile Pack</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:1000px;margin:32px auto;padding:0 20px;color:#202124}h1{margin-bottom:4px}.muted{color:#666}section{margin:24px 0}pre{background:#f6f8fa;padding:16px;border-radius:8px;overflow:auto;white-space:pre-wrap}.row{display:flex;gap:8px;align-items:center;margin:8px 0;flex-wrap:wrap}button{border:1px solid #bbb;background:#fff;border-radius:5px;padding:6px 10px;cursor:pointer}.card{border:1px solid #ddd;border-radius:8px;padding:12px;margin:8px 0}.danger{color:#9c0006}</style>
</head><body>
<h1>AI Me · Profile Pack</h1><div class="muted">本地管理界面（默认只绑定 127.0.0.1，不展示敏感字段）</div>
<section><h2>状态</h2><pre id="status">加载中…</pre></section>
<section><h2>正式画像</h2><pre id="profile">加载中…</pre></section>
<section><h2>版本与差异</h2><div id="versions">加载中…</div><div class="row"><label>从 <select id="fromVersion"></select></label><label>到 <select id="toVersion"></select></label><button onclick="compareVersions()">查看差异</button><button onclick="rollbackVersion()">回滚到指定版本</button></div><pre id="diff">请选择两个版本查看差异</pre></section>
<section><h2>Agent 敏感字段授权</h2><div class="muted">逐项授权只允许选中的 Agent 读取对应敏感字段；默认仍然全部隐藏。</div><div id="agents">加载中…</div></section>
<section><h2>候选特质</h2><div id="candidates">加载中…</div></section>
<section><h2>待确认 Proposal</h2><div id="proposals">加载中…</div></section>
<section><h2>冲突</h2><div id="conflicts">加载中…</div></section>
<script>
const esc = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
async function api(path, options) { const response = await fetch(path, options); if (!response.ok) throw new Error(await response.text()); return response.json(); }
async function act(path, payload) { await api(path, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload) }); await load(); }
async function rollbackVersion() { const version = prompt('请输入要恢复的版本号'); if (version) await act('/api/versions/rollback', { version:Number(version) }); }
async function compareVersions() { const from=Number(document.querySelector('#fromVersion').value), to=Number(document.querySelector('#toVersion').value); if (from && to) document.querySelector('#diff').textContent=JSON.stringify(await api('/api/versions/compare?from='+from+'&to='+to), null, 2); }
async function grant(agentId) { const ids=[...document.querySelectorAll('input[data-agent="'+agentId+'"]:checked')].map((input)=>input.value); await act('/api/agents/'+encodeURIComponent(agentId)+'/sensitive', { itemIds:ids }); }
async function load() {
  try {
    document.querySelector('#status').textContent=JSON.stringify(await api('/api/status'), null, 2);
    const profile=await api('/api/profile'); document.querySelector('#profile').textContent=JSON.stringify(profile, null, 2);
    const versions=await api('/api/versions'); document.querySelector('#versions').innerHTML=versions.map((v)=>'<span class="card">v'+v.version+' · '+esc(v.updatedAt)+'</span>').join('')||'暂无版本';
    for (const id of ['fromVersion','toVersion']) document.querySelector('#'+id).innerHTML=versions.map((v)=>'<option value="'+v.version+'">v'+v.version+'</option>').join('');
    const agents=await api('/api/agents'); const sensitive=(profile.items||[]).filter((item)=>item.sensitivity!=='normal');
    document.querySelector('#agents').innerHTML=agents.map((agent)=>'<div class="card"><b>'+esc(agent.agentId)+'</b><div>'+(sensitive.length?sensitive.map((item)=>'<label><input type="checkbox" data-agent="'+esc(agent.agentId)+'" value="'+esc(item.id)+'" '+((agent.sensitiveItemIds||[]).includes(item.id)?'checked':'')+'>'+esc(item.statement)+'</label><br>').join(''):'暂无敏感字段')+'</div><button onclick="grant(\''+esc(agent.agentId)+'\')">保存授权</button></div>').join('')||'暂无 Agent';
    const candidates=await api('/api/candidates'); document.querySelector('#candidates').innerHTML=candidates.map((item)=>{const c=item.candidate; const promote=item.promotable?'<button onclick="act(\'/api/candidates/'+c.candidateId+'/promote\',{})">生成 Proposal</button>':''; return '<div class="card"><b>'+esc(c.statement)+'</b><div class="muted">'+esc(c.scope)+'/'+esc(c.dimension)+' · '+esc(c.portability||'unknown')+' · confidence '+item.effectiveConfidence.toFixed(2)+' · evidence '+c.evidenceCount+'</div>'+promote+' <button onclick="act(\'/api/candidates/'+c.candidateId+'/dismiss\',{})">忽略</button></div>';}).join('')||'暂无候选';
    const proposals=await api('/api/proposals'); document.querySelector('#proposals').innerHTML=proposals.map((item)=>'<div class="card"><b>'+esc(item.update.statement)+'</b><div class="muted">'+esc(item.update.scope)+' · 来自 '+esc(item.agentId)+'</div><button onclick="act(\'/api/proposals/'+item.id+'/decision\',{decision:\'confirm\'})">确认</button> <button onclick="act(\'/api/proposals/'+item.id+'/decision\',{decision:\'reject\'})">拒绝</button></div>').join('')||'暂无待确认 Proposal';
    const conflicts=await api('/api/conflicts'); document.querySelector('#conflicts').innerHTML=conflicts.map((item)=>'<div class="card"><b>'+esc(item.scope)+'/'+esc(item.dimension)+'</b><pre>'+esc(JSON.stringify(item,null,2))+'</pre><button onclick="act(\'/api/conflicts/'+item.conflictId+'/resolve\',{resolution:\'keep_both\'})">保留两者</button> <button onclick="act(\'/api/conflicts/'+item.conflictId+'/resolve\',{resolution:\'dismiss\'})">忽略</button></div>').join('')||'暂无冲突';
  } catch (error) { document.body.insertAdjacentHTML('beforeend','<p class="muted danger">加载失败：'+esc(error.message)+'</p>'); }
}
load();
</script></body></html>`;

async function body(req: AsyncIterable<Buffer>): Promise<Record<string, unknown>> { const chunks: Buffer[]=[]; for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk)); return chunks.length?JSON.parse(Buffer.concat(chunks).toString("utf8")):{}; }
function sendJson(res: ServerResponse, value: unknown, status=200): void { res.writeHead(status,{"content-type":"application/json; charset=utf-8"}); res.end(JSON.stringify(value)); }

await store.ensure(); await learning.ensure();
const server=createServer(async (req: IncomingMessage,res: ServerResponse)=>{ try {
  const url=new URL(req.url??"/",`http://${host}:${port}`); const path=url.pathname;
  if(req.method==="GET"&&path==="/"){res.writeHead(200,{"content-type":"text/html; charset=utf-8"});res.end(html);return;}
  if(req.method==="GET"&&path==="/api/status"){sendJson(res,await store.status());return;}
  if(req.method==="GET"&&path==="/api/profile"){sendJson(res,(await store.getView(["global","*"],"user","web_ui")).profile);return;}
  if(req.method==="GET"&&path==="/api/candidates"){sendJson(res,await learning.listCandidateSummaries());return;}
  if(req.method==="GET"&&path==="/api/conflicts"){sendJson(res,await learning.listConflicts());return;}
  if(req.method==="GET"&&path==="/api/proposals"){sendJson(res,await store.listProposals());return;}
  if(req.method==="GET"&&path==="/api/versions"){sendJson(res,await store.listVersions());return;}
  if(req.method==="GET"&&path==="/api/versions/compare"){sendJson(res,await store.compareVersions(Number(url.searchParams.get("from")),Number(url.searchParams.get("to"))));return;}
  if(req.method==="GET"&&path==="/api/agents"){sendJson(res,await store.listAgentPolicies());return;}
  const segments=path.split("/").filter(Boolean);
  if(req.method==="POST"&&segments[1]==="proposals"&&segments[3]==="decision"){const p=await body(req);sendJson(res,await store.decideProposal(segments[2]!,p.decision as "confirm"|"reject"));return;}
  if(req.method==="POST"&&segments[1]==="candidates"&&segments[3]==="dismiss"){sendJson(res,await learning.dismissCandidate(segments[2]!));return;}
  if(req.method==="POST"&&segments[1]==="candidates"&&segments[3]==="promote"){const candidate=await learning.getCandidate(segments[2]!);if(candidate.evidenceCount<2||candidate.confidence<0.7){sendJson(res,{error:"Candidate does not meet promotion threshold"},422);return;}const proposal=await store.propose({kind:"trait",scope:candidate.scope,statement:candidate.statement,confidence:candidate.confidence,evidenceCount:candidate.evidenceCount},"learning",candidate.observationIds);await learning.markPromoted(candidate.candidateId);sendJson(res,{candidate,proposal});return;}
  if(req.method==="POST"&&segments[1]==="conflicts"&&segments[3]==="resolve"){const p=await body(req);sendJson(res,await learning.resolveConflict(segments[2]!,p.resolution as "keep_left"|"keep_right"|"keep_both"|"dismiss"));return;}
  if(req.method==="POST"&&segments[1]==="versions"&&segments[2]==="rollback"){const p=await body(req);sendJson(res,await store.rollback(Number(p.version)));return;}
  if(req.method==="POST"&&segments[1]==="agents"&&segments[3]==="sensitive"){const p=await body(req);sendJson(res,await store.setAgentSensitiveItems(decodeURIComponent(segments[2]!),Array.isArray(p.itemIds)?p.itemIds as string[]:[]));return;}
  sendJson(res,{error:"Not found"},404);
} catch(error){sendJson(res,{error:error instanceof Error?error.message:String(error)},500);} });
server.listen(port,host,()=>console.error(`Profile Pack web UI listening on http://${host}:${port}`));
