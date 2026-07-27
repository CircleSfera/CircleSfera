# ADR-0009: Hybrid feed fan-out

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** CircleSfera engineering

## Context

A pure fan-out-on-read feed does not scale for celebrity authors; pure fan-out-on-write wastes work for low-follower users and can cause thundering herds.

## Decision

Use a **hybrid feed fan-out** via BullMQ (`feed-fanout` queue) and `FeedInboxService`:

- Typical authors: fan-out to follower inboxes on publish.
- High-follower / “star” authors: hybrid path that avoids writing every follower inbox entry synchronously (celebrity mitigation).

Following and For You feeds also apply mutes, content rating, and feed preferences (hide post/author, muted keywords).

## Consequences

- Publish path depends on workers; delayed fan-out is possible under backlog.
- Inbox/read models must stay consistent with hide/mute rules.
- Further ranking (vectors, promotions) layers on top of this delivery mechanism.
