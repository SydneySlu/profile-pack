# Codex integration

1. Build the project with `npm run build`.
2. Register `adapters/mcp-config.example.json` using the MCP configuration surface available in your Codex installation.
3. Replace both absolute paths.
4. Use the Codex adapter at `adapters/codex/SKILL.md`.

For multiple local Agents, run the shared daemon and configure each host for `http://127.0.0.1:8765/mcp` if that host supports Streamable HTTP. Stdio is the compatibility fallback.
