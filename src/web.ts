import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { ProfileStore } from "./store.js";
import { LearningEngine } from "./learning.js";
import { ProjectStore } from "./project-store.js";

const rootDir = process.env.PROFILE_PACK_DIR ?? join(homedir(), ".profile-pack");
const host = process.env.PROFILE_PACK_WEB_HOST ?? "127.0.0.1";
const port = Number(process.env.PROFILE_PACK_WEB_PORT ?? 8787);
const store = new ProfileStore(rootDir);
const learning = new LearningEngine(rootDir);
const projects = new ProjectStore(rootDir);

const html = String.raw`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI Me · Profile Pack</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:1000px;margin:32px auto;padding:0 20px;color:#202124}h1{margin-bottom:4px}.muted{color:#666}section{margin:24px 0}pre{background:#f6f8fa;padding:16px;border-radius:8px;overflow:auto;white-space:pre-wrap}.row{display:flex;gap:8px;align-items:center;margin:8px 0;flex-wrap:wrap}button{border:1px solid #bbb;background:#fff;border-radius:5px;padding:6px 10px;cursor:pointer}.card{border:1px solid #ddd;border-radius:8px;padding:12px;margin:8px 0}.danger{color:#9c0006}</style>
</head><body>
<h1>AI Me · Profile Pack</h1><div class="muted">本地管理界面（默认只绑定 127.0.0.1，不展示敏感字段）</div>
<section><h2>状态</h2><pre id="status">加载中…</pre></section>
<section><h2>正式画像</h2><pre id="profile">加载中…</pre></section>
<section><h2>迁移导出</h2><div class="muted">默认导出通用非敏感资料；完整导出会包含敏感字段，请确认后再下载。</div><div class="row"><button onclick="downloadBundle(false)">导出通用 Profile</button><button onclick="downloadBundle(true)">导出完整 Profile（含敏感）</button></div></section>
<section><h2>版本与差异</h2><div id="versions">加载中…</div><div class="row"><label>从 <select id="fromVersion"></select></label><label>到 <select id="toVersion"></select></label><button onclick="compareVersions()">查看差异</button><button onclick="rollbackVersion()">回滚到指定版本</button></div><pre id="diff">请选择两个版本查看差异</pre></section>
<section><h2>Agent 敏感字段授权</h2><div class="muted">逐项授权只允许选中的 Agent 读取对应敏感字段；默认仍然全部隐藏。</div><div id="agents">加载中…</div></section>
<section><h2>候选特质</h2><div id="candidates">加载中…</div></section>
<section><h2>待确认 Proposal</h2><div id="proposals">加载中…</div></section>
<section><h2>冲突</h2><div id="conflicts">加载中…</div></section>
<section><h2>项目 Profile</h2><div class="muted">项目资料独立于个人 Profile；Agent 只能读取授权项目，更新需要用户确认。</div><form id="createProjectForm" class="row"><input name="name" placeholder="项目名称" required><input name="goal" placeholder="项目目标" required><input name="description" placeholder="项目背景"><label><input type="checkbox" name="codex" checked> Codex</label><label><input type="checkbox" name="claude"> Claude Code</label><button type="submit">创建项目</button></form><div id="projects">加载中…</div><div id="projectUpdates"></div><pre id="projectDetail">请选择项目查看详情</pre></section>
<script>
const esc = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
async function api(path, options) { const response = await fetch(path, options); if (!response.ok) throw new Error(await response.text()); return response.json(); }
async function act(path, payload) { await api(path, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload) }); await load(); }
async function rollbackVersion() { const version = prompt('请输入要恢复的版本号'); if (version) await act('/api/versions/rollback', { version:Number(version) }); }
async function compareVersions() { const from=Number(document.querySelector('#fromVersion').value), to=Number(document.querySelector('#toVersion').value); if (from && to) document.querySelector('#diff').textContent=JSON.stringify(await api('/api/versions/compare?from='+from+'&to='+to), null, 2); }
async function grant(agentId) { const ids=[...document.querySelectorAll('input[data-agent="'+agentId+'"]:checked')].map((input)=>input.value); await act('/api/agents/'+encodeURIComponent(agentId)+'/sensitive', { itemIds:ids }); }
async function downloadBundle(includeSensitive) { if(includeSensitive&&!confirm('完整导出将包含敏感字段，确定继续吗？')) return; const bundle=await api('/api/export',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({includeSensitive})}); const blob=new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'}); const link=document.createElement('a'); link.href=URL.createObjectURL(blob); link.download='profile-pack-'+(includeSensitive?'full':'portable')+'.json'; link.click(); URL.revokeObjectURL(link.href); }
async function showProject(projectId) { const project=await api('/api/projects/'+encodeURIComponent(projectId)); const updates=await api('/api/projects/'+encodeURIComponent(projectId)+'/updates'); const decisions=await api('/api/projects/'+encodeURIComponent(projectId)+'/decisions'); const agents=['codex','claude-code']; const extra=project.allowedAgents.filter((agent)=>agent!=='user'&&!agents.includes(agent)); document.querySelector('#projectDetail').innerHTML='<pre>'+esc(JSON.stringify({project,decisions},null,2))+'</pre><div class="card"><b>项目 Agent 授权</b><div>'+agents.map((agent)=>'<label><input type="checkbox" id="project-agent-'+esc(agent)+'" '+(project.allowedAgents.includes(agent)?'checked':'')+'>'+esc(agent)+'</label> ').join('')+'<label>其他 Agent IDs <input id="project-extra-agents" value="'+esc(extra.join(', '))+'"></label> <button onclick="authorizeProject(\''+esc(projectId)+'\')">保存授权</button></div></div>'; document.querySelector('#projectUpdates').innerHTML=updates.map((item)=>'<div class="card"><b>待确认更新 · v'+esc(item.baseVersion)+'</b><pre>'+esc(JSON.stringify(item.patch,null,2))+'</pre><div>'+esc(item.reason||'未填写原因')+'</div><button onclick="decideProjectUpdate(\''+esc(projectId)+'\',\''+esc(item.proposalId)+'\',\'confirm\')">确认更新</button> <button onclick="decideProjectUpdate(\''+esc(projectId)+'\',\''+esc(item.proposalId)+'\',\'reject\')">拒绝</button></div>').join('')||'暂无待确认项目更新'; }
async function decideProjectUpdate(projectId,proposalId,decision) { await api('/api/projects/'+encodeURIComponent(projectId)+'/updates/decision',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({proposalId,decision})}); await showProject(projectId); }
async function authorizeProject(projectId) { const allowedAgents=['codex','claude-code'].filter((agent)=>document.querySelector('#project-agent-'+agent).checked); allowedAgents.push(...document.querySelector('#project-extra-agents').value.split(',').map((agent)=>agent.trim()).filter(Boolean)); await api('/api/projects/'+encodeURIComponent(projectId)+'/authorize',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({agentIds:allowedAgents})}); await showProject(projectId); }
document.querySelector('#createProjectForm').addEventListener('submit',async(event)=>{event.preventDefault();const form=new FormData(event.currentTarget);const allowedAgents=['user',...(form.get('codex')?['codex']:[]),...(form.get('claude')?['claude-code']:[])];await api('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:form.get('name'),goal:form.get('goal'),description:form.get('description'),allowedAgents})});event.currentTarget.reset();await load();});
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
    const projects=await api('/api/projects'); document.querySelector('#projects').innerHTML=projects.map((item)=>'<div class="card"><b>'+esc(item.name)+'</b><div class="muted">'+esc(item.status)+' · v'+esc(item.version)+' · '+esc(item.goal)+'</div><button onclick="showProject(\''+esc(item.projectId)+'\')">查看项目</button></div>').join('')||'暂无项目';
  } catch (error) { document.body.insertAdjacentHTML('beforeend','<p class="muted danger">加载失败：'+esc(error.message)+'</p>'); }
}
load();
</script></body></html>`;

async function body(req: AsyncIterable<Buffer>): Promise<Record<string, unknown>> { const chunks: Buffer[]=[]; for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk)); return chunks.length?JSON.parse(Buffer.concat(chunks).toString("utf8")):{}; }
function sendJson(res: ServerResponse, value: unknown, status=200): void { res.writeHead(status,{"content-type":"application/json; charset=utf-8"}); res.end(JSON.stringify(value)); }

await store.ensure(); await learning.ensure(); await projects.ensure();
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
  if(req.method==="GET"&&path==="/api/projects"){sendJson(res,await projects.list("user"));return;}
  if(req.method==="GET"&&/^\/api\/projects\/[^/]+$/.test(path)){const projectId=decodeURIComponent(path.split("/")[3]!);sendJson(res,await projects.get(projectId,"user"));return;}
  if(req.method==="GET"&&/^\/api\/projects\/[^/]+\/updates$/.test(path)){const projectId=decodeURIComponent(path.split("/")[3]!);sendJson(res,await projects.listProposals(projectId,"user"));return;}
  if(req.method==="GET"&&/^\/api\/projects\/[^/]+\/decisions$/.test(path)){const projectId=decodeURIComponent(path.split("/")[3]!);sendJson(res,await projects.listDecisions(projectId,"user"));return;}
  const segments=path.split("/").filter(Boolean);
  if(req.method==="POST"&&segments[1]==="proposals"&&segments[3]==="decision"){const p=await body(req);sendJson(res,await store.decideProposal(segments[2]!,p.decision as "confirm"|"reject"));return;}
  if(req.method==="POST"&&segments[1]==="candidates"&&segments[3]==="dismiss"){sendJson(res,await learning.dismissCandidate(segments[2]!));return;}
  if(req.method==="POST"&&segments[1]==="candidates"&&segments[3]==="promote"){const candidate=await learning.getCandidate(segments[2]!);if(candidate.evidenceCount<2||candidate.confidence<0.7){sendJson(res,{error:"Candidate does not meet promotion threshold"},422);return;}const proposal=await store.propose({kind:"trait",scope:candidate.scope,statement:candidate.statement,confidence:candidate.confidence,evidenceCount:candidate.evidenceCount},"learning",candidate.observationIds);await learning.markPromoted(candidate.candidateId);sendJson(res,{candidate,proposal});return;}
  if(req.method==="POST"&&segments[1]==="conflicts"&&segments[3]==="resolve"){const p=await body(req);sendJson(res,await learning.resolveConflict(segments[2]!,p.resolution as "keep_left"|"keep_right"|"keep_both"|"dismiss"));return;}
  if(req.method==="POST"&&segments[1]==="versions"&&segments[2]==="rollback"){const p=await body(req);sendJson(res,await store.rollback(Number(p.version)));return;}
  if(req.method==="POST"&&segments[1]==="agents"&&segments[3]==="sensitive"){const p=await body(req);sendJson(res,await store.setAgentSensitiveItems(decodeURIComponent(segments[2]!),Array.isArray(p.itemIds)?p.itemIds as string[]:[]));return;}
  if(req.method==="POST"&&path==="/api/projects"){const p=await body(req);sendJson(res,await projects.create({name:String(p.name??""),description:typeof p.description==="string"?p.description:undefined,goal:String(p.goal??""),status:p.status as never,tags:Array.isArray(p.tags)?p.tags as string[]:[],constraints:Array.isArray(p.constraints)?p.constraints as string[]:[],allowedAgents:Array.isArray(p.allowedAgents)?p.allowedAgents as string[]:[]},"user"),201);return;}
  if(req.method==="POST"&&segments[1]==="projects"&&segments[3]==="authorize"){const p=await body(req);sendJson(res,await projects.authorize(decodeURIComponent(segments[2]!),Array.isArray(p.agentIds)?p.agentIds as string[]:[],"user"));return;}
  if(req.method==="POST"&&segments[1]==="projects"&&segments[3]==="updates"&&segments[4]==="decision"){const p=await body(req);sendJson(res,await projects.decide(String(p.proposalId),decodeURIComponent(segments[2]!),p.decision as "confirm"|"reject","user"));return;}
  if(req.method==="POST"&&path==="/api/export"){const p=await body(req);sendJson(res,await store.exportBundle([],p.includeSensitive===true));return;}
  sendJson(res,{error:"Not found"},404);
} catch(error){sendJson(res,{error:error instanceof Error?error.message:String(error)},500);} });
server.listen(port,host,()=>console.error(`Profile Pack web UI listening on http://${host}:${port}`));
