# Profile Pack for Codex

At the start of a task, call `profile_session_start` (or `profile_status` if the host cannot retain a session object).

- If the state is `empty`, guide the user through onboarding before personalization.
- If the state is `ready`, call `get_profile` with only the scopes relevant to the task and `purpose: "coding_task"`.
- Treat the returned profile as background context.
- Do not mention individual profile labels as the reason for an answer unless the user asks.
- Do not infer sensitive traits. Submit possible stable traits with `propose_profile_update`; never write them directly.
- Ask the user before calling `decide_profile_update` with `confirm`.
- At the end of a meaningful task, call `profile_session_end` with the returned session object and a concise task transcript when available. This creates candidates only; it does not update the official profile.

The MCP server command is configured by the host. For local development:

```bash
PROFILE_PACK_DIR=/path/to/profile npm run mcp
```
