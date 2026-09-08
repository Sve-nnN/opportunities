---
schema_version: 1
open_count: 2
waived_count: 0
fixed_count: 0
total_count: 2
last_updated: 2026-09-08T01:38:24.508Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 02 | deviation | src/app/page.tsx |  | Finish-reviewer/documenter roles ran inline (no Agent/Task subagent tool available in this harness), not as spawned subagents — a true independent re-review is recommended once available (02-03-SUMMARY.md) | open |  | 2026-09-08T01:38:14.452Z |  |
| 2 | 02 | deviation | src/app/page.tsx |  | Tab-switcher roving-focus group takes 6-13s to become keyboard-reachable on the production build because the default Internships tab's 16,109 rows sit inside the client Tabs boundary's hydration walk (DISC-03's all-rows-visible requirement). Not a trap; recommended follow-up is row virtualization (Rule 4 architectural, see 02-03-SUMMARY.md Issues Encountered) | open |  | 2026-09-08T01:38:24.508Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "02",
    "file": "src/app/page.tsx",
    "line": null,
    "description": "Finish-reviewer/documenter roles ran inline (no Agent/Task subagent tool available in this harness), not as spawned subagents — a true independent re-review is recommended once available (02-03-SUMMARY.md)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-08T01:38:14.452Z",
    "resolved_at": null
  },
  {
    "id": 2,
    "kind": "deviation",
    "phase": "02",
    "file": "src/app/page.tsx",
    "line": null,
    "description": "Tab-switcher roving-focus group takes 6-13s to become keyboard-reachable on the production build because the default Internships tab's 16,109 rows sit inside the client Tabs boundary's hydration walk (DISC-03's all-rows-visible requirement). Not a trap; recommended follow-up is row virtualization (Rule 4 architectural, see 02-03-SUMMARY.md Issues Encountered)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-08T01:38:24.508Z",
    "resolved_at": null
  }
]
````
