import { createServer as createHttpServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ProfileStore } from "./store.js";
import { createServer } from "./mcp.js";
import { LearningEngine } from "./learning.js";

const rootDir = process.env.PROFILE_PACK_DIR ?? join(homedir(), ".profile-pack");
const host = process.env.PROFILE_PACK_HOST ?? "127.0.0.1";
const port = Number(process.env.PROFILE_PACK_PORT ?? 8765);
const store = new ProfileStore(rootDir);
const learning = new LearningEngine(rootDir);

async function readBody(req: AsyncIterable<Buffer>): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

await store.ensure();
await learning.ensure();
const httpServer = createHttpServer(async (req, res) => {
  if (req.url === "/healthz" && req.method === "GET") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true, profileDir: rootDir })); return; }
  if (req.url !== "/mcp" || !["GET", "POST", "DELETE"].includes(req.method ?? "")) { res.writeHead(404); res.end("Not found"); return; }
  // Stateless mode keeps the local daemon simple and allows every MCP request
  // to be served by a fresh isolated transport while sharing one ProfileStore.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = createServer(store, learning);
  await server.connect(transport);
  const body = req.method === "POST" ? await readBody(req) : undefined;
  await transport.handleRequest(req, res, body);
});

httpServer.listen(port, host, () => console.error(`Profile MCP daemon listening on http://${host}:${port}/mcp`));
