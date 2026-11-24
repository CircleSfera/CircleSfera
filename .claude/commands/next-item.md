---
description: Take the next ready item of CircleSfera's backlog and carry it to production - plan, build, check, pull request, merge queue, deploy.
argument-hint: "[backlog item title or link, optional]"
---

You are CircleSfera's engineering lead (AGENTS.md, Role). Carry ONE backlog
item from the backlog to production. Read AGENTS.md before anything else and
follow it; where this file and AGENTS.md differ, AGENTS.md wins.

## 1. Pick the item

The backlog is Notion → Execution → CircleSfera Implementation Backlog
(data source `collection://293fbd72-b074-4f2c-90d0-b70e279761df`).

- With an argument, take that item. Without one, take the first item with
  Status READY, by Priority (CRITICAL, HIGH, MEDIUM, LOW), then the oldest.
- Read the whole item: Description, Expected Outcome, Acceptance Criteria,
  Implementation Notes, Dependencies. An item whose dependency is not DONE is
  skipped.
- If the item falls inside the owner's gate (AGENTS.md "The owner's gate"):
  do not build it. Set it to BLOCKED, write
  the question at the top of its Implementation Notes with the options and
  your recommendation, tell the owner, and take the next item.
- Anything else ambiguous is yours to settle: decide, record the decision in
  the Decision Register with its reason, and build.
- Otherwise set it to IN PROGRESS.

## 2. Plan

Read the owning modules (service, controller, DTOs, tests, Prisma models).
Write down, for yourself and later for the pull request: what changes, the
blast radius, the tests that will prove it, and whether it touches
authentication, authorization, money, personal data or production (then the
review in step 4 is required). A plan that grows beyond one pull request is
split: the first slice now, the rest as new backlog items.

## 3. Build, in the repository

- In the repository itself (AGENTS.md, Working folder), on a new branch from
  `origin/main` named after the change
  (`fix/…`, `feat/…`, `refactor/…`, `chore/…`, `docs/…`, `test/…`). Never a
  worktree, copy or directory beside it.
- Delegate the code to `backend-dev` and/or `frontend-dev` with the plan and
  the branch; build small changes yourself.
- Every behaviour change has a test that fails without it.

## 4. Check

- `node scripts/agent-check.mjs` from the root of the repository must end
  with "Every check passed". It installs what is missing, the root tools
  included. Never weaken, skip or loosen a test or a check to make it pass.
- On Windows two backend tests fail on `main` too (`data-export`,
  `video.processor.cover`); a failure in any other test is yours.
- A change that shows anything new is looked at in a real browser at 390×844
  and 1280×800 (frontend-dev does it, or you do).
- Required review (step 2): run the `reviewer` agent on the branch, giving it
  the branch and the diff, never your conclusion. Fix what it confirms; say in
  the pull request what it checked.

## 5. Pull request

- Commit with a message that says what the change does for the product, in
  the repository's style (`git log --oneline -20`). No AI attribution in the
  message or the body (AGENTS.md; the hook refuses it).
- Push the branch and open the pull request against `main` with: What, Why,
  Checks (each check run and its result; a check not run is said to be not
  run), and the backlog item it tracks.
- A pull request that changes `.github/workflows/` goes through `reviewer`
  first, always.
- Once its required checks are green and no review thread is
  unresolved, put it in the merge queue:
  `gh api graphql -f query='mutation($id:ID!){enqueuePullRequest(input:{pullRequestId:$id}){mergeQueueEntry{position}}}' -f id=<node id>`
  (`gh pr view <n> --json id -q .id`). If a check fails, read its log, fix
  the cause on the same branch, and push again. Answer every review comment:
  fix it, or reply why not.

## 6. Production

- Waits (checks, queue, deploy) run in the background; never block on them.
- After the merge, follow the deploy run on `main`
  (`gh run list --workflow deploy.yml`): staging, its browser checks, then
  production. If staging stops it, the change goes no further: fix it in a
  new pull request.
- Then check production's health
  (`https://circlesfera.com/api/v1/health`). A check that was not run is
  reported as not run.
- Set the backlog item to DONE with the pull request link and what remains
  open (new items for anything left).
- Ask `docs` to correct the Notion pages the change made untrue.
- Remove the branch locally once merged (`git branch -D <branch>`).

## 7. Report

Tell the owner, in a few lines and in their language: the item, the pull
request, what it changed for the product, the checks, the deploy, and
anything blocked or open. Then stop; `/loop /next-item` takes the next one.
