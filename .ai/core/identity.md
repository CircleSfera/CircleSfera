# Identity — what CircleSfera is

Derived from `circlesfera-documentation/01-product-requirements-document.md` (PRD v4.0, Jul 2026)
and `00-status.md`. Read those for the full argument; this is the version an agent needs before
touching product behaviour.

## What it is

A multi-format social platform covering posts, short video (frames), ephemeral stories with
persistent highlights, private messaging, discovery, platform subscriptions, creator monetization,
promotions, moderation with appeals, and auditing. It competes in the Instagram/TikTok space on a
different proposition: controlled identity, explicit relationships, first-party monetization, and
an auditable trust operation.

It is not a demo, not an MVP, and not a clone. Treat every change as production software touching
real identity, real content and real money.

## The five product principles

These are structural, not aspirational. They constrain implementation, not just marketing.

1. **User control comes first.** The user decides what they consume, who may interact with them,
   what recommendations they get, and what they share. Automated systems complement the experience;
   they do not override the user's explicit choices.
2. **Algorithmic transparency.** Ranking and discovery may use many signals, but they must stay
   explainable: why this content, why this profile, which of my actions changes it.
3. **No hidden suppression.** Shadow banning is not an ecosystem management tool. Visibility
   follows explicit, verifiable criteria: viewer preferences, post privacy, social relationships,
   declared discovery behaviour, or a justified legal/safety obligation.
4. **Strict and explicit moderation.** When something is limited, the user is told what happened,
   why, under which rule, and how to contest it. Actions are internally auditable.
5. **Responsible data handling.** Purpose limitation, proportionality, minimization, storage
   limitation. The platform must be able to justify what it collects, why, for how long, and on
   what basis.

## The three questions every change must answer

From PRD §1.6. If a design cannot answer these, it is not ready to ship:

1. Is the user reasonably in control of this experience?
2. Can we explain why the system made this decision?
3. Is the action transparent, traceable, and consistent with the platform's declared policies?

## What CircleSfera must never become

- A platform that silently reduces reach. Any visibility restriction needs an explicit,
  communicable, traceable reason. The codebase already carries an anti-shadowban label in
  moderation flows — do not add mechanisms that route around it.
- A dark-pattern monetizer. The 20% platform fee is documented in
  [ADR-0010](../../circlesfera-documentation/adr/0010-platform-fee-20-percent.md); pricing and
  gating stay visible to the user.
- An opaque recommender. Ranking signals live in `src/analytics`, `src/feed` and embeddings; new
  signals must be describable in user-facing terms.
- A visual clone. Benchmarking competitor UX patterns is allowed and useful; copying layout,
  iconography, colour, typography or components is not. See
  [`agents/design-system.md`](../agents/design-system.md).

## Out of scope right now

`00-status.md` maintains the authoritative list. As of Jul 2026 it explicitly excludes: native
mobile apps, communities/forums, B2B Business Manager, public OAuth / third-party developer
platform, SSR indexable profiles, subscriber badges as a product surface, data warehouse / BI, and
SOC2 certification plus public bug bounty. Creator-initiated payouts stay in the Stripe Express
dashboard ([ADR-0002](../../circlesfera-documentation/adr/0002-stripe-connect-payouts.md)).

Do not design or scaffold these without explicit confirmation that product reopened them. Check
`00-status.md` first — the list moves.

## Vocabulary that matters

"Frames" are short videos, modelled as `PostType.FRAME` on the `Post` model — there is no `Frame`
table. Getting this wrong produces schema-invalid proposals. See
[`glossary.md`](./glossary.md) for the rest.
