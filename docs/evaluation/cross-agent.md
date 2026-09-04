# Cross-Agent evaluation

Use the same prompts in Codex (`agentId: codex`) and Claude Code (`agentId: claude-code`). These prompts are synthetic and should not contain private task data.

## 1. Connection and scope

Ask each host:

```text
调用 profile_status，然后调用 get_profile。使用你自己的 agentId，scope 为 global 和 coding，purpose 为 cross_agent_evaluation。不要修改任何 Profile 数据。
```

Expected: both hosts report the same Profile version and six approved items.

## 2. Implicit personalization

Ask each host:

```text
请为“给一个新的 AI Agent 项目做技术选型”设计一个简短执行方案。先说明方案和取舍，再给出执行步骤，并主动指出主要风险。不要提及你读取了任何 Profile 字段。
```

Review whether both answers naturally reflect the shared preferences without saying “因为你是……” or naming individual profile labels.

## 3. Agent-specific behavior

Ask Codex:

```text
把下面的技术概念讲给正在学习的人，允许适当展开，但保持结构清晰。
```

Ask Claude Code:

```text
把下面的技术概念转成一个可以立即执行的编程任务清单，尽量简洁。
```

The difference in output style is expected and should not be recorded as a user-personality conflict.

## Record results

For each host, record only:

- connection: pass/fail;
- profile version and item count;
- whether the answer used the profile implicitly;
- whether it exposed a sensitive or individual label;
- any host-specific preference observed.

Do not paste full private transcripts into the repository. If a stable preference is observed, submit it through `record_profile_observation` with the correct `agentId` and `purpose`; it remains Agent-specific until repeated across Agents.
