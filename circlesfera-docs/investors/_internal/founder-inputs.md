# Data room index and founder inputs

**Date:** 30 August 2026  
**For:** the founder, before any fund sees the pack

Complete every blank below. The tier-1 send checklist in [README.md](../README.md) blocks cold email until critical rows are done.

---

## Tier-1 priority blanks

| Item | Status | Where it appears |
| --- | --- | --- |
| Founder bio (3 paragraphs) | **TODO** | [23-team-and-founders.md](../23-team-and-founders.md) |
| Legal entity + registry | **TODO** | [18-governance.md](../18-governance.md) |
| Cap table % | **TODO** | [18-governance.md](../18-governance.md) |
| Email + LinkedIn | **TODO** | 01, 22, outreach-email, deck slide 10 |
| Instrument + valuation | **TODO** | 18, FAQ |
| Screenshots (6+) | **TODO** | [assets/screenshots/](../assets/screenshots/) |
| Deck PDF export | **TODO** | From [deck-slides.md](./deck-slides.md) |
| Loom demo (optional) | **TODO** | Link in email |

**Pre-filled:** Shady Feliu (founder), demo URL https://circlesfera.com, ask €2.5M (range €2.5–5M).

---

## 1. Repository artifacts (data room)

| Item | Where |
| --- | --- |
| Investor suite 00–26 | `circlesfera-docs/investors/` |
| PRD v4.0 | `circlesfera-documentation/01-product-requirements-document.md` |
| Status / out of scope | `circlesfera-documentation/00-status.md` |
| Security full doc | `circlesfera-documentation/06-security-privacy-compliance.md` |
| Schema | `circlesfera-backend/prisma/schema.prisma` |
| MIT licence | `LICENSE` |

Do **not** share: `.env`, secrets, production admin credentials, raw user data.

---

## 2. Company (legal)

| Field | Value |
| --- | --- |
| Legal name | |
| Jurisdiction / registry number | |
| Incorporation date | |
| Registered address | |
| VAT / tax IDs | |
| Banking / Stripe legal entity match | |

---

## 3. Cap table and people

| Field | Value |
| --- | --- |
| Shady Feliu — Founder & CEO — % FD | |
| Option pool % | |
| Advisors / angels | |
| Full-time / contractors today | 1 (founder) |
| Trust operator today | Founder interim |

---

## 4. Founder bio (paste into doc 23)

**Background:**
[paragraph]

**Why CircleSfera:**
[paragraph]

**Why me now:**
[paragraph]

LinkedIn:
Email:

---

## 5. Traction (30 Aug 2026)

| Metric | Value |
| --- | --- |
| Registered public users | **0** |
| Platform MRR | **€0** |
| GMV (30d) | **€0** |

---

## 6. Financing

| Field | Value |
| --- | --- |
| Amount | €2.5M seed (range €2.5–5M) |
| Instrument | |
| Valuation or cap | |
| Minimum cheque | |
| Existing cash / runway | |
| Target close | |
| Use of funds | See [use-of-funds.md](./use-of-funds.md) |

---

## 7. Demo

| Surface | URL |
| --- | --- |
| Consumer SPA | https://circlesfera.com |
| Admin Trust | https://admin.circlesfera.com (staff only) |
| Test account policy | [describe] |

Walkthrough: [demo-walkthrough.md](./demo-walkthrough.md)

---

## 8. Screenshots checklist

- [ ] 01-home-feed.png
- [ ] 02-create-composer.png
- [ ] 03-edits-studio.png
- [ ] 04-live-gifts.png
- [ ] 05-creator-monetization.png
- [ ] 06-trust-appeals.png
- [ ] 07-admin-trust-desk.png

---

## 9. Product-completion dates

| Workstream | Target date |
| --- | --- |
| Native store listing | |
| Next creation surfaces (name them) | |
| ClickHouse Cloud + dashboard | |

---

## 10. Suggested data-room order

1. [22-one-pager.md](../22-one-pager.md)
2. [20-investment-thesis.md](../20-investment-thesis.md)
3. [23-team-and-founders.md](../23-team-and-founders.md)
4. [26-investor-faq.md](../26-investor-faq.md)
5. Room 00–19, 24–25 as requested
6. Legal pack (external PDFs)
7. [technology.md](./technology.md) if engineer joins

---

## 11. What not to claim

- Users or revenue other than zero until measured
- Native / ClickHouse Cloud / ads-at-scale as shipped
- Communities, Business Manager, public API, SOC2 as current
- OVH VPS as “AWS-scale cloud”
