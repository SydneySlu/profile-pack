# Codex integration

1. Build the project with `npm run build`.
2. Register `adapters/mcp-config.example.json` using the MCP configuration surface available in your Codex installation.
3. Replace both absolute paths.
4. Use the Codex adapter at `adapters/codex/SKILL.md`.

For a token-protected Agent, add the token to the host's private MCP environment/configuration and pass it to `get_profile` and `profile_session_start`. Do not commit the token or put it in a shared repository. The shared local daemon can be used by both Codex and Claude Code; each should have a separate `agentId` and (optionally) separate token.

For multiple local Agents, run the shared daemon and configure each host for `http://127.0.0.1:8765/mcp` if that host supports Streamable HTTP. Stdio is the compatibility fallback.

The shared-daemon example is in `adapters/mcp-config.shared-daemon.example.json`. In every tool call, Codex should identify itself as `agentId: "codex"` and use a purpose such as `learning_task` or `coding_task`.
