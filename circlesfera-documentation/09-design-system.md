# CircleSfera Design System
> **Fuente canónica**: [Notion — CircleSfera Design System](https://app.notion.com/p/CircleSfera-Design-System-3b2dfa08f2f580e6a802ecea1eef9685)
> **Sincronizado**: Agosto 2026 | **Versión Notion**: 2.0.0 | **Status**: Official

---

Version: 2.0.0
Status: Official
Last Updated: August 2026
---
# 1. Introduction
## 1.1 Purpose
The CircleSfera Design System defines the visual language, interaction principles, layout rules, reusable patterns, accessibility requirements, and engineering standards used across the entire CircleSfera ecosystem.
Its purpose is to ensure every interface delivers a consistent, scalable and high-quality user experience regardless of platform or feature.
This document serves as the single source of truth for product design.
Every application, service, website and internal tool MUST follow the rules defined in this specification.
---
## 1.2 Scope
This specification applies to every product within the CircleSfera ecosystem, including but not limited to:
- CircleSfera Mobile
- CircleSfera Web
- CircleSfera Creator Dashboard
- CircleSfera Studio
- CircleSfera Admin Panel
- Authentication
- Landing Pages
- Internal Backoffice Tools
- Future CircleSfera Applications
No product is exempt from this Design System unless explicitly documented.
---
## 1.3 Audience
This document is intended for:
- Product Designers
- UI Designers
- UX Designers
- Frontend Engineers
- Full Stack Engineers
- Design Engineers
- AI Coding Agents
- QA Engineers
- Product Managers
Every contributor is expected to understand and apply these standards.
---
## 1.4 Goals
The Design System exists to achieve the following objectives.
### Consistency
Every interface should immediately feel like CircleSfera.
Users should never experience visual inconsistencies between different sections of the platform.
---
### Scalability
The system must support thousands of components and hundreds of future features without becoming inconsistent.
Every new component should naturally integrate into the existing design language.
---
### Maintainability
Design decisions should be centralized.
Updating a design token should automatically improve every interface that depends on it.
---
### Accessibility
Accessibility is a fundamental requirement.
It is not an optional enhancement.
Every interface MUST be usable by the widest possible range of users.
---
### Performance
Beautiful interfaces should never compromise performance.
Visual quality and rendering performance must coexist.
---
## 1.5 RFC Terminology
The following keywords define the strength of every requirement.
### MUST
Absolute requirement.
Cannot be ignored.
---
### MUST NOT
Absolute prohibition.
Never allowed.
---
### SHOULD
Strong recommendation.
Deviations require valid justification.
---
### SHOULD NOT
Generally discouraged.
Only acceptable under exceptional circumstances.
---
### MAY
Optional implementation.
Used when multiple valid solutions exist.
---
# 2. Design Philosophy
CircleSfera is a content platform.
The interface exists to support content, not compete with it.
Every design decision should maximize usability, clarity and efficiency while maintaining a refined visual identity.
The experience should feel modern without relying on unnecessary decoration.
Elegant without becoming minimal to the point of reducing usability.
Rich without becoming visually overwhelming.
---
## 2.1 Mobile First
CircleSfera is designed for mobile devices first.
Every feature MUST begin with a mobile implementation before being adapted for tablet or desktop.
Desktop is an adaptation.
Mobile is the source.
Designing desktop first is prohibited.
---
## 2.2 Content First
Content is always the highest priority.
The interface exists only to organize and present content.
Whenever there is a conflict between decorative UI and content visibility, content wins.
Users should always see more content than interface.
---
## 2.3 Simplicity
Complexity should remain invisible.
Interfaces should feel intuitive without requiring explanation.
Every additional visual element must justify its existence.
If an element does not improve usability, it should be removed.
---
## 2.4 Consistency
Identical actions should always produce identical visual results.
Components must behave consistently across the entire platform.
Users should never need to relearn an interaction.
---
## 2.5 Predictability
Interfaces should behave exactly as users expect.
Animations, gestures, navigation and interactions should reinforce familiarity.
Unexpected behavior increases cognitive load.
---
## 2.6 Progressive Disclosure
Only essential information should be presented initially.
Advanced functionality should appear progressively.
Avoid overwhelming users with unnecessary controls.
---
## 2.7 Visual Balance
Interfaces should maintain an appropriate balance between information density and whitespace.
Whitespace is a tool.
Whitespace is never decoration.
Empty space should improve readability, not reduce information density.
---
## 2.8 Human-Centered Design
Interfaces are built for people.
Not for screenshots.
Not for portfolios.
Not for awards.
Every design decision should improve real-world usability.
---
# 3. Core Principles
## Principle 1 — Mobile Before Desktop
Every screen MUST be designed for a reference viewport of **390 × 844 px** before any larger breakpoint.
Desktop implementations MUST preserve the same interaction model while adapting layout to available space.
Desktop MUST NOT increase component sizes without a functional reason.
---
## Principle 2 — Content Over Decoration
Content is the product.
Decorative elements are secondary.
Animations, gradients, glass effects and visual treatments MUST never distract from the primary content.
---
## Principle 3 — High Information Density
CircleSfera is a social platform.
Users open the application to consume content.
Interfaces MUST maximize useful information visible on screen.
Oversized cards, excessive padding and large empty areas are prohibited.
Target visual density should be comparable to leading social platforms such as Instagram, Threads and X while preserving readability.
---
## Principle 4 — One Design Language
Every component should appear to belong to the same family.
Differences between components should communicate meaning rather than stylistic variation.
---
## Principle 5 — Design Through Systems
Individual screens should never define their own rules.
Every interface should emerge naturally from reusable tokens, components and layout rules.
If a new rule is required, the Design System should evolve instead of creating exceptions.
---
## Principle 6 — Accessibility by Default
Accessibility is the default implementation.
It is never an optional enhancement performed later.
Every component must remain accessible from the moment it is created.
---
## Principle 7 — Performance is Part of Design
Smooth interactions are a design feature.
Animations should feel effortless.
Rendering should remain responsive.
Interfaces should communicate quality through speed and fluidity.
---
## Principle 8 — Quality Over Quantity
Shipping fewer polished features is preferable to shipping many inconsistent ones.
Every screen should satisfy the quality checklist before being considered complete.
---
## Principle 9 — Long-Term Consistency
Design decisions should prioritize maintainability over short-term convenience.
Temporary visual solutions tend to become permanent technical debt.
Avoid exceptions whenever possible.
---
## Principle 10 — Every Pixel Has a Purpose
Every pixel on screen should contribute to:
- usability
- clarity
- hierarchy
- interaction
- accessibility
- communication
Pixels without purpose should not exist.

# 4. Design Language
## 4.1 Design Identity
CircleSfera combines modern minimalism with high information density.
The visual language should communicate:
- Confidence
- Professionalism
- Speed
- Precision
- Creativity
- Trust
The interface should feel premium without becoming visually heavy.
Users should immediately focus on content rather than interface elements.
---
## 4.2 Design Characteristics
The CircleSfera interface SHOULD be:
- Clean
- Compact
- Predictable
- Elegant
- Responsive
- Highly readable
The interface MUST NOT be:
- Oversized
- Empty
- Decorative
- Noisy
- Over-animated
- Difficult to scan
---
## 4.3 Content Density
CircleSfera is a content platform.
Interfaces MUST maximize the amount of useful information visible on screen.
Whitespace should improve readability but MUST NOT reduce content visibility.
The amount of visible information should be comparable to:
- Instagram
- Threads
- X
If a layout displays significantly less content than these references, it SHOULD be redesigned.
---
## 4.4 Visual Hierarchy
Every screen MUST establish a clear hierarchy.
Priority order:
1. Primary Content
2. User Actions
3. Secondary Information
4. Metadata
5. Decorative Elements
Decorative elements must never compete with primary content.
---
## 4.5 Rhythm
Interfaces should establish a consistent visual rhythm through spacing, typography and alignment.
Avoid irregular spacing.
Avoid random positioning.
Use the spacing scale consistently.
---
## 4.6 Alignment
Elements SHOULD align to a common grid.
Misalignment creates unnecessary visual noise.
Horizontal alignment should always take priority over decorative positioning.
---
## 4.7 Balance
Every screen should balance:
- Information
- Whitespace
- Contrast
- Interaction
- Motion
Avoid visual extremes.
---
# 5. Color System
## 5.1 Philosophy
Color communicates meaning.
Color is not decoration.
Every color MUST have a semantic purpose.
---
## 5.2 Brand Colors
CircleSfera uses a warm gradient identity.
Primary Brand
Purple
Secondary Brand
Pink
Accent
Orange
Support
Blue
These colors represent the visual identity of CircleSfera.
---
## 5.3 Semantic Colors
Semantic colors communicate interface state.
Success
Completed actions.
Warning
Attention required.
Danger
Errors.
Information
Neutral system messages.
Semantic colors MUST never be used purely for decoration.
---
## 5.4 Dark Theme
CircleSfera is permanently dark.
No light theme exists.
All interfaces MUST be designed assuming a dark environment.
---
## 5.5 Background Hierarchy
Backgrounds should follow these levels.
Level 0
Pure application background.
Level 1
Main containers.
Level 2
Cards.
Level 3
Floating surfaces.
Level 4
Dialogs.
Level 5
Critical overlays.
Higher levels should appear progressively elevated.
---
## 5.6 Contrast
Important actions should achieve contrast through:
- Color
- Size
- Position
- Weight
Avoid relying on color alone.
---
## 5.7 Gradients
Gradients communicate branding.
Gradients SHOULD appear on:
- Primary CTAs
- Branding
- Hero Elements
Gradients SHOULD NOT appear on:
- Paragraphs
- Cards
- Inputs
- Long text
- Content backgrounds
---
## 5.8 Glassmorphism
Glass effects provide depth.
Glass MUST be used sparingly.
Recommended locations:
- Navigation
- Floating Cards
- Bottom Sheets
- Dialogs
Avoid applying glass to every component.
Too much blur reduces readability.
---
## 5.9 Borders
Borders should define separation rather than decoration.
Prefer subtle borders.
Avoid high contrast borders unless indicating interaction.
---
## 5.10 Shadows
Shadows communicate elevation.
Every shadow should correspond to a logical elevation level.
Do not create custom shadows per component.
---
# 6. Typography
## 6.1 Philosophy
Typography is the primary communication tool.
It should maximize readability before personality.
---
## 6.2 Typeface
Primary Typeface
Inter Variable
No secondary interface font should be introduced without approval.
---
## 6.3 Font Weight
400
Body text
500
Labels
600
Section headings
700
Important headings
Avoid heavier weights unless necessary.
---
## 6.4 Type Scale
Display XL
48px
Display
40px
Heading 1
32px
Heading 2
28px
Heading 3
24px
Heading 4
20px
Body
16px
Body Small
14px
Caption
12px
Badge
11px
Do not introduce arbitrary font sizes.
---
## 6.5 Line Height
Display
110%
Headings
120%
Body
150%
Captions
140%
Maintain comfortable reading rhythm.
---
## 6.6 Paragraph Width
Long paragraphs SHOULD NOT exceed approximately 70 characters per line.
Readable text is preferable to extremely wide layouts.
---
## 6.7 Text Hierarchy
Every screen should contain one clear primary heading.
Avoid multiple competing headings.
Use typography instead of excessive colors to establish hierarchy.
---
## 6.8 Text Alignment
Left aligned by default.
Centered text should be reserved for:
- Empty states
- Landing pages
- Dialogs
- Success screens
Avoid centered body text.
---
## 6.9 Text Truncation
Text should truncate gracefully.
Never allow overflowing text.
Use ellipsis only when expansion is available.
---
## 6.10 Numbers
Tabular numbers SHOULD be used whenever values change dynamically.
Examples:
- Counters
- Statistics
- Financial values
- Analytics
- Timers
---
## 6.11 Readability Rules
Avoid:
- Low contrast text
- Long uppercase paragraphs
- Extremely small fonts
- Excessively bold interfaces
Typography should remain comfortable during prolonged use.
---
## 6.12 Accessibility
Text MUST satisfy WCAG AA contrast requirements.
Critical interface text SHOULD satisfy AAA whenever possible.
Never reduce readability for visual style.

# 7. Spacing System
## 7.1 Philosophy
Spacing is a structural element.
Whitespace improves readability, defines hierarchy and separates content.
Whitespace MUST NOT exist for decorative purposes alone.
Every spacing value MUST communicate structure.
---
## 7.2 Base Unit
The entire interface is built upon a **4px base unit**.
All spacing MUST be a multiple of 4px.
Arbitrary spacing values are prohibited.
---
## 7.3 Spacing Scale
The following spacing scale MUST be used throughout the product.

| Token 
| Value 
| Usage 

| xs 
| 4px 
| Tight spacing 

| sm 
| 8px 
| Related elements 

| md 
| 12px 
| Compact groups 

| lg 
| 16px 
| Default spacing 

| xl 
| 24px 
| Sections 

| 2xl 
| 32px 
| Large groups 

| 3xl 
| 48px 
| Major sections 

| 4xl 
| 64px 
| Exceptional separation 

No additional spacing values should be introduced without updating the Design System.
---
## 7.4 Screen Padding
Default horizontal padding:
Mobile
16px
Tablet
20px
Desktop
24px
Padding SHOULD remain visually consistent across screens.
Avoid excessive horizontal whitespace.
---
## 7.5 Vertical Rhythm
The interface SHOULD establish a consistent vertical rhythm.
Component spacing:
8–16px
Section spacing:
24–32px
Major layout separation:
48–64px
---
## 7.6 Dense Interfaces
CircleSfera prioritizes information density.
Interfaces SHOULD prefer compact spacing whenever readability is preserved.
Large empty areas are discouraged.
---
# 8. Layout Rules
## 8.1 Mobile First
Every new interface MUST begin with the following viewport.
390 × 844
No desktop layout should be created before the mobile implementation is complete.
---
## 8.2 Responsive Order
The required implementation order is:
1. Mobile
2. Small Mobile
3. Large Mobile
4. Tablet
5. Desktop
Skipping this order is prohibited.
---
## 8.3 Content Width
Layouts should maximize readable content.
Avoid unnecessarily narrow layouts.
Avoid extremely wide reading areas.
Feed width should remain comfortable regardless of monitor size.
---
## 8.4 Content Priority
Every screen MUST organize information using this priority.
Primary Content
↓
Primary Actions
↓
Secondary Content
↓
Metadata
↓
Decorative Elements
Decoration should never interrupt content.
---
## 8.5 Information Density
CircleSfera is designed to maximize useful information.
Every screen SHOULD expose as much content as possible without reducing readability.
If unnecessary whitespace reduces visible content, the layout should be redesigned.
---
## 8.6 Component Scaling
Responsive design adapts layouts.
Responsive design DOES NOT enlarge components.
Desktop implementations MUST increase available content instead of increasing component size.
Incorrect:
Bigger cards
Bigger buttons
Bigger avatars
Bigger typography
Correct:
Additional columns
Sidebar content
More visible information
Multi-column layouts
---
## 8.7 Grid System
Mobile
Single column.
Tablet
One or two columns depending on content.
Desktop
Multi-column layouts when appropriate.
Grid changes should improve information visibility.
Never increase component scale simply because additional width exists.
---
## 8.8 Alignment
Components MUST align to the design grid.
Random alignment creates unnecessary visual noise.
---
## 8.9 Viewport Utilization
Approximately 80–90% of the available viewport should contain useful information.
Avoid layouts dominated by empty space.
---
# 9. Component Sizing
## 9.1 General Principle
Components should remain human-sized.
They should never become larger merely because more screen space is available.
---
## 9.2 Buttons
Primary
48px
Secondary
44px
Compact
36px
Icon Button
40px
Large buttons should only appear in onboarding or authentication flows.
---
## 9.3 Inputs
Standard Height
48px
Compact
44px
Search
44px
Multi-line inputs should grow vertically according to content.
---
## 9.4 Navigation
Top Navigation
52px (`--nav-top-height` in `circlesfera-frontend/src/index.css`)
Bottom Navigation
60px (`--nav-bottom-height`) plus `safe-area-inset-bottom`
Sidebar Width
260–280px (`--nav-sidebar-width`: 260px)
These values MUST match the CSS tokens. Do not hardcode alternate heights in components.
---
## 9.5 Avatars
Extra Small
24px
Small
32px
Medium
40px
Large
56px (`--avatar-lg`; use `UserAvatar` size `lg`)
Profile
96px (`--avatar-profile`)
Large decorative avatars should be avoided.
---
## 9.6 Icons
Small
16px
Default
20px
Navigation
24px
Large
28px
Hero
32px
Icons larger than 32px should be exceptional.
---
## 9.7 Cards
Cards should grow according to content.
Avoid fixed heights.
Avoid decorative vertical padding.
Cards should contain only the space required by their contents.
---
## 9.8 Images
Images MUST preserve aspect ratio.
Supported ratios include:
1:1
4:5
16:9
9:16
Images should never stretch.
---
## 9.9 Lists
Lists SHOULD prioritize density.
Avoid excessive separation between rows.
Scrolling should reveal meaningful content quickly.
---
# 10. Responsive Behaviour
## 10.1 Mobile
The reference experience.
Everything is designed here first.
---
## 10.2 Tablet
Introduce additional layout flexibility.
Do not increase UI scale.
---
## 10.3 Desktop
Desktop should expose more information.
Examples:
Persistent sidebar
Secondary panels
Multiple columns
Additional analytics
Desktop MUST preserve the visual proportions established on mobile.
---
## 10.4 Large Displays
Large monitors should increase available content.
They MUST NOT produce oversized interfaces.
Avoid large empty margins.
---
## 10.5 Foldables
Foldable devices should behave as tablets when unfolded.
Maintain component proportions.
---
# 11. Layout Validation
Every screen MUST satisfy the following questions before implementation is considered complete.
✓ Was the screen designed for mobile first?
✓ Does it maximize visible content?
✓ Are component sizes consistent?
✓ Does it avoid oversized elements?
✓ Does it avoid unnecessary whitespace?
✓ Does it preserve visual hierarchy?
✓ Does it follow the spacing scale?
✓ Does it remain accessible?
✓ Does desktop adapt the layout instead of scaling the UI?
✓ Does the interface feel comparable to Instagram, Threads or X?
If any answer is NO,
the screen is not ready for production.

# 12. Component Principles
## 12.1 Component Philosophy
Every component MUST solve a specific problem.
Components exist to provide consistency, predictability and reusability.
Creating one-off components is strongly discouraged.
Whenever a new visual pattern appears repeatedly, it MUST become part of the Design System.
---
## 12.2 Composition
Components SHOULD be composed from smaller reusable primitives.
Avoid deeply coupled implementations.
Favor composition over duplication.
---
## 12.3 Consistency
Components performing the same action MUST behave identically across the platform.
Users should never need to relearn interactions.
---
## 12.4 States
Interactive components SHOULD define every possible state.
Required states include:
- Default
- Hover
- Active
- Focus
- Disabled
- Loading
- Success (when applicable)
- Error (when applicable)
No interactive component should exist without defined states.
---
## 12.5 Feedback
Every user action SHOULD produce immediate feedback.
Feedback may be:
- Visual
- Motion
- Haptic (mobile)
- Audio (optional)
Users should never wonder whether an interaction succeeded.
---
# 13. Component Standards
## 13.1 Buttons
Buttons represent the primary interaction method.
Primary buttons MUST be visually unique.
Only one primary action should exist within the same visual group.
Avoid multiple competing CTAs.
---
### Primary Button
Reserved for:
- Save
- Publish
- Continue
- Confirm
- Create
Should use the brand gradient.
---
### Secondary Button
Used for secondary actions.
Should remain visually quieter than the primary button.
---
### Ghost Button
Used inside dense interfaces.
Ideal for toolbars and contextual actions.
Should not compete with primary actions.
---
### Danger Button
Reserved exclusively for destructive actions.
Never use danger colors for emphasis.
---
### Icon Buttons
Should always include an accessible label.
Icons must remain visually centered.
Touch target MUST remain at least 44×44.
---
## 13.2 Inputs
Inputs should prioritize readability.
Avoid decorative borders.
Validation should appear immediately after user interaction.
Placeholder text should never replace labels.
---
## 13.3 Cards
Cards group related information.
Cards should never exist simply for decoration.
Avoid excessive nesting.
Recommended:
One level of card hierarchy.
Maximum:
Two.
---
## 13.4 Lists
Lists should remain visually compact.
Related items should remain grouped.
Scrolling should expose meaningful information quickly.
---
## 13.5 Dialogs
Dialogs interrupt the current workflow.
Only use them when necessary.
Avoid confirmation dialogs for reversible actions.
---
## 13.6 Bottom Sheets
Bottom Sheets are the preferred modal interaction on mobile.
Use them for:
- Menus
- Quick actions
- Filters
- Selection
Avoid fullscreen dialogs whenever possible.
---
## 13.7 Navigation
Navigation should always communicate:
Current location
Available destinations
Back navigation
Users should never feel lost.
---
## 13.8 Tabs
Tabs organize related content.
Avoid more than five primary tabs.
Additional destinations should move into secondary navigation.
---
## 13.9 Toolbars
Toolbars should expose frequently used actions.
Avoid overcrowding.
Less important actions belong inside overflow menus.
---
## 13.10 Empty States
Every empty state should explain:
Why nothing is displayed.
How to solve it.
What action can be taken.
Avoid generic illustrations without context.
---
## 13.11 Loading States
Every asynchronous operation SHOULD provide feedback.
Prefer Skeletons over spinners whenever content structure is known.
Avoid blocking the interface unnecessarily.
---
## 13.12 Error States
Errors should:
Explain the problem.
Suggest a solution.
Allow recovery.
Never blame the user.
---
# 14. Motion System
## 14.1 Philosophy
Motion communicates change.
Motion is not decoration.
Animations should improve understanding.
Never distract users.
---
## 14.2 Duration
Instant
0ms
Fast
150ms
Standard
250ms
Slow
350ms
Exceptional
500ms
Animations longer than 500ms require justification.
---
## 14.3 Easing
Default
Ease Out
Entering
Ease Out
Leaving
Ease In
Continuous
Linear
Spring interactions should be reserved for tactile interfaces.
---
## 14.4 Principles
Animations should be:
Smooth
Predictable
Interruptible
Responsive
Avoid theatrical animations.
---
## 14.5 Reduced Motion
The interface MUST respect operating system reduced-motion preferences.
Users requesting reduced motion should receive simplified transitions.
---
# 15. Interaction
## 15.1 Hover
Hover communicates availability.
Hover should never be required to understand the interface.
Touch devices do not support hover.
---
## 15.2 Focus
Every interactive element MUST expose a visible focus state.
Focus indicators should never be removed.
---
## 15.3 Active
Active states should provide immediate tactile feedback.
Scale reduction should remain subtle.
Avoid dramatic movement.
---
## 15.4 Selection
Selected items should remain visually obvious.
Selection should never rely exclusively on color.
---
## 15.5 Gestures
Supported gestures should remain consistent throughout the platform.
Avoid hidden gestures without visible alternatives.
---
## 15.6 Drag and Drop
Drag interactions should expose clear affordances.
Users should always understand what can be moved.
---
## 15.7 Swipe Actions
Swipe gestures should remain optional.
Every swipe action MUST also be accessible through visible controls.
---
## 15.8 Scrolling
Scrolling should feel natural.
Avoid unnecessary scroll locking.
Sticky elements should be used only when they improve usability.
---
# 16. Visual Effects
## 16.1 Philosophy
Visual effects create hierarchy.
They should never dominate the interface.
---
## 16.2 Glassmorphism
Glass surfaces should communicate elevation.
Recommended:
Navigation
Floating Panels
Bottom Navigation
Dialogs
Bottom Sheets
Avoid applying glass to every card.
Interfaces should not resemble frosted glass everywhere.
---
## 16.3 Blur
Blur should separate foreground from background.
Do not blur large areas unnecessarily.
Avoid stacking multiple blur layers.
---
## 16.4 Shadows
Shadows represent elevation.
Shadow intensity should increase gradually.
Avoid dramatic floating effects.
---
## 16.5 Gradients
Gradients communicate brand identity.
Use gradients primarily for:
Primary actions
Branding
Highlighted metrics
Avoid gradient overload.
---
## 16.6 Borders
Borders define separation.
Prefer subtle borders over heavy outlines.
High-contrast borders should communicate interaction.
---
## 16.7 Transparency
Transparency should improve depth.
Never reduce readability.
Text should always remain fully legible regardless of transparency.
---
## 16.8 Visual Noise
Before adding any visual effect ask:
Does this improve usability?
If the answer is no,
remove it.

# 17. Accessibility
## 17.1 Philosophy
Accessibility is a fundamental product requirement.
It MUST be considered during design, development and testing.
Accessibility is never a post-release improvement.
---
## 17.2 WCAG Compliance
All interfaces MUST satisfy WCAG 2.2 AA.
Whenever technically possible, AAA should be preferred.
Accessibility requirements cannot be sacrificed for visual aesthetics.
---
## 17.3 Contrast
Text MUST maintain sufficient contrast against its background.
Do not rely on transparency to reduce emphasis.
Use typography, spacing and hierarchy before reducing contrast.
---
## 17.4 Keyboard Navigation
Every interactive element MUST be accessible using only the keyboard.
Keyboard users should never become trapped within an interface.
Focus order MUST follow the visual reading order.
---
## 17.5 Focus Indicators
Visible focus indicators are mandatory.
Do not remove browser focus styles unless replaced by an equivalent or better implementation.
---
## 17.6 Screen Readers
Interactive components MUST expose meaningful labels.
Icons MUST include accessible names.
Decorative elements SHOULD be hidden from assistive technologies.
---
## 17.7 Touch Targets
Minimum touch area:
44 × 44px
Preferred touch area:
48 × 48px
Visual size may be smaller than touch size.
---
## 17.8 Motion Accessibility
Respect operating system preferences for reduced motion.
Animations should degrade gracefully.
---
# 18. Performance
## 18.1 Philosophy
Performance is a feature.
A visually attractive interface that performs poorly is considered incomplete.
---
## 18.2 Rendering
Interfaces SHOULD minimize unnecessary re-renders.
Prefer lightweight visual effects.
Avoid expensive layout recalculations.
---
## 18.3 Animations
Animate only:
Opacity
Transform
Avoid animating:
Width
Height
Top
Left
Margin
Box Shadow
Filter
unless strictly necessary.
---
## 18.4 Lazy Loading
Load content progressively.
Avoid blocking rendering with non-essential resources.
Images, videos and heavy components SHOULD load lazily whenever appropriate.
---
## 18.5 Perceived Performance
Users should receive immediate feedback.
Skeletons are preferred over indefinite loading indicators.
Avoid blank screens.
---
# 19. Engineering Standards
## 19.1 Design Tokens
Every visual property MUST originate from a design token.
Avoid hardcoded values.
Examples include:
- Colors
- Spacing
- Typography
- Radius
- Elevation
- Motion
- Blur
- Z-index
---
## 19.2 Reusability
Before creating a new component ask:
Can an existing component solve this problem?
Prefer extending existing components over creating new ones.
---
## 19.3 Variants
Component variations SHOULD use variants rather than duplicated implementations.
Visual consistency is more important than individual customization.
---
## 19.4 Exceptions
Exceptions are discouraged.
If an exception becomes recurring, the Design System MUST evolve instead.
---
## 19.5 Documentation
Every reusable component SHOULD include:
Purpose
Variants
States
Accessibility notes
Usage examples
Implementation notes
---
# 20. Design Review Process
Every new screen MUST pass the following review.
---
## Step 1
Validate layout.
Questions:
Is the hierarchy correct?
Is content prioritized?
Is whitespace intentional?
---
## Step 2
Validate responsiveness.
Questions:
Was the screen designed for mobile first?
Does desktop add information rather than scaling components?
---
## Step 3
Validate accessibility.
Questions:
Is contrast sufficient?
Can every interaction be reached?
Are focus states visible?
---
## Step 4
Validate consistency.
Questions:
Does every component follow the Design System?
Are design tokens respected?
Were unnecessary exceptions introduced?
---
## Step 5
Validate performance.
Questions:
Are animations lightweight?
Are unnecessary effects avoided?
Can rendering remain smooth?
---
Only after passing every review step should implementation be considered complete.
---
# 21. Quality Checklist
Every production-ready interface MUST satisfy the following checklist.
## Layout
☐ Mobile First
☐ Proper hierarchy
☐ Balanced whitespace
☐ High information density
☐ Responsive
☐ Grid aligned
---
## Components
☐ Design tokens used
☐ Consistent sizing
☐ Proper states
☐ Accessible interactions
☐ No duplicated patterns
---
## Visual
☐ Typography hierarchy
☐ Semantic colors
☐ Proper elevation
☐ Appropriate motion
☐ Consistent branding
---
## Accessibility
☐ WCAG compliant
☐ Keyboard accessible
☐ Visible focus
☐ Screen reader friendly
☐ Proper touch targets
---
## Performance
☐ Optimized rendering
☐ Efficient animations
☐ Lazy loading where appropriate
☐ No unnecessary visual effects
---
If any item remains unchecked,
the interface MUST NOT be considered production-ready.
---
# 22. AI Agent Implementation Rules
These rules apply to AI-assisted development tools including Antigravity, Cursor and future coding agents.
---
## 22.1 Before Writing Code
The AI MUST determine:
Which existing components already solve the problem.
Whether new variants are required.
Whether new design tokens are necessary.
Whether existing layout patterns can be reused.
---
## 22.2 Before Creating UI
The AI MUST verify:
Mobile implementation exists.
Spacing follows the spacing scale.
Typography follows the typography scale.
Component sizing follows the Design System.
Layout maximizes useful content.
No oversized UI exists.
---
## 22.3 Before Finishing
The AI MUST compare the implementation against:
Instagram
Threads
X
Questions:
Does the layout expose enough information?
Are components visually oversized?
Is unnecessary whitespace present?
Does the interface feel native?
If any answer indicates a poorer experience,
the implementation MUST be revised.
---
## 22.4 Forbidden Behaviors
The AI MUST NOT:
Invent spacing values.
Invent typography scales.
Invent colors.
Invent shadows.
Invent border radii.
Invent animations.
Scale UI because additional screen space exists.
Create inconsistent components.
Ignore accessibility.
Duplicate existing patterns.
---
## 22.5 Required Behaviors
The AI MUST:
Reuse components.
Respect design tokens.
Prioritize content.
Prefer simplicity.
Keep interfaces compact.
Maximize information density.
Design mobile first.
Maintain consistency.
Optimize performance.
Validate accessibility.
---
# 23. Golden Rules
These principles override every other recommendation.
1.
Content is the product.
The interface exists to support content.
---
1.
Design mobile first.
Desktop is an adaptation.
Never the opposite.
---
1.
Every pixel must have a purpose.
---
1.
Prefer systems over exceptions.
---
1.
Consistency is more valuable than novelty.
---
1.
Performance is part of the user experience.
---
1.
Accessibility is mandatory.
---
1.
Responsive design adapts layouts.
It does not enlarge interfaces.
---
1.
Users should always see more content than interface.
---
1.
If a design decision requires explanation,
it is probably too complex.
Simplify it.