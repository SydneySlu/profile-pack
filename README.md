# Profile Pack

Profile Pack is the first AI Me prototype: a user-owned, portable context layer for multiple AI agents.

## Current status

Version `0.1.0` provides:

- local Profile Pack initialization and empty-state detection;
- append-only event log with a filesystem write lock;
- user-confirmed profile update proposals;
- global/domain scopes and sensitive-item filtering;
- MCP tools and resources for Claude Code, Codex, and other MCP clients;
- JSON export for migration;
- multi-Agent observation aggregation and same-dimension conflict detection;
- Agent-specific interaction preferences separated from portable user traits;
- tests for onboarding state, proposal review, privacy filtering, and concurrent writes.

This remains an MVP foundation. It includes configurable Ollama and OpenAI-compatible extractors, and still supports direct structured observations as a no-model fallback. The daemon is local-only.

## LLM extraction providers

The MCP tool `extract_profile_observations` supports two providers:

### Local Ollama (default)

```bash
export PROFILE_PACK_LLM_PROVIDER=ollama
export PROFILE_PACK_OLLAMA_BASE_URL=http://127.0.0.1:11434
export PROFILE_PACK_OLLAMA_MODEL=qwen3:8b
```

The transcript is sent to the local Ollama process and is not written to the Profile Pack by this tool.

### OpenAI-compatible API

```bash
export PROFILE_PACK_LLM_PROVIDER=openai-compatible
export PROFILE_PACK_OPENAI_BASE_URL=https://api.openai.com/v1
export PROFILE_PACK_OPENAI_MODEL=gpt-4o-mini
export PROFILE_PACK_OPENAI_API_KEY=your-key
export PROFILE_PACK_ALLOW_REMOTE_EXTRACTION=true
```

Remote extraction is blocked unless `PROFILE_PACK_ALLOW_REMOTE_EXTRACTION=true` is set explicitly, because the conversation text leaves the local machine.

### Manual fallback

If no model is available, an Agent can call `record_profile_observation` directly with a structured observation. For example, it can submit “用户在编程任务中偏好先比较方案取舍” with a scope, dimension, confidence, and evidence. This keeps the system usable without a model and is also useful when a host Agent performs its own extraction.

## Run locally

```bash
npm install
npm run build
npm test
PROFILE_PACK_DIR="$PWD/.profile-pack" npm run dev -- init
PROFILE_PACK_DIR="$PWD/.profile-pack" npm run dev -- status
```

Run the MCP server over stdio:

```bash
PROFILE_PACK_DIR="$PWD/.profile-pack" npm run mcp
```

For multiple local Agents sharing one Profile Pack, run the daemon instead:

```bash
PROFILE_PACK_DIR="$PWD/.profile-pack" PROFILE_PACK_PORT=8765 npm run daemon
```

It listens on `http://127.0.0.1:8765/mcp` and exposes `/healthz`. The daemon is intentionally bound to localhost in this MVP; it does not provide remote access or internet authentication.

Start the local Profile management UI with:

```bash
PROFILE_PACK_DIR="$PWD/.profile-pack" PROFILE_PACK_WEB_PORT=8787 npm run web
```

Open `http://127.0.0.1:8787`. The UI shows the non-sensitive profile, candidates, conflicts, and pending proposals, and lets you review them. It is localhost-only and does not display sensitive fields.

The UI also provides version comparison, per-item sensitive-field grants, and explicit migration export. “通用 Profile” excludes sensitive fields; “完整 Profile” requires a confirmation dialog. A grant only changes the selected Agent policy; the Agent must still request `includeSensitive: true` and authenticate with its token. The same permission operation is available from the CLI: `profile-pack agents` and `profile-pack authorize-sensitive --agent-id codex --item-ids <id1,id2>`.

Configure the MCP client to launch `npm run mcp` from this repository, or use the built `dist/src/mcp.js` after `npm run build`.

## Data model

Agents submit observations as proposals. A proposal is not part of the official profile until the user confirms it. The append-only `events.jsonl` file is the source of change history; `profile.json` is the current materialized view. `agents.json` defines local Agent scope policies; unknown Agents are limited to the global scope and cannot read sensitive items.

Sensitive items are filtered unless an explicit read request includes `includeSensitive: true`. For real user data, keep the Profile Pack in a private directory or private repository; public GitHub repositories should contain only templates. 

## Learning flow

Agents can call `record_profile_observation` with a scope, dimension, value, confidence, and evidence. Observations are aggregated into `candidates.json`; differing values for the same scope and dimension appear in `conflicts.json`. Neither candidates nor conflicts modify the official profile automatically. After review, `promote_trait_candidate` turns a candidate into a normal profile proposal; the user must still confirm that proposal before it becomes official.

Observations are classified conservatively: a tendency seen through only one Agent remains `agent_specific`; the same tendency observed across at least two Agents becomes `portable`. Opposite values from disjoint Agents are kept as separate Agent-specific candidates and do not create a semantic conflict. A conflict is opened only when the same Agent supplies overlapping opposite values. No LLM is required for this classification.

## Session lifecycle

Hosts that can retain tool results should call `profile_session_start` before a task and `profile_session_end` after a meaningful task. This removes the need for the user to remember a separate reflection command. If a host cannot provide an end-of-session hook, `profile_reflect` and the CLI `learn --file ...` remain available. Missing a reflection call affects only how quickly the profile learns; reading the existing profile and normal Agent use continue to work.

CLI equivalent:

```bash
profile-pack session-start --agent-id codex --scope coding --purpose coding_task > session.json
profile-pack session-end --session-file session.json --file transcript.txt
```

## Candidate quality and review

Candidate confidence is time-decayed with a 90-day half-life; old observations remain in the append-only log but become less likely to be promoted without fresh evidence. Review a JSON snapshot with `profile-pack review`, or use `profile-pack review --interactive` for a terminal workflow. The MCP equivalent is `get_learning_snapshot`.

## Response evaluation

Use `profile-pack eval --file response.txt --scope coding` to check hard safety rules before accepting an Agent response. The evaluator flags explicit profile references, single-attribute attribution, and exact sensitive-content leakage. It intentionally leaves holistic quality as a human-review warning rather than pretending to measure the model's hidden reasoning.

Host integration examples are in `docs/integration/codex.md`, `docs/integration/claude-code.md`, and `adapters/mcp-config.example.json`.

## Profile versions and rollback

Every official Profile update creates an immutable snapshot under `snapshots/`. Use `profile-pack versions` to list snapshots, `profile-pack compare --from 1 --to 2` to inspect changes, and `profile-pack rollback --version 1` to restore an older state as a new version. Rollback never deletes the intervening history.

## Agent capability tokens

For a host that should authenticate independently, generate a token with:

```bash
profile-pack agent-token --agent-id codex
```

Store the printed token in that host's private MCP configuration and pass it as the `token` argument to `get_profile` and `profile_session_start`. If an Agent policy has a token, reads without the matching token are rejected. The token is stored in local `agents.json`; keep the Profile Pack directory private.

## Git identity setup

The commit error came from Git not knowing the author identity. Configure it once for your macOS user account in a terminal:

```bash
git config --global user.name "Your Name"
git config --global user.email "your-verified-github-email@example.com"
git config --global --get-regexp 'user\\.(name|email)'
```

This fixes commit authoring. Pushing to GitHub is a separate authentication step; use GitHub Desktop, SSH, or a GitHub credential manager for that.
