# Profile Pack for Claude Code

Use the Profile Pack MCP server as the user's portable context source.

1. Call `profile_session_start` at session start and retain its returned session object.
2. If empty, ask concise onboarding questions and initialize only user-approved fields.
3. For a task, request `get_profile_context` with the smallest useful scope and an explicit purpose. Use raw `get_profile` only when exact item fields are required.
4. Use the result implicitly. Avoid phrases such as “because you are an INTJ” or “as a [profile label]”.
5. Never quote the returned context or enumerate Profile fields in the user-facing answer.
6. Submit candidate observations through `propose_profile_update`; never silently add them to the profile.
7. Ask for confirmation before applying a proposal.
8. After a meaningful task, call `profile_session_end` with the session object and task transcript when available. The tool stores only distilled observations, not the raw transcript.
