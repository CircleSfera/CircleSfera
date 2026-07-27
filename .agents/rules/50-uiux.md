# CircleSfera — design system and UX

Activation: **Glob** — `circlesfera-frontend/src/components/**`,
`circlesfera-frontend/src/pages/**`, `circlesfera-frontend/src/index.css`,
`circlesfera-frontend/tailwind.config.js`.

Improve usability without changing CircleSfera's visual identity.

**Tokens live in `circlesfera-frontend/src/index.css`** (`:root` + Tailwind v4 `@theme`), not in
`tailwind.config.js`. Use them as `bg-brand-primary`, `bg-surface-raised`, and so on. A raw hex or a
stock Tailwind palette colour in a component is a finding.

Non-negotiable in this scope:

- Dark theme only (`color-scheme: dark`). No light theme, no toggle.
- Reuse the primitives in `src/components/ui/`; extend rather than fork. Icons are `lucide-react`
  only.
- Keep the existing glass language and spacing/radius scale. No new material, no parallel scale.
- Everything animated stays neutralised under `prefers-reduced-motion: reduce`.
- Never remove a visible focus indicator. Touch targets at least 44×44 CSS pixels.
- Every string through i18n, keys in both `en.json` and `es.json`.

**Benchmarking:** studying Instagram, TikTok, X, Threads, YouTube and Apple is encouraged — extract
the principle and *why it works*. Never replicate layout, iconography, colour, typography, animation
or components. Never trade a product principle (user control, transparency, no hidden suppression)
for engagement.

Token inventory, component rules and the redesign process:

@/.ai/agents/design-system.md
@/.ai/playbooks/ui-redesign.md
