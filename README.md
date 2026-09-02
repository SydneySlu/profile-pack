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
- tests for onboarding state, proposal review, privacy filtering, and concurrent writes.

This is an MVP foundation. It does not yet infer traits automatically and does not expose a remote network endpoint.

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

Configure the MCP client to launch `npm run mcp` from this repository, or use the built `dist/src/mcp.js` after `npm run build`.

## Data model

Agents submit observations as proposals. A proposal is not part of the official profile until the user confirms it. The append-only `events.jsonl` file is the source of change history; `profile.json` is the current materialized view.

Sensitive items are filtered unless an explicit read request includes `includeSensitive: true`. For real user data, keep the Profile Pack in a private directory or private repository; public GitHub repositories should contain only templates.

## Git identity setup

The commit error came from Git not knowing the author identity. Configure it once for your macOS user account in a terminal:

```bash
git config --global user.name "Your Name"
git config --global user.email "your-verified-github-email@example.com"
git config --global --get-regexp 'user\\.(name|email)'
```

This fixes commit authoring. Pushing to GitHub is a separate authentication step; use GitHub Desktop, SSH, or a GitHub credential manager for that.
