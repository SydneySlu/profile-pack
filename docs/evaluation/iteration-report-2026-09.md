# Profile Pack 迭代工作报告（2026-09）

## 1. 问题背景

Profile Pack 最初用于在多个 AI Agent 之间复用用户确认过的个人上下文。进入项目决策阶段后，单一个人 Profile 不适合承载具体项目的目标、任务、风险和技术取舍，因此本轮聚焦于“个人 Profile 保持不变，项目资料独立保存”，并以一个低风险的 AI 项目规划案例作为验证入口。

本轮限制：项目资料仍是本地单用户数据；不扩展远程多用户、账号体系或多人协作；Jev 依赖外部注册，目前无法调用。

## 2. 方案决策

采用独立 Project Profile 层，不改造个人 Profile schema。项目资料拥有自己的版本、事件、任务、里程碑、决策、风险、Agent 授权名单和更新提案。

决策评估采用可替换接口：当前使用透明、无网络的 `RuleEvaluator`；Jev 预留为未来可选适配器，不负责生成候选方案，也不替代主 Agent。项目更新采用“Agent 提案、用户在本地 UI 审核”的控制流；决策反馈采用追加日志，不自动升级为长期 Profile。

## 3. 个人动作与协作边界

- 用户确定了项目资料与个人 Profile 分离、Agent-specific 与可迁移信息分离、显式用户确认和不引入语义冲突 LLM 的产品边界。
- 用户提供真实的 AI 项目管理助手目标、期限和资源约束，并确认 Codex 与 Claude Code 的项目访问范围。
- Codex 完成 Project Store、MCP 工具、Web UI、Decision Log、RuleEvaluator 接口、测试和文档实现。
- Codex 与 Claude Code 已完成 Profile Pack MCP 读取与使用验证；该验证证明工具链路可用，不等同于已证明所有回答质量提升。

## 4. 交付状态

当前阶段是**原型/技术验证**，不是生产系统，也不是托管平台。

已交付到公开仓库的代码和文档包括：

- 独立 Project Profile 存储与版本快照；
- 项目访问控制、更新提案、用户确认/拒绝和过期提案保护；
- Decision Log，支持接受、修改、否决、重新生成四类反馈；
- 本地 Web UI 的项目创建、详情查看、Agent 授权和提案审核；
- `DecisionEvaluator` 接口与 RuleEvaluator 基线；
- Jev 延后说明和未来 shadow 评测边界。

真实个人 Profile、项目资料、事件日志和决策日志仍保存在本地私有目录，没有同步到 GitHub。

## 5. 落地范围

- 环境：本地 macOS 工作区；Profile Pack 以 Node.js/TypeScript 项目运行。
- Agent：已接入 Codex 和 Claude Code 的本地 MCP 使用链路。
- 数据范围：个人 Profile 与 Project Profile 分目录保存；项目 Agent 授权由本地 UI 管理。
- 当前提交：`7ae63fe feat: add project decision feedback workflow`。
- 公开仓库：`https://github.com/SydneySlu/profile-pack`。

## 6. 效果证据

已验证的技术结果：

- 自动化测试 41 项全部通过；
- TypeScript 构建通过；
- `git diff --check` 通过；
- 本地 Web API 冒烟测试通过：创建项目、列出项目、修改 Agent 授权并生成新版本；
- 项目生命周期测试证明项目操作不会修改个人 Profile；
- 未授权 Agent 写入项目决策反馈会被拒绝；
- Codex 与 Claude Code 均已成功调用 Profile Pack 工具并完成预期读取测试。

尚未形成的效果证据：用户长期使用时的任务完成率、决策质量提升、时间节省、成本变化和 Jev 相对规则评估的改进幅度。本报告不对这些指标作推断。

## 7. 个人边界

用户负责产品方向、数据边界、真实案例约束、Agent 授权和验收判断。Codex 负责当前仓库中的实现、测试、文档更新和 GitHub 同步。Codex 未完成 Jev 的实际调用，也未把远程服务注册状态描述成项目能力。

## 8. 待补证据与风险

- 需要用真实项目连续记录若干次决策反馈，形成固定评测集；
- 需要验证项目资料在 Codex 与 Claude Code 的实际工作流中是否足够支持项目更新；
- 需要补充候选方案生成层的端到端样例，目前候选方案仍由宿主 Agent 提供；
- Jev 注册恢复后，才可配置 API Key 并进行最小化数据的 shadow 调用；
- 本地 UI 的访问控制属于本机信任边界，不是远程身份认证；
- 项目资料和决策日志当前不提供加密和云端同步能力。

## 9. 后续追问

1. 在一周 MVP 限制下，哪些候选方案被规则评估器识别为不可行，用户最终如何取舍？
2. 为什么项目资料不能直接写入个人 Profile？
3. Agent 提案与用户确认之间如何避免旧版本提案覆盖新项目状态？
4. 决策反馈为什么只写入日志，不自动改变长期偏好？
5. Jev 注册恢复后，为什么必须先做 shadow 对照，而不是直接替换 RuleEvaluator？

## 升维迁移

原始事实：在不修改个人 Profile 的前提下，增加了独立 Project Profile、项目更新提案、用户审核和决策反馈日志，并用 41 项自动化测试及本地 API 冒烟测试验证核心链路。

高密度表达：围绕多 Agent 共享项目上下文的边界问题，设计并实现了独立的本地 Project Profile 控制层，将项目访问、版本一致性、用户确认和决策反馈拆成可追溯的状态流，同时保留个人 Profile 的稳定性。

本次升维动作：把“增加项目管理功能”具体化为数据边界、权限控制、版本治理、反馈持久化和可验证测试证据。

可选重写题：如果只能保留一个技术取舍，你会如何解释“为什么 RuleEvaluator 继续作为默认，而 Jev 暂不接入”？
