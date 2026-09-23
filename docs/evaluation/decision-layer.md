# Decision layer implementation boundary

## Phase 0 inventory

| Existing capability | Reuse | New work | Not in this phase |
| --- | --- | --- | --- |
| Profile Store, scopes, sensitivity, Agent policy | Read filtered items through `getView` | Decision request wrapper | Remote multi-user service |
| Event log, audit, versions, rollback | Record context retrieval and Profile version | Evidence references in decision result | Automatic Profile promotion |
| MCP and local UI/CLI | Add one MCP retrieval tool | Decision UI and CLI | Hosted authentication |
| Observation learning and conflicts | Keep separate and optional | No automatic observation in decision path | LLM semantic conflict judge |

## Phase 1 delivered

`retrieve_decision_context` performs structured scope and permission filtering, deterministic keyword relevance, confidence and expiry checks, and returns evidence references with matched terms and missing information. Sensitive fields are not unlocked unless the caller explicitly requests them and the existing Agent policy permits access.

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

Initial public documentation/search results describe Jev as TypeSafe AI's typed decision/evaluation model: it evaluates structured state against typed questions and returns calibrated decisions, rather than generating free-form text. The repository therefore must treat it as an optional `DecisionEvaluator`, not as the candidate generator or a replacement for the main LLM. The adapter should remain unimplemented until an authoritative API endpoint, authentication method, request schema, response schema, Chinese behavior, and rate limits are verified from Jev's official developer documentation.
