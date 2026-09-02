# Claude Code integration

1. Build the project with `npm run build`.
2. Register the command in `adapters/mcp-config.example.json` using Claude Code's MCP configuration mechanism.
3. Replace both absolute paths.
4. Use the Claude Code adapter at `adapters/claude-code/SKILL.md`.

For a token-protected Agent, keep the token in Claude Code's private MCP configuration and pass it to `get_profile` and `profile_session_start`. Use a distinct `agentId` from Codex so permissions and audit entries remain separable.

The adapter calls `profile_session_start` at task start and `profile_session_end` after meaningful tasks when the transcript is available.

For a shared daemon, use `adapters/mcp-config.shared-daemon.example.json` when the Claude Code installation supports Streamable HTTP. In every tool call, use `agentId: "claude-code"` and a purpose such as `coding_task`.
