# Music implementation decisions

These execution rulings and their costs accompany the [verification record](music-widget-module.md). They do not expand the approved scope.

| Ruling | Reason and cost |
| --- | --- |
| One independent whole-branch review, with implementer self-review and controller checks between tasks | The user limits broad work to one review. Fewer independent intermediate checks; the final review covered the complete feature and found four issues, all corrected. |
| Equivalent PowerShell task briefs and ledger | The skill's Bash helper failed on utility paths and worktree trust. Tooling can drift; workspace identity and extracted tasks were checked. |
| Task 5 initially injects connection validation; Task 6 wires the real Pear adapter | Credential implementation precedes transport implementation in the approved plan. Integration rework was possible; real protocol and management tests subsequently covered the boundary. |
| CSS custom variables must be declared in the same rule, except documented safe native variables; no fallback arguments | Static resource safety cannot establish inherited or cross-selector values. Users may need repeated declarations; broader support requires additional policy proof. |
| Use maintained `ws` for the disposable protocol fixture | Avoid custom framing and preserve protocol fidelity. A small exact test dependency closure is added. |
| Export CSS policy through its explicit core subpath rather than the default root | Eager parser loading exceeded measured route budgets. Internal callers must use the explicit subpath; production budgets now pass. |
| Carry server projection time and anchor recipient elapsed time monotonically | There was no existing network clock-sync protocol. A transient schema field and fixtures were added; timer behavior is unchanged. |
| A runtime callback failure after durable credential replacement does not roll back the new credential | Returning a failed registration after durable success would misrepresent state and risk secret retirement races. The operator may need to reconnect; failures before commit preserve the old registration and secret. |
| Unchanged corrupted saved CSS may be disabled only with all other config unchanged | Preserve a keyboard-accessible recovery action without accepting new invalid config. Other edits require fixing or clearing the CSS; restore still rejects invalid CSS. |
| Reuse the completed baseline dependency agent for the sole read-only feature review | A fresh reviewer could not start because the agent thread limit was reached. The reviewer had worked on dependency feasibility but had not implemented feature code; its model could not be overridden on follow-up. |
| Hold maintenance admission for the complete Music mutation lifecycle and refuse restore while work is active | Preserve existing maintenance semantics while preventing database/credential races, including queued replacements and cleanup. The operator retries restore after the operation finishes rather than waiting automatically. |

Unused credential entries left by a failed retirement cannot be enumerated by the current SecretStore interface; the failure is reported, and durable cleanup retry remains outside this change. Current referenced credentials and restore rollback are covered.

The local execution workspace is retained as supporting handoff evidence. Canonical behavior, scenario mapping, decisions and verification are committed; the local reports are not required to understand the result. No push, pull request, merge or change archive was performed.
