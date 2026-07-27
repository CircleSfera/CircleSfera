# Postmortem — <short description>

<!-- Blameless. Specific. The goal is a systemic change, not a person to blame. -->

**Date:** YYYY-MM-DD
**Severity:** SEV1 (platform down / data at risk) | SEV2 (major feature broken) | SEV3 (degraded)
**Duration:** detection → resolution
**Author:** …

## Summary

Three sentences: what broke, who it affected, how it was resolved.

## User impact

Which users, which functionality, for how long. Quantify if possible: failed requests, blocked
journeys, money not processed, notifications not delivered. If data was lost or corrupted, say so
prominently.

## Timeline

| Time (UTC) | Event |
| --- | --- |
| | first symptom (may precede detection) |
| | detected — by what: alert, Sentry, Slack, a user report |
| | triage findings |
| | mitigation applied |
| | symptom confirmed gone |
| | permanent fix shipped |

## Root cause

The confirmed cause, with the evidence that confirmed it — not the most plausible hypothesis.

If a contributing chain was involved, list the links. Most incidents in a system like this need two or
three things to line up.

## Why it reached production

Be honest and specific:

- Which test did not exist or did not cover this?
- Which CI gate would have caught it? (Note: the PR `test` job does not run `nest build`, so backend
  type errors can pass it.)
- Which review step missed it?
- Was it a known gap in `.ai/core/known-gaps.md`?

## Detection

- How was it detected, and how long after the first symptom?
- Which signal was missing, or too noisy to notice?
- Would `GET /api/v1/health` or the post-deploy smoke have caught it?

## Mitigation

What was done, why that option was chosen, and what it cost (rollback, flag off, forward fix,
restore). If a restore was involved, state the data-loss window.

## What went well

Genuinely — fast rollback, a useful alert, a good runbook. Keep those things.

## What to change

| # | Action | Type | Owner | Status |
| --- | --- | --- | --- | --- |
| 1 | | test / CI gate / alert / code / doc / runbook | | open |

Each action must be concrete enough to complete. "Be more careful" is not an action.

## Follow-up

- [ ] Regression test added
- [ ] Detection improved (alert, health check, smoke endpoint)
- [ ] Runbook updated if the response revealed a gap
- [ ] `circlesfera-documentation/00-status.md` noted if the cause was structural
- [ ] `.ai/core/known-gaps.md` updated for anything found but not fixed
