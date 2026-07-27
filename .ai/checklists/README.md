# Checklists

Closing gates. Run the applicable ones before calling work done, and report the result honestly —
an unchecked box with a reason is useful; a checked box you did not verify is a lie that costs
someone else a debugging session.

| Checklist | Run when |
| --- | --- |
| [`pull-request.md`](./pull-request.md) | Always |
| [`feature.md`](./feature.md) | A new capability |
| [`api.md`](./api.md) | Endpoints or DTOs changed |
| [`database.md`](./database.md) | `schema.prisma` or SQL touched |
| [`security.md`](./security.md) | Auth, permissions, personal data, money |
| [`performance.md`](./performance.md) | Hot paths: feed, chat, search, stories, profile |
| [`ui.md`](./ui.md) | Visible UI changed |
| [`accessibility.md`](./accessibility.md) | Visible UI changed |
| [`release.md`](./release.md) | Shipping to production |

Format for reporting: `pass` / `fail` / `n/a` with a one-line reason for anything that is not `pass`.
