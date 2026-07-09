---
name: issue-lifecycle
description: Drive implementation of a project task tracked as a GitHub issue in Salve-Software/react-native-salve-db — read the issue as the source of truth, invoke the domain skill(s) it requires, assign it to the current gh user, keep it updated while work is in progress, and open a PR that auto-closes it on merge. Use when the user asks to implement/start/pick up/continue a TASK-0XX or a specific issue number in this repo.
user-invocable: false
---

# Issue Lifecycle

Since `docs/tasks/*.md` was retired, each MVP task lives exclusively as a GitHub issue in `Salve-Software/react-native-salve-db`. The issue body is the full original task doc (Descrição, Docs de referência, Critérios de aceite, Fora de escopo) plus a metadata block (Status, Prioridade, Área, Depende de, Bloqueia, Skills obrigatórias). Treat `gh issue view` as the only source of truth — never assume a local task doc exists.

## Trigger

Invoke this skill when the user references implementing a task by TASK-0XX id, by issue number, or by task name ("implementa o HTTP client", "bora pegar a TASK-009", "continua a issue #10").

## Resolving the target issue

- If given a bare number, that's the issue number directly.
- If given a `TASK-0XX` id or a task name, resolve it: `gh issue list -R Salve-Software/react-native-salve-db --search "TASK-0XX in:title"` (or match by title keywords). Confirm the match with the user if ambiguous.

## Before writing any code

1. `gh issue view <n> -R Salve-Software/react-native-salve-db --json title,body,state,assignees,labels` — read the full body.
2. Parse **Depende de** — each dependency now appears as `TASK-0YY (#M)`. Check `#M`'s state via `gh issue view`. If a dependency is still open, tell the user before proceeding (don't hard-block — some deps are "parcial", per the task's own text).
3. Parse **Skills obrigatórias** — a backtick-quoted list (e.g. `` `cpp` ``, `` `kotlin`, `swift` ``). Invoke every named skill (via the `Skill` tool) before implementing — this is the same forcing-function the old task template had, just sourced from the issue now. If the field is `—` (tooling/docs task), skip.
4. Confirm a feature branch exists per the repo's git workflow (never commit to `main`/`master`) — branch naming `feat/{short-desc}` or `fix/{short-desc}`, tied to the task.

## Claiming the issue

- Assign it to whoever is running the agent: `gh issue edit <n> -R Salve-Software/react-native-salve-db --add-assignee @me`. `@me` resolves to the active `gh auth status` account.
- If assignment fails (no write access, `@me` already the assignee, etc.) or the issue is already assigned to someone else, don't force it — surface that to the user instead of silently continuing or reassigning.
- Optionally leave a short starting comment (`gh issue comment <n> --body "..."`) noting the branch name, useful when multiple people/agents pull from the same board.

## While implementing

- Work through the **Critérios de aceite** checklist in the issue body as the actual definition of done — don't consider the task finished until every box is genuinely satisfied (tested/verified), not just written.
- If you need to report partial progress (e.g. pausing mid-task, or a criterion turns out blocked), post a `gh issue comment` explaining what's done/blocked — don't silently go quiet on an assigned issue.
- If new criteria are discovered or scope shifts, note it in a comment rather than silently editing the original acceptance criteria out of the issue.

## Finishing: PR, not manual close

- Do not close the issue directly. Open the PR with the closing keyword in the body so GitHub closes the issue automatically on merge: `Closes #<n>` (or `Closes Salve-Software/react-native-salve-db#<n>` if cross-repo). This avoids marking work "done" before it's actually reviewed/merged.
- PR title/body should reference the `TASK-0XX` id too, for grep-ability in history (issue numbers and TASK ids don't match 1:1 — TASK-001 is issue #2, offset by the earlier merged PR).
- If the work only partially covers the issue (a deliberate partial PR), use `Refs #<n>` or `Part of #<n>` instead of `Closes` — leave the issue open, and comment what remains.
- Once the PR is up, checking off the satisfied acceptance-criteria checkboxes in the issue body (`- [ ]` → `- [x]`) is a nice-to-have for traceability, not a substitute for actually opening the PR — fetch the current body, flip only the boxes you've verified, `gh issue edit <n> --body-file`.

## Out of scope

Deciding merge strategy, review process, or CI setup — this skill only covers the issue-tracking side (assign, keep updated, link the PR) of implementing a task, not the review/merge workflow itself.
