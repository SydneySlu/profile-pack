# Decision layer implementation boundary

## Phase 0 inventory

| Existing capability | Reuse | New work | Not in this phase |
| --- | --- | --- | --- |
| Profile Store, scopes, sensitivity, Agent policy | Read filtered items through `getView` | Decision request wrapper | Remote multi-user service |
| Event log, audit, versions, rollback | Record context retrieval and Profile version | Evidence references in decision result | Automatic Profile promotion |
| MCP and local UI/CLI | Add one MCP retrieval tool | Decision UI and CLI | Hosted authentication |
| Observation learning and conflicts | Keep separate and optional | No automatic observation in decision path | LLM semantic conflict judge |

## Phase 1 delivered

`retrieve_decision_context` performs structured scope and permission filtering, deterministic keyword relevance, confidence and explicit-expiry checks, and returns evidence references with matched terms and missing information. Broad terms such as “AI” or “project” cannot by themselves make a fact relevant. General answer-format preferences can be included as light context for plan/comparison/recommendation outputs. Sensitive fields are not unlocked unless the caller explicitly requests them and the existing Agent policy permits access.

Freshness is currently limited to explicit `expiresAt`; there is no age-based staleness decay because the data model does not yet distinguish stable facts from volatile project state. Project status freshness should be modeled separately in the Project Profile layer.

## Phase 2 evaluator slice

`evaluate_decision_candidates` accepts 2-3 candidates supplied by the host Agent. The deterministic RuleEvaluator assigns a transparent heuristic score using goal relevance (30%), feasibility (35%), risk (15%), and per-candidate Profile fit (20%); an explicit time-limit conflict blocks recommendation. It only expresses a preference when the top candidate leads by at least 0.05; ties or weak evidence are returned for user judgment. Every result states that the user must confirm. These weights are initial product rules, not a claim of calibrated decision quality. Decision feedback is recorded separately in the Project Profile decision log; recording it does not update either Profile.

## Project Profile slice

Project data is stored separately under `.profile-pack/projects/<projectId>/`; the personal `profile.json` schema and contents are untouched. Project records have their own lifecycle, tasks, milestones, decisions, risks, allowed-Agent list, event log, and version snapshots. Agents may propose updates; approval and access-list changes are exposed through the local Web UI, not as Agent-callable MCP tools. Approval applies only when the proposal's base version is still current and creates a new version; a stale proposal is retained but not applied. This local MVP does not provide cryptographic human identity or remote multi-user security; local process access remains within the user's trust boundary.

Decision feedback is appended to the project's `decisions.jsonl`. It records candidate IDs, evaluator, recommendation, the user's action, optional modification/reason, and the Profile version used. It does not mutate either the personal Profile or Project Profile. A later explicit promotion flow may turn repeated feedback into a pending preference, but that is intentionally outside the current implementation.

This is a retrieval gate, not a recommender. It does not call an LLM, create candidate plans, or change the Profile.

## Next call chain

```text
Decision Request
  -> Context Relevance Gate (current)
  -> Candidate Generator (next)
  -> DecisionEvaluator (RuleEvaluator first; Jev adapter only after API verification)
  -> User Review
  -> Decision Log and explicit feedback
```

## Jev verification note

Jev is TypeSafe AI's typed decision/evaluation model: it evaluates structured state against typed questions and returns typed answers with probabilities/confidence, rather than generating free-form text. The repository should treat it as an optional `DecisionEvaluator`, not as the candidate generator or a replacement for the host LLM. Official Quick Start documentation confirms `POST https://api.typesafe.ai/v1/systemone`, Bearer authentication with `TYPESAFE_API_KEY`, model `jev-latest`, and typed question primitives including Choice, Score, and Noul. Chinese decision quality, service limits, pricing, and suitability for our candidate-ranking task have not been verified in this project.

## Jev integration gate

The `DecisionEvaluator` interface and `RuleEvaluator` baseline are in place; a Jev adapter and API calls are not. TypeSafe registration is currently unavailable because the service is handling too many customers, so Jev is explicitly deferred and this repository makes no remote Jev calls. The local rule evaluator remains the no-cost, no-network default and fallback. When registration reopens, Jev should be integrated only after several low-risk decisions have been exercised and we have a small, fixed evaluation set with candidate options and the user's eventual choice/feedback. The adapter should run in opt-in shadow mode first, using only a minimized decision goal, candidate summaries, and required constraints. It must evaluate Chinese behavior, latency, cost/limits, timeout/failure handling, and agreement with user choices before becoming selectable.
