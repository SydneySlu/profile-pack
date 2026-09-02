# Generic Agent Adapter

For an MCP-capable Agent, register `src/mcp.ts` (or `dist/src/mcp.js` after building) as a stdio MCP server and instruct the Agent to:

1. Call `profile_status` before using personalization.
2. Call `get_profile` with purpose and minimal scopes.
3. Treat returned context as implicit background.
4. Use `propose_profile_update` for observations and wait for user confirmation.
5. After a meaningful task, call `profile_reflect` when a transcript is available; treat the result as a review queue, not an automatic profile update.

The canonical user data is the Profile Pack, not this adapter instruction.
