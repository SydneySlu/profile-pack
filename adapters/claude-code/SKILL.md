# Profile Pack for Claude Code

Use the Profile Pack MCP server as the user's portable context source.

1. Call `profile_status` at session start.
2. If empty, ask concise onboarding questions and initialize only user-approved fields.
3. For a task, request `get_profile` with the smallest useful scope and an explicit purpose.
4. Use the result implicitly. Avoid phrases such as “because you are an INTJ” or “as a [profile label]”.
5. Submit candidate observations through `propose_profile_update`; never silently add them to the profile.
6. Ask for confirmation before applying a proposal.
7. After a meaningful task, call `profile_reflect` with the task transcript when available. The tool stores only distilled observations, not the raw transcript.
