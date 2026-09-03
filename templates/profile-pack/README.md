# Empty Profile Pack template

This directory is a public, empty template only. It contains no user data and is safe to commit to Git.

Do not use this file as the live data directory. Create a private Profile Pack with:

```bash
PROFILE_PACK_DIR="$HOME/.profile-pack" npm run dev -- init
```

The live directory contains `profile.json`, event logs, proposals, observations, and immutable snapshots. Keep it outside the repository and never commit it.

The first initialization flow should collect, in order:

1. basic identity;
2. learning, work, and long-term goals;
3. interaction preferences and boundaries;
4. optional personal profile;
5. high-sensitivity data only with explicit purpose and authorization.
