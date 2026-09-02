# Claude Code integration

1. Build the project with `npm run build`.
2. Register the command in `adapters/mcp-config.example.json` using Claude Code's MCP configuration mechanism.
3. Replace both absolute paths.
4. Use the Claude Code adapter at `adapters/claude-code/SKILL.md`.

The adapter calls `profile_session_start` at task start and `profile_session_end` after meaningful tasks when the transcript is available.
