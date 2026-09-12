---
name: code-review-pr
description: "Review an implementation diff independently against its contract, defects, security, architecture and regression coverage."
---

Read task/acceptance criteria, project rules, diff, relevant context and validation evidence. Identify concrete triggering conditions and impact before reporting findings. Check public contract compatibility, authorization/input validation, concurrency/transactions where relevant, maintainability and meaningful tests. Follow project-specific review rules through its skill-map. Run targeted checks when needed in an isolated worktree. Do not edit implementation or fix your own findings. Report severity, file/line, scenario, impact and recommendation, plus checks and limitations. PASS requires no blockers or material unresolved evidence gaps. Publishing reviews requires authorization; merging and functional acceptance are separate responsibilities.
