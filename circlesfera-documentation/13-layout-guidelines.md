# CircleSfera Layout Guidelines
> **Fuente canónica**: [Notion — CircleSfera Layout Guidelines](https://app.notion.com/p/CircleSfera-Layout-Guidelines-3b2dfa08f2f580e9818fd46c6d2ff8f7)
> **Sincronizado**: Agosto 2026 | **Versión Notion**: 1.0.0 | **Status**: Official

---

Version: 1.0.0
Status: Official
Last Updated: August 2026
---
# 1. Purpose
This document defines how every screen inside the CircleSfera ecosystem should be structured.
Unlike the Design System, which defines visual language and reusable components, the Layout Guidelines define:
- Layout composition
- Information hierarchy
- Screen organization
- Responsive behavior
- Content density
- Spatial relationships
- Navigation patterns
This document is the single source of truth for every screen layout.
---
# 2. Design Philosophy
CircleSfera is a content platform.
Layouts exist to maximize content visibility.
The objective is to expose as much useful information as possible while maintaining clarity and readability.
Decoration must never reduce visible content.
---
# 3. Mobile First
Every screen MUST begin from mobile.
Reference viewport
390 × 844
Desktop is an adaptation.
Tablet is an adaptation.
Large screens expose more information.
They never enlarge the interface.
---
# 4. Layout Principles
## Principle 1
Content First
Content always occupies the largest visual area.
---
## Principle 2
Predictable Structure
Every screen should feel immediately familiar.
Users should never wonder where important information is located.
---
## Principle 3
High Information Density
CircleSfera prioritizes useful information.
Large empty spaces are discouraged.
The amount of visible information should be comparable to:
Instagram
Threads
X
---
## Principle 4
One-Handed Usage
The most frequently used interactions should remain easily reachable.
Primary actions should stay inside the thumb zone whenever possible.
---
## Principle 5
Consistent Navigation
Navigation patterns should remain identical across the application.
Avoid changing interaction models between sections.
---
# 5. Information Hierarchy
Every screen follows this hierarchy.
Primary Content
↓
Primary Actions
↓
Secondary Content
↓
Metadata
↓
Decoration
Decoration must never compete with content.
---
# 6. Viewport Utilization
Every layout should maximize useful information.
Recommended viewport usage
80–90%
Avoid:
Large empty margins
Huge headers
Oversized cards
Decorative spacing
Dead zones
---
# 7. Responsive Strategy
Responsive means:
Adapting layout.
Not scaling UI.
Correct examples
More columns
Persistent sidebars
Additional contextual information
Incorrect examples
Bigger buttons
Bigger typography
Larger cards
Larger avatars
Oversized navigation
---
# 8. Screen Categories
CircleSfera screens belong to one of the following categories.
Content
Examples
Feed
Post
Story
Frame
Explore
Messaging
Examples
Chat
Conversation
Calls
Creation
Examples
Create Post
Editor
CircleSfera Studio
Creator Dashboard
Management
Examples
Settings
Notifications
Bookmarks
Collections
Administration
Examples
Admin Dashboard
Reports
Moderation
Analytics
Every category follows dedicated layout rules.
---
# 9. Common Screen Structure
Every primary screen should follow this order.
Navigation
↓
Context
↓
Primary Content
↓
Secondary Content
↓
Supporting Actions
↓
Safe Area
Avoid changing this structure.
---
# 10. Header Rules
Headers provide orientation.
Headers should remain compact.
Recommended height
52px (`--nav-top-height`)
Headers should never dominate the interface.
Avoid hero headers inside the application.
---
# 11. Content Containers
Containers organize information.
Containers should never become decorative.
Use containers only when they improve:
Hierarchy
Grouping
Interaction
Avoid container nesting.
Maximum recommended depth
2
---
# 12. Scrolling
Scrolling should reveal meaningful content immediately.
Avoid:
Large blank areas
Decorative separators
Long introductions
Users should reach content with minimal scrolling.
---
# 13. Safe Areas
Respect operating system safe areas.
Never place interactive controls underneath:
Dynamic Island
Status Bar
Home Indicator
Gesture Areas
Safe areas are mandatory.
---
# 14. Reading Flow
Users should naturally scan the interface from top to bottom.
Every screen should support fast visual scanning.
Important content should appear early.
Avoid interrupting reading flow with decorative elements.
---
# 15. White Space
Whitespace exists to improve readability.
Whitespace should never reduce information density.
Before adding spacing ask:
Does this improve comprehension?
If not,
remove it.
---
# 16. Layout Validation
Every layout MUST answer YES to the following.
✓ Mobile designed first
✓ Content immediately visible
✓ Compact hierarchy
✓ No oversized elements
✓ Balanced whitespace
✓ Efficient scrolling
✓ Consistent navigation
✓ Responsive adaptation
✓ Information prioritized
✓ Comparable density to Instagram
If any answer is NO,
the layout is incomplete.

# 17. Feed Layout
## 17.1 Purpose
The Feed is the primary experience of CircleSfera.
Every design decision should maximize content discovery, readability and interaction efficiency.
The Feed is not a gallery.
The Feed is not a dashboard.
The Feed is a continuous content stream.
Users should remain focused on content rather than interface elements.
---
## 17.2 Layout Structure
The standard Feed structure is:
Safe Area
↓
Top Navigation
↓
Feed
↓
Bottom Navigation (Mobile)
---
Desktop introduces additional side panels.
The Feed remains the visual center.
---
## 17.3 Feed Width
### Mobile
Full width.
Respect horizontal padding.
---
### Tablet
Centered.
Single column.
Optional contextual side panel.
---
### Desktop
Centered content.
Maximum readable width.
Additional information belongs in sidebars.
Never stretch Feed cards to occupy the entire monitor width.
---
## 17.4 Feed Density
The Feed should expose as many posts as possible.
Avoid excessive vertical spacing.
Recommended spacing between posts:
12–16px
Avoid large empty separators.
---
## 17.5 Post Composition
Every post follows this structure:
Author
↓
Content
↓
Media
↓
Actions
↓
Metadata
↓
Comments Preview (optional)
The order should remain consistent.
---
## 17.6 Author Section
Contains:
Avatar
Display Name
Username
Verification
Timestamp
Visibility
More Menu
Height should remain compact.
Never dominate the post.
---
## 17.7 Text Content
Text appears before media.
Long text should collapse gracefully.
Expansion should not interrupt scrolling.
Avoid unnecessary line spacing.
---
## 17.8 Media
Media is the visual focus.
Media should preserve original aspect ratio whenever possible.
Supported formats:
1:1
4:5
16:9
9:16
Do not crop important content.
Avoid decorative framing.
---
## 17.9 Multi-Media Posts
Multiple media should remain swipeable.
Indicators should remain subtle.
Never reduce media excessively.
---
## 17.10 Action Bar
Contains:
Like
Comment
Share
Save
Optional creator actions
Buttons should remain compact.
Actions should be easy to reach using one thumb.
---
## 17.11 Metadata
Metadata appears after actions.
Includes:
Views
Likes
Comments
Reposts
Location (optional)
Metadata should never compete with content.
---
## 17.12 Comments Preview
Display only the most relevant comments.
Avoid loading large comment trees directly inside the Feed.
Provide an obvious path to the full discussion.
---
## 17.13 Infinite Scroll
Infinite scrolling is the default Feed behavior.
Loading should appear seamless.
Users should never encounter abrupt interruptions.
---
## 17.14 Loading
Use Skeletons.
Avoid full-screen loading indicators.
Loading should preserve layout stability.
---
## 17.15 Empty Feed
Explain:
Why no content is available.
How users can populate their Feed.
Provide one clear call-to-action.
---
## 17.16 Feed Refresh
Pull-to-refresh on mobile.
Top refresh indicator.
Preserve scroll position whenever possible.
---
## 17.17 Scroll Behavior
Scrolling should remain smooth.
Avoid layout shifts.
Avoid unnecessary sticky elements.
The Feed should always feel fluid.
---
## 17.18 Scroll Restoration
Returning from:
Profile
Comments
Search
Notifications
should restore the previous Feed position.
Users should never lose context.
---
## 17.19 Performance
Virtualize Feed rendering.
Lazy-load images.
Lazy-load videos.
Defer off-screen content.
Keep memory usage predictable.
---
## 17.20 Feed Quality Rules
The Feed MUST satisfy:
✓ High information density
✓ Fast scanning
✓ Consistent spacing
✓ Predictable interaction
✓ Minimal layout shift
✓ Responsive behavior
✓ Smooth scrolling
✓ Compact controls
✓ Maximum content visibility
✓ Stable rendering
Failure to satisfy any rule requires layout revision.

# 18. Post Detail
## 18.1 Purpose
The Post Detail screen expands a single post into a focused reading experience.
Its primary objective is to encourage conversation without distracting from the original content.
Users should always understand that the post remains the primary element.
Comments are secondary.
---
## 18.2 Layout Structure
Safe Area
↓
Navigation Bar
↓
Post
↓
Interaction Summary
↓
Comments Composer
↓
Comments List
The original post remains pinned at the top of the discussion.
---
## 18.3 Header
Height:
56–64px
Contains:
- Back
- Screen title (optional)
- Overflow actions
Headers should remain compact.
---
## 18.4 Original Post
Display exactly as rendered inside the Feed.
Avoid introducing visual differences.
Users should immediately recognize the content.
---
## 18.5 Interaction Summary
Display:
- Likes
- Comments
- Shares
- Saves
- Views (if applicable)
Statistics should remain compact.
Avoid dashboard-style layouts.
---
## 18.6 Comment Composer
Always visible.
Contains:
- Avatar
- Text input
- Attachments (optional)
- Emoji
- Send
The send action should become active only when valid content exists.
---
## 18.7 Comments
Comments are displayed chronologically or according to the selected sorting method.
Nested replies should remain visually compact.
Maximum indentation:
One reply level.
Additional nesting should collapse into threaded views.
---
## 18.8 Sorting
Supported sorting:
- Most Relevant
- Newest
- Oldest
Changing sorting should preserve user context.
---
## 18.9 Pagination
Comments should load progressively.
Avoid rendering extremely large discussions at once.
---
## 18.10 Interaction
Supported interactions:
Like
Reply
Copy
Translate (future)
Report
Delete (owner)
Context menus should remain consistent.
---
## 18.11 Performance
Virtualize long discussions.
Preserve scroll position.
Avoid layout shifts.
---
## 18.12 Accessibility
Comments must remain keyboard accessible.
Composer should support screen readers.
Reply hierarchy should remain understandable using assistive technologies.
---
## 18.13 Validation
✓ Original post identical to Feed
✓ Composer always accessible
✓ Compact hierarchy
✓ Progressive loading
✓ Smooth scrolling
✓ Accessible interactions
---
# 19. Create Post
## 19.1 Purpose
The Create Post experience should minimize friction between intent and publication.
Users should be able to publish content quickly while retaining access to advanced capabilities.
Simple publishing is the default.
Advanced options remain progressively disclosed.
---
## 19.2 Layout Structure
Navigation
↓
Composer
↓
Attachments
↓
Audience
↓
Advanced Options (collapsed)
↓
Publish Button
---
## 19.3 Composer
The text composer is the primary element.
It should receive focus immediately.
Placeholder text should encourage meaningful content without being intrusive.
---
## 19.4 Media Picker
Supports:
Images
Videos
GIFs
Future media types
Selected media should appear in the same order in which they will be published.
---
## 19.5 Preview
Users should always preview attached content.
Preview must preserve original aspect ratio.
Avoid aggressive cropping.
---
## 19.6 Audience
Supported visibility:
Public
Followers
Private
Custom audiences (future)
Visibility selection should remain immediately understandable.
---
## 19.7 Scheduling
Scheduling belongs inside Advanced Options.
Default publishing behavior is immediate publication.
Advanced scheduling should never complicate basic publishing.
---
## 19.8 Drafts
Drafts should save automatically.
Users should never lose work due to accidental navigation.
---
## 19.9 Validation
Before publishing verify:
Media processed
Required fields valid
Permissions granted
Connectivity available
Validation should happen before network requests whenever possible.
---
## 19.10 Publishing
Publishing should provide immediate feedback.
Show progress.
Allow cancellation while possible.
Avoid blocking the interface.
---
## 19.11 Success
After successful publication:
Display confirmation.
Return users naturally to the previous context.
Do not interrupt browsing unnecessarily.
---
## 19.12 Error Handling
Publishing failures should:
Explain the problem.
Preserve the draft.
Allow retry.
Never discard user content.
---
## 19.13 Accessibility
Composer must support:
Keyboard navigation
Voice input
Screen readers
Dynamic font sizes
---
## 19.14 Validation
✓ Fast publishing
✓ Draft protection
✓ Responsive composer
✓ Accessible controls
✓ Progressive disclosure
✓ Compact layout
✓ Minimal friction
✓ Reliable recovery

# 20. Stories
## 20.1 Purpose
Stories provide lightweight, temporary content intended for rapid consumption.
Stories should prioritize immediacy over permanence.
The experience must feel immersive, effortless and interruption-free.
---
## 20.2 General Principles
Stories are displayed vertically.
Navigation should require minimal effort.
UI should remain secondary to media.
Users should focus on content, not controls.
---
## 20.3 Story Structure
Each Story contains:
Author
↓
Media
↓
Interactive Elements
↓
Progress Indicators
The media occupies the majority of the viewport.
---
## 20.4 Header
Contains:
Avatar
Display Name
Timestamp
More Menu
The header overlays media.
Use gradients only when necessary to preserve readability.
---
## 20.5 Progress Indicators
Progress indicators appear at the top.
One segment per Story.
Current segment animates progressively.
Indicators must remain visible on every media type.
---
## 20.6 Navigation
Supported gestures:
Tap Left
Previous Story
Tap Right
Next Story
Swipe Left
Next User
Swipe Right
Previous User
Swipe Down
Dismiss
Long Press
Pause
Navigation should remain consistent throughout the application.
---
## 20.7 Story Duration
Images
Default duration.
Videos
Play until completion.
Users should never feel rushed.
---
## 20.8 Interactive Elements
Stories may contain:
Replies
Reactions
Links
Mentions
Location
Music
Polls (future)
Interactive elements should never obstruct essential media.
---
## 20.9 Safe Areas
Important media should never occupy:
Status Bar
Progress Indicators
Bottom Interaction Area
Respect safe areas at all times.
---
## 20.10 Loading
Preload:
Next Story
Previous Story
Media transitions should appear instantaneous.
---
## 20.11 Performance
Decode media before presentation.
Avoid visible loading.
Maintain smooth transitions.
---
## 20.12 Accessibility
Stories should remain fully usable without gesture-only navigation.
Alternative controls should always exist.
---
## 20.13 Validation
✓ Immersive media
✓ Minimal UI
✓ Fast transitions
✓ Consistent gestures
✓ Smooth playback
✓ Safe areas respected
✓ Accessible controls
---
# 21. Frames
## 21.1 Purpose
Frames are CircleSfera's short-form video experience.
The objective is continuous content discovery with minimal interaction cost.
Frames prioritize immersion while maintaining immediate access to creator actions.
---
## 21.2 Layout Structure
Video
↓
Overlay Information
↓
Creator Actions
↓
Navigation
Video occupies the entire background.
UI floats above the content.
---
## 21.3 Video
Video always remains the primary visual element.
Respect original aspect ratio whenever possible.
Avoid unnecessary cropping.
---
## 21.4 Overlay
Overlay contains:
Creator
Caption
Music
Location (optional)
Views
Overlay opacity should remain minimal.
Maintain readability without hiding content.
---
## 21.5 Action Rail
Vertical actions include:
Like
Comment
Share
Save
Follow
Profile
Actions should remain reachable using one thumb.
---
## 21.6 Caption
Captions remain collapsed initially.
Expansion should not interrupt playback.
Long descriptions expand only on demand.
---
## 21.7 Audio
Audio information remains associated with the current Frame.
Users should immediately identify the active sound.
---
## 21.8 Progress
Video progress appears subtly.
Avoid visually dominant progress bars.
---
## 21.9 Navigation
Vertical swipe
Next Frame
Reverse swipe
Previous Frame
Tap
Play / Pause
Long Press
Temporary Pause
Gestures should remain predictable.
---
## 21.10 Performance
Preload adjacent Frames.
Only active video should decode.
Pause off-screen playback immediately.
---
## 21.11 Infinite Feed
Frames use continuous vertical scrolling.
Avoid pagination.
Maintain uninterrupted discovery.
---
## 21.12 Creator Information
Display:
Avatar
Display Name
Username
Verification
Follow Button
Creator identity should remain immediately recognizable.
---
## 21.13 Related Actions
Additional actions belong inside contextual menus.
Avoid cluttering the primary interface.
---
## 21.14 Accessibility
Playback controls must remain accessible.
Captions should support screen readers.
Touch targets must satisfy accessibility requirements.
---
## 21.15 Validation
✓ Immersive experience
✓ Stable playback
✓ Minimal overlays
✓ Accessible controls
✓ Smooth navigation
✓ High performance
✓ Compact interface

# 22. Profile
## 22.1 Purpose
The Profile is the identity hub of every CircleSfera account.
Its purpose is to present identity, content and relationships in a structured and efficient way.
The profile should maximize discoverability while minimizing unnecessary scrolling.
---
## 22.2 Layout Structure
Safe Area
↓
Profile Header
↓
Identity Summary
↓
Primary Actions
↓
Profile Navigation
↓
Content
---
## 22.3 Profile Header
The header remains compact.
Recommended height:
56–64px
Contains:
- Back
- Username
- Search (optional)
- Overflow Menu
The header should not duplicate information already visible in the profile.
---
## 22.4 Identity Summary
Contains:
- Avatar
- Display Name
- Username
- Verification Badge
- Bio
- Links
- Category (optional)
- Location (optional)
Identity information should fit within the first viewport whenever possible.
---
## 22.5 Avatar
Avatar sizes:
Profile Owner
96px
Visitors
80–96px
The avatar should remain prominent without dominating the layout.
---
## 22.6 Statistics
Display:
Posts
Followers
Following
Optional metrics:
Likes
Views
Subscribers
Statistics should remain horizontally aligned.
Avoid oversized counters.
---
## 22.7 Primary Actions
Owner:
Edit Profile
Share Profile
Professional Tools (if applicable)
Visitor:
Follow
Message
Share
Actions should remain immediately accessible.
---
## 22.8 Bio
The bio should prioritize readability.
Collapse only when necessary.
Links should remain clearly distinguishable.
---
## 22.9 Highlights
Highlights appear below the identity section.
Display as a horizontal scroll.
Maintain consistent spacing.
Avoid oversized highlight covers.
---
## 22.10 Profile Navigation
Supported tabs:
Posts
Frames
Media
Tagged
Saved (Owner only)
Additional tabs should remain justified by user value.
---
## 22.11 Content Grid
Grid spacing:
4px
Respect original aspect ratios for previews.
Avoid decorative padding.
Scrolling should reveal content immediately.
---
## 22.12 Empty Profiles
Explain why content is unavailable.
Provide contextual actions where appropriate.
Avoid generic illustrations.
---
## 22.13 Pinned Content
Pinned content appears before chronological content.
Maximum:
Three pinned items.
Pinned content should remain visually distinguishable without disrupting the feed.
---
## 22.14 Infinite Scroll
Profile content loads progressively.
Preserve scroll position when returning from detail screens.
---
## 22.15 Responsive Behavior
### Mobile
Single column.
Content-first.
---
### Tablet
Centered layout.
Additional spacing only where beneficial.
---
### Desktop
Centered profile.
Optional side panels for additional information.
Never enlarge profile components.
---
## 22.16 Accessibility
All profile actions must remain keyboard accessible.
Statistics should be understandable by assistive technologies.
---
## 22.17 Performance
Virtualize long content grids.
Lazy-load thumbnails.
Preload visible media.
Avoid unnecessary layout shifts.
---
## 22.18 Validation
✓ Compact identity section
✓ Immediate content visibility
✓ Consistent actions
✓ Responsive layout
✓ Accessible interactions
✓ Efficient scrolling
✓ Stable rendering
✓ High information density
---
# 23. Profile Variants
## 23.1 Personal Profile
Primary objective:
Identity and social interactions.
Focus on personal content.
---
## 23.2 Creator Profile
Additional sections may include:
Subscriptions
Exclusive Content
Professional Statistics
Creator Links
Monetization
Professional actions should remain secondary to content.
---
## 23.3 Business Profile
Additional sections may include:
Business Information
Contact Options
Opening Hours (if applicable)
Products
Services
Verified Business Information
Commercial information should integrate naturally into the profile.
---
## 23.4 Private Profiles
Private profiles should expose:
Identity
Bio
Statistics
Mutual Connections (optional)
Content remains protected until access is granted.
---
## 23.5 Verified Profiles
Verification should communicate authenticity.
Badges should never dominate the visual hierarchy.
---
## 23.6 Suspended Profiles
Explain:
Why access is restricted (when appropriate).
Available actions.
Avoid exposing unnecessary moderation details.
---
## 23.7 Deactivated Profiles
Clearly communicate that the profile is unavailable.
Maintain consistent navigation behavior.

# 24. Explore
## 24.1 Purpose
Explore is the primary content discovery experience.
Its objective is to help users discover relevant creators, communities and media beyond their existing network.
The experience should prioritize exploration over chronology.
---
## 24.2 Layout Structure
Safe Area
↓
Search Bar
↓
Discovery Filters
↓
Content Grid
↓
Progressive Loading
---
## 24.3 Search Bar
The search bar remains permanently accessible.
Recommended height:
44–48px
Selecting the search bar transitions to the Search screen.
---
## 24.4 Discovery Filters
Filters should remain horizontally scrollable.
Examples:
Trending
Following Interests
Creators
Frames
Posts
Media
Communities (future)
Events (future)
Only the most valuable filters should appear.
---
## 24.5 Content Grid
The grid should maximize discoverability.
Spacing:
2–4px
Allow different media aspect ratios while preserving visual balance.
Avoid excessive empty space.
---
## 24.6 Recommendations
Recommendations should prioritize:
Relevance
Freshness
Diversity
User interests
Avoid excessive repetition from the same creator.
---
## 24.7 Trending Content
Trending sections should clearly communicate why content is trending.
Examples:
Trending in your country
Trending globally
Trending among your interests
Transparency improves user trust.
---
## 24.8 Topic Collections
Related content may be grouped into thematic collections.
Collections should remain visually compact.
---
## 24.9 Infinite Scroll
Content loads continuously.
Maintain stable scrolling performance.
---
## 24.10 Refresh
Support pull-to-refresh on mobile.
Preserve current filters.
---
## 24.11 Empty States
Explain:
No recommendations available.
No matching content.
How recommendations improve over time.
---
## 24.12 Performance
Virtualize the grid.
Lazy-load thumbnails.
Decode media before display.
---
## 24.13 Accessibility
Filters must remain keyboard accessible.
Grid navigation should remain predictable.
Screen readers should understand collection boundaries.
---
## 24.14 Validation
✓ High content density
✓ Relevant recommendations
✓ Smooth scrolling
✓ Compact layout
✓ Fast discovery
✓ Stable rendering
✓ Accessible filters
---
# 25. Search
## 25.1 Purpose
Search enables users to locate people, content, hashtags and future entities quickly and accurately.
Search should prioritize speed, clarity and precision.
---
## 25.2 Layout Structure
Safe Area
↓
Search Field
↓
Recent Searches
↓
Suggested Searches
↓
Results
---
## 25.3 Search Field
The input receives focus immediately.
Display the keyboard automatically on mobile.
Searching should begin progressively as users type.
---
## 25.4 Search Suggestions
Suggestions may include:
Users
Creators
Posts
Frames
Hashtags
Locations
Audio (future)
Communities (future)
Suggestions should update continuously.
---
## 25.5 Recent Searches
Recent searches should remain private.
Users may:
Delete individual entries.
Clear all history.
Disable history.
---
## 25.6 Results
Results are organized into categories.
Examples:
Top
People
Posts
Frames
Media
Hashtags
Tabs should remain horizontally scrollable.
---
## 25.7 Ranking
Search results prioritize:
Exact matches
Relevant matches
Verified accounts
Popularity
Freshness
Ranking should remain predictable.
---
## 25.8 Empty Results
Clearly explain:
No results found.
Suggested alternatives.
Related searches.
Avoid dead-end experiences.
---
## 25.9 Search History
History should improve future searches.
Never expose private searches to other users.
---
## 25.10 Voice Search (Future)
Voice search should integrate naturally into the existing search interface.
Avoid creating separate experiences.
---
## 25.11 Performance
Debounce search requests.
Cancel obsolete requests immediately.
Cache recent results when appropriate.
Avoid unnecessary API calls.
---
## 25.12 Accessibility
Search must support:
Keyboard navigation
Screen readers
Dynamic font sizes
Voice input (future)
---
## 25.13 Validation
✓ Fast response
✓ Predictable ranking
✓ Clear categories
✓ Accessible controls
✓ Smooth transitions
✓ Progressive loading
✓ Reliable search history

# 26. Chat
## 26.1 Purpose
Chat enables direct and group communication between users.
The primary objective is to provide a fast, reliable and distraction-free messaging experience.
Conversations should always remain the focus of the interface.
---
## 26.2 Layout Structure
Safe Area
↓
Conversation Header
↓
Messages
↓
Composer
↓
Safe Area
The composer should remain permanently accessible.
---
## 26.3 Conversation List
The conversation list should prioritize recency.
Each conversation displays:
- Avatar
- Display Name
- Last Message
- Timestamp
- Unread Indicator
- Mute Indicator (optional)
Avoid oversized conversation rows.
Recommended height:
68–76px
---
## 26.4 Conversation Header
Contains:
- Back
- Avatar
- Display Name
- Online Status (optional)
- Call Actions
- Overflow Menu
Height:
56–64px
The header should remain compact.
---
## 26.5 Message Layout
Messages should follow a predictable structure.
Incoming:
Left aligned.
Outgoing:
Right aligned.
System messages remain centered.
Spacing between consecutive messages from the same sender should be reduced.
---
## 26.6 Message Bubble
Message bubbles should adapt to content.
Avoid fixed widths.
Maximum width:
Approximately 70% of the available space.
Messages should remain easily readable.
---
## 26.7 Supported Message Types
Text
Images
Videos
Voice Messages
Files
GIFs
Links
Location (future)
Polls (future)
All message types should share the same visual language.
---
## 26.8 Composer
The composer remains permanently visible.
Contains:
- Text Input
- Media Picker
- Voice Recording
- Emoji
- Send Button
The Send button activates only when valid content exists.
---
## 26.9 Attachments
Attachments appear above the composer before sending.
Users should always preview media before confirming.
---
## 26.10 Voice Messages
Voice recordings should display:
Duration
Waveform
Playback controls
Playback speed (future)
Voice playback must continue smoothly while scrolling.
---
## 26.11 Read Status
Support:
Sent
Delivered
Read
Failed
Status indicators should remain subtle.
---
## 26.12 Typing Indicator
Typing indicators should appear below the latest message.
Avoid excessive animations.
---
## 26.13 Date Separators
Messages should be grouped naturally by date.
Date separators remain visually lightweight.
---
## 26.14 Search
Conversation search should locate:
Messages
Media
Files
Links
Search should preserve current conversation context.
---
## 26.15 Infinite History
Older messages load progressively.
Never block the conversation while loading history.
---
## 26.16 Performance
Virtualize long conversations.
Lazy-load media.
Cache recent messages.
Avoid unnecessary layout shifts.
---
## 26.17 Accessibility
Messages should support:
Keyboard navigation
Screen readers
Dynamic text scaling
VoiceOver/TalkBack actions
Touch targets must satisfy accessibility requirements.
---
## 26.18 Validation
✓ Compact conversation list
✓ Smooth scrolling
✓ Persistent composer
✓ Stable message rendering
✓ Responsive layout
✓ Accessible interactions
✓ Reliable loading
---
# 27. Messaging Extensions
## 27.1 Group Conversations
Display:
Group Name
Participants
Group Avatar
Unread Count
Typing Indicators
Group information should remain immediately understandable.
---
## 27.2 Media Gallery
Each conversation should expose:
Images
Videos
Files
Links
Voice Messages
Media loads progressively.
---
## 27.3 Shared Files
Shared files should remain searchable.
Display:
Filename
Size
Type
Upload Date
---
## 27.4 Pinned Messages
Pinned messages appear at the top of the conversation.
Maximum:
Five pinned messages.
Pinned messages should not reduce available conversation space.
---
## 27.5 Message Reactions
Reactions appear beneath messages.
Display only the most relevant reactions.
Avoid visual clutter.
---
## 27.6 Message Replies
Replies reference the original message.
The reference should remain compact.
Selecting a reply should navigate to the original message.
---
## 27.7 Message Editing
Edited messages should indicate that modifications occurred.
Do not expose edit history within the main conversation.
---
## 27.8 Message Deletion
Support:
Delete for Me
Delete for Everyone (where permitted)
Deletion actions should require clear confirmation only when irreversible.
---
## 27.9 Empty Conversations
Encourage users to begin the conversation.
Provide contextual suggestions when appropriate.
Avoid generic placeholder illustrations.
---
## 27.10 Validation
✓ Efficient conversations
✓ Minimal interface
✓ Fast messaging
✓ Predictable interactions
✓ Progressive loading
✓ High accessibility
✓ Stable performance

# 28. Notifications
## 28.1 Purpose
Notifications inform users about relevant activity without overwhelming them.
The experience should prioritize clarity, relevance and efficient triage.
Notifications should help users return to meaningful interactions.
---
## 28.2 Layout Structure
Safe Area
↓
Navigation Header
↓
Filter Tabs
↓
Notification List
↓
Progressive Loading
---
## 28.3 Header
Recommended height:
56–64px
Contains:
- Back (when applicable)
- Title
- Mark All as Read
- Settings
- Overflow Menu
The header should remain compact.
---
## 28.4 Filter Tabs
Suggested filters:
All
Mentions
Replies
Likes
Follows
Reposts
Subscriptions
System
Tabs should be horizontally scrollable when necessary.
---
## 28.5 Notification Item
Each notification contains:
- Actor Avatar
- Actor Name
- Action Description
- Related Content Preview (optional)
- Timestamp
- Read Indicator
Items should remain compact and easy to scan.
Recommended height:
72–88px
---
## 28.6 Read State
Unread notifications should remain visually distinguishable.
Do not rely exclusively on color.
Support:
- Individual read
- Mark all as read
---
## 28.7 Grouping
Related notifications may be grouped.
Example:
"12 users liked your post."
Grouping reduces visual noise.
---
## 28.8 Context Actions
Each notification may expose:
Open
Mute
Hide Similar
Delete
Report (system notifications)
Contextual actions should remain secondary.
---
## 28.9 Infinite Scroll
Notifications load progressively.
Preserve scroll position when returning from linked content.
---
## 28.10 Empty State
Explain why no notifications exist.
Suggest meaningful actions.
Avoid decorative placeholders.
---
## 28.11 Performance
Virtualize long lists.
Lazy-load avatars and previews.
Avoid layout shifts.
---
## 28.12 Accessibility
Notifications should support:
Keyboard navigation
Screen readers
Dynamic font scaling
Visible focus indicators
---
## 28.13 Validation
✓ Easy scanning
✓ Compact layout
✓ Predictable grouping
✓ Efficient filtering
✓ Accessible interactions
✓ Stable rendering
---
# 29. Bookmarks
## 29.1 Purpose
Bookmarks allow users to save content for future reference.
Saving content should feel effortless.
Retrieving saved content should be equally efficient.
---
## 29.2 Layout Structure
Safe Area
↓
Header
↓
Collections Filter
↓
Saved Content
---
## 29.3 Header
Contains:
Title
Search
Manage Collections
Overflow Menu
---
## 29.4 Saved Items
Display saved content using the same visual language as the original content.
Users should immediately recognize saved posts.
Avoid alternative card designs.
---
## 29.5 Filtering
Support filtering by:
Posts
Frames
Media
Collections
Date Saved
Filtering should never interrupt scrolling.
---
## 29.6 Search
Search within bookmarks only.
Support:
Title
Creator
Caption
Tags
---
## 29.7 Empty State
Encourage users to save content.
Explain how bookmarks work.
---
## 29.8 Performance
Virtualize long bookmark lists.
Cache recently viewed items.
Maintain stable scrolling.
---
## 29.9 Accessibility
Saved content should remain fully accessible using assistive technologies.
---
## 29.10 Validation
✓ Fast retrieval
✓ Consistent cards
✓ Efficient filtering
✓ Smooth scrolling
✓ Accessible interactions
---
# 30. Collections
## 30.1 Purpose
Collections organize bookmarked content into meaningful groups.
Collections should improve long-term content management.
---
## 30.2 Layout Structure
Header
↓
Collection Information
↓
Saved Content
↓
Management Actions
---
## 30.3 Collection Header
Contains:
Collection Name
Description (optional)
Privacy Status
Item Count
Management Menu
---
## 30.4 Privacy
Collections support:
Private
Shared (future)
Collaborative (future)
Privacy should remain immediately understandable.
---
## 30.5 Grid/List View
Users may switch between:
Grid
List
The chosen view should persist.
---
## 30.6 Organization
Support:
Manual ordering
Date added
Date created
Alphabetical
Recently viewed
---
## 30.7 Bulk Actions
Allow:
Move
Remove
Delete
Select Multiple
Bulk operations should remain simple.
---
## 30.8 Empty Collections
Clearly communicate that no content exists.
Provide an action to begin saving items.
---
## 30.9 Performance
Lazy-load thumbnails.
Virtualize long collections.
Avoid expensive filtering operations.
---
## 30.10 Accessibility
Collection management must remain keyboard accessible.
Bulk actions should support assistive technologies.
---
## 30.11 Validation
✓ Organized content
✓ Efficient management
✓ Compact interface
✓ High information density
✓ Accessible controls
✓ Stable rendering

# 31. Creator Dashboard
## 31.1 Purpose
The Creator Dashboard is the operational workspace for creators.
It provides analytics, audience insights, monetization and content management without distracting from the core workflow.
The dashboard should prioritize actionable information over decorative metrics.
---
## 31.2 Layout Structure
Navigation
↓
Overview
↓
Key Metrics
↓
Performance Modules
↓
Recent Activity
↓
Content Management
---
## 31.3 Overview
The overview presents the most important information at a glance.
Avoid information overload.
The first viewport should answer:
- How am I performing?
- What requires my attention?
- What should I do next?
---
## 31.4 Key Metrics
Display a limited set of primary metrics.
Examples:
Views
Reach
Followers
Engagement
Revenue
Subscribers
Metrics should remain comparable over time.
---
## 31.5 Analytics Cards
Cards should remain compact.
Prefer horizontal layouts over oversized KPI tiles.
Charts should prioritize readability.
Avoid decorative gradients behind charts.
---
## 31.6 Time Range
Support:
Today
7 Days
30 Days
90 Days
Custom Range
Changing the range updates all modules consistently.
---
## 31.7 Recent Activity
Display:
Recent posts
Recent comments
Mentions
Monetization events
Moderation alerts
Activity should be ordered chronologically.
---
## 31.8 Content Management
Allow creators to:
View
Edit
Schedule
Archive
Delete
Duplicate
Content management should remain consistent with the main application.
---
## 31.9 Monetization
Display:
Estimated Revenue
Completed Payouts
Pending Balance
Subscriptions
Tips
PPV Sales
Financial information should remain clear and trustworthy.
---
## 31.10 Audience Insights
Examples:
Growth
Geography
Age Groups
Languages
Peak Activity
Returning Audience
Insights should encourage informed decisions.
---
## 31.11 Notifications
Professional notifications should remain separated from personal notifications.
Avoid mixing creator workflows with social activity.
---
## 31.12 Responsive Behavior
### Mobile
Single-column modules.
Priority information first.
---
### Tablet
Two-column layout when appropriate.
---
### Desktop
Multiple responsive columns.
Increase visible information.
Do not enlarge components.
---
## 31.13 Performance
Lazy-load heavy charts.
Cache analytics where appropriate.
Avoid blocking interactions while loading data.
---
## 31.14 Accessibility
Charts should expose textual alternatives.
Tables should remain keyboard navigable.
All controls must support assistive technologies.
---
## 31.15 Validation
✓ Clear priorities
✓ Compact analytics
✓ Actionable insights
✓ Consistent navigation
✓ Accessible controls
✓ Responsive layout
✓ Stable rendering
---
# 32. CircleSfera Studio
## 32.1 Purpose
CircleSfera Studio is the integrated creation environment for producing and publishing content.
The experience should minimize context switching by allowing creators to edit, preview and publish without leaving the platform.
---
## 32.2 Design Principles
Creation should remain focused.
Editing tools should never obscure the content being edited.
Advanced tools should remain progressively disclosed.
---
## 32.3 Layout Structure
Shipped shell for `/edits` (mobile-first, CapCut-like):
Topbar (exit, name, undo/redo, aspect, drafts/save/export)
↓
Preview canvas
↓
Playback controls (transport + frame step + fullscreen)
↓
Timeline strip
↓
Tool dock (Media, Text, Audio, Filters, Captions)
↓
Tool sheet / Properties

Chrome: no TopNav, BottomNav, or app Sidebar on `/edits` (true full-screen).
`/create` remains immersive for TopNav/BottomNav but keeps the app Sidebar on `md+`.
---
## 32.4 Canvas
The canvas is the primary workspace.
It should occupy the largest available area.
Maintain correct aspect ratios.
Avoid decorative framing.
Preview composites all overlapping visual clips on video tracks (multi-layer), then text tracks.
---
## 32.5 Toolbar
Display only the most frequently used tools.
Shipped tools (CircleSfera Studio `/edits`):
Media
Trim / Split
Text
Audio
Filters
Captions (manual + AI transcription when enabled)
Additional tools belong in expandable sections. Effects, stickers, and transitions are not shipped.
---
## 32.6 Timeline
The timeline appears only when required.
On mobile the scrub area is tall enough for trim handles (≈200px).
Support:
Video
Audio
Text Layers
Timeline controls should remain compact.
---
## 32.7 Inspector Panel
The inspector exposes contextual properties.
Examples:
Typography
Color
Opacity
Position
Scale / rotation
Volume / speed
Properties should update dynamically based on the selected element.
---
## 32.8 Preview
Preview should reflect the final published result.
Support real-time updates whenever possible.
Aspect ratio changes must update export resolution.
---
## 32.9 Publishing
Creators publish from Studio by exporting, then handing off to Create:
Download MP4
Publish → `/create?mode=frame` (caption + post), optionally with `scheduledAt` chosen in the export preview step
Save Draft (cloud autosave + local IndexedDB buffer)

After encode, Studio shows a **Preview Before Publishing** surface (MP4 playback + optional schedule picker) before Publish or Download.
Schedule-from-Studio is shipped as an enriched handoff (`editedMediaForPost` with optional `scheduledAt`); caption and visibility remain in Create.
---
## 32.10 Autosave
Studio should save progress automatically.
Local IndexedDB buffer runs even before remote uploads (blob: URLs).
Cloud autosave runs after media is uploaded (remote URLs) once a draft id exists.
Users should never lose edits due to unexpected interruptions.
---
## 32.11 Performance
Editing should remain responsive.
Avoid blocking operations.
Background processing should be preferred for expensive tasks.
Prefer client-side FFmpeg.wasm export for Studio projects; clean up DOM media on unmount.
---
## 32.12 Accessibility
Keyboard shortcuts should remain consistent.
Editing tools should expose accessible labels.
Canvas controls should remain reachable without a mouse where possible.
Touch targets ≥44px. Frame step and transport controls must have accessible names.
---
## 32.13 Validation
✓ Large working canvas
✓ Compact editing tools
✓ Responsive interface
✓ Real-time preview
✓ Reliable autosave
✓ Accessible editing
✓ Smooth performance
✓ Full-screen `/edits` (no app chrome Sidebar)
✓ Mobile-first timeline scrub area

# 33. Settings
## 33.1 Purpose
Settings provide users with complete control over their CircleSfera experience.
The interface should prioritize discoverability, clarity and efficiency.
Settings should never overwhelm users.
Frequently used options should remain immediately accessible, while advanced configuration should be progressively disclosed.
---
## 33.2 Layout Structure
Safe Area
↓
Navigation Header
↓
Profile Summary
↓
Settings Categories
↓
Support
↓
About
---
## 33.3 Header
Height:
56–64px
Contains:
- Back
- Title
- Search (optional)
Avoid additional actions unless absolutely necessary.
---
## 33.4 Profile Summary
Display:
- Avatar
- Display Name
- Username
- Account Type
Selecting the profile summary navigates to Profile settings.
---
## 33.5 Categories
Group settings into logical sections.
Recommended structure:
Account
Privacy
Security
Notifications
Appearance
Accessibility
Language
Storage
Creator Tools
Subscriptions
Payments
Support
About
Avoid long, unstructured lists.
---
## 33.6 Navigation
Each category opens a dedicated screen.
Avoid deeply nested navigation.
Recommended depth:
Maximum three levels.
---
## 33.7 Search
Settings search should locate:
Pages
Individual settings
Descriptions
Search results should navigate directly to the relevant option.
---
## 33.8 Toggles
Boolean settings use switches.
Changes should apply immediately whenever possible.
Provide confirmation only for destructive actions.
---
## 33.9 Destructive Actions
Examples:
Delete Account
Deactivate Account
Sign Out
Disconnect Devices
Require explicit confirmation.
Never place destructive actions near common settings.
---
## 33.10 Accessibility
Support:
Dynamic text sizes
Screen readers
Keyboard navigation
Visible focus states
---
## 33.11 Performance
Settings should load instantly.
Cache static configuration.
Lazy-load advanced modules.
---
## 33.12 Validation
✓ Logical organization
✓ Fast navigation
✓ Searchable
✓ Accessible
✓ Predictable behavior
✓ Minimal hierarchy
---
# 34. Admin Panel
## 34.1 Purpose
The Admin Panel is CircleSfera’s **platform control plane** for internal Trust & Safety and operations staff.
It is not a creator or business analytics product (that belongs in Creator Studio).
Operators use it to triage reports, appeals, support, moderation, monetization controls, and system settings.
The interface prioritizes productivity and queue throughput over visual decoration.
---
## 34.2 Design Principles
Information density is acceptable.
Data should remain readable.
Actions should be efficient.
Consistency with the main Design System must be preserved.
Default mental model: **needs attention first**, vanity metrics second.
---
## 34.3 Layout Structure
Sidebar
↓
Top Bar
↓
Workspace
↓
Context Panel (optional)
---
## 34.4 Sidebar
Contains operational groups (Dashboard, Moderation, Content, System).
**Trust** is the first Dashboard item and the post-login home when the operator has `reports` permission.
Analytics is secondary monitoring, not the entry workspace.
Collapse on smaller screens.
---
## 34.5 Top Bar
Contains:
Global Search
Notifications
Quick Actions
Administrator Menu
Environment Indicator
Keep the Top Bar compact.
---
## 34.6 Workspace
The workspace displays one operational module at a time.
**Default workspace = Trust** (needs-attention hub over reports, appeals, and support).
Avoid multiple competing layouts.
Maintain consistent spacing.
---
## 34.7 Tables
Tables should support:
Sorting
Filtering
Pagination or Virtualization
Column visibility
Bulk actions
Resizable columns
Sticky headers
Large datasets should remain performant.
---
## 34.8 Detail Panels
Selecting an item should open:
Drawer
Side Panel
Dedicated Page
Choose the interaction that minimizes context switching.
---
## 34.9 Dashboards
The Trust home and any KPI strips should answer:
What requires attention?
What changed?
What action is recommended?
Avoid vanity metrics as the primary landing view.
---
## 34.10 Search
Global search should locate:
Users
Posts
Reports
Creators
Payments
Support Tickets
Audit Logs
Search should remain instantaneous.
---
## 34.11 Bulk Actions
Support:
Approve
Reject
Suspend
Delete
Archive
Export
Bulk actions require clear feedback.
---
## 34.12 Permissions
Every interface element should respect role-based permissions.
Hidden functionality should never be rendered for unauthorized roles.
---
## 34.13 Accessibility
Support:
Keyboard shortcuts
Screen readers
High contrast
Logical focus order
---
## 34.14 Performance
Virtualize tables.
Lazy-load heavy modules.
Avoid blocking operations.
Background synchronization should be preferred.
---
## 34.15 Validation
✓ Efficient workflows
✓ High information density
✓ Fast navigation
✓ Predictable modules
✓ Scalable layouts
✓ Accessible administration
✓ Stable rendering

# 35. Authentication
## 35.1 Purpose
Authentication provides secure and frictionless access to CircleSfera.
The experience should minimize cognitive load while maintaining a high level of security.
Authentication should always feel fast, trustworthy and predictable.
---
## 35.2 Design Principles
Prioritize simplicity.
Reduce the number of required actions.
Support modern authentication methods.
Always explain authentication failures.
---
## 35.3 Layout Structure
Safe Area
↓
Brand Identity
↓
Authentication Form
↓
Primary Action
↓
Secondary Actions
↓
Legal Information
---
## 35.4 Login Screen
Display:
- CircleSfera Logo
- Welcome Message
- Email / Username
- Password
- Show Password
- Sign In
- Forgot Password
- Create Account
Avoid unnecessary marketing content.
The primary action should remain immediately visible.
---
## 35.5 Registration
Registration should be divided into logical steps.
Avoid excessively long forms.
Recommended flow:
Step 1
- Email
- Username
↓
Step 2
- Password
- Confirm Password
↓
Step 3
- Profile Information
↓
Step 4
- Verification
Progress indicators should remain visible.
---
## 35.6 Passkeys
When supported, Passkeys should be presented as the preferred authentication method.
Traditional credentials remain available as fallback.
Passkey onboarding should explain the benefits in simple language.
---
## 35.7 Social Authentication
If enabled, social authentication options should appear below the primary authentication method.
Avoid making third-party providers visually dominant.
---
## 35.8 Forgot Password
The recovery process should minimize user frustration.
Display:
- Email Input
- Recovery Instructions
- Success Confirmation
Avoid exposing whether an email address exists.
---
## 35.9 Email Verification
Verification should clearly explain:
Why verification is required.
What the user should expect.
How to resend the email.
Allow resending after a cooldown period.
---
## 35.10 Authentication Errors
Errors should explain:
What happened.
How to fix it.
Avoid technical terminology.
---
## 35.11 Loading
Authentication actions should provide immediate visual feedback.
Prevent duplicate submissions.
---
## 35.12 Accessibility
Support:
Keyboard navigation
Password managers
Screen readers
Dynamic text sizes
Visible focus indicators
---
## 35.13 Validation
✓ Fast authentication
✓ Minimal friction
✓ Clear recovery
✓ Accessible forms
✓ Predictable flow
✓ Modern authentication
---
# 36. Onboarding
## 36.1 Purpose
Onboarding introduces users to CircleSfera while minimizing time to first meaningful interaction.
The objective is activation, not education.
Users should begin using the platform as quickly as possible.
---
## 36.2 Design Principles
Reduce unnecessary decisions.
Delay optional configuration.
Focus on immediate engagement.
---
## 36.3 Recommended Flow
Welcome
↓
Account Creation
↓
Profile Setup
↓
Interest Selection
↓
Suggested Accounts
↓
First Feed
---
## 36.4 Welcome
The welcome screen should communicate:
What CircleSfera is.
Why it is different.
What the user can expect.
Avoid long paragraphs.
---
## 36.5 Profile Setup
Request only essential information.
Examples:
Avatar
Display Name
Username
Bio (optional)
Additional profile customization can occur later.
---
## 36.6 Interests
Allow users to select interests.
Recommendations should improve the initial feed.
Avoid requiring a large number of selections.
---
## 36.7 Suggested Accounts
Recommend:
Creators
Friends
Popular Profiles
Recommendations should remain optional.
Provide a "Skip" action.
---
## 36.8 Permissions
Request permissions only when needed.
Examples:
Notifications
Camera
Microphone
Photos
Never request all permissions at once.
Explain why each permission improves the experience.
---
## 36.9 Completion
After onboarding, users should immediately reach their personalized feed.
Avoid unnecessary confirmation screens.
---
## 36.10 Empty Feed Prevention
Users should never encounter an empty feed after onboarding.
Populate the initial experience with high-quality recommended content.
---
## 36.11 Accessibility
All onboarding steps must remain fully accessible.
Progress indicators should be announced by screen readers.
---
## 36.12 Validation
✓ Short onboarding
✓ High activation
✓ Progressive configuration
✓ Clear guidance
✓ Accessible flow
✓ Immediate engagement

# 37. Moderation
## 37.1 Purpose
Moderation protects the CircleSfera community while maintaining transparency, consistency and accountability.
Every moderation action should be understandable, proportional and traceable.
Users should never feel that enforcement is arbitrary.
---
## 37.2 Design Principles
Moderation interfaces should:
- Explain decisions clearly.
- Preserve user trust.
- Separate facts from recommendations.
- Minimize ambiguity.
- Encourage fair resolution.
---
## 37.3 Moderation Status
Content may display moderation states when appropriate.
Examples:
Published
Under Review
Restricted
Removed
Appealed
Resolved
Statuses should use consistent visual indicators.
---
## 37.4 User Communication
Whenever possible, moderation notices should include:
- What happened.
- Why it happened.
- Which policy applies.
- What actions are available.
- Whether an appeal is possible.
Avoid vague messages.
---
## 37.5 Restricted Content
Restricted content should remain distinguishable from deleted content.
When legally permitted, explain why visibility is limited.
---
## 37.6 Review Progress
Users should understand the current review stage.
Examples:
Received
In Review
Additional Information Required
Decision Made
Resolved
---
## 37.7 Moderation History
Users should have access to their own moderation history.
Display:
Action
Reason
Date
Current Status
Appeal Status
History should remain chronological.
---
## 37.8 Accessibility
Moderation notices must support:
Screen readers
Keyboard navigation
Dynamic text scaling
---
## 37.9 Validation
✓ Transparent decisions
✓ Clear explanations
✓ Consistent terminology
✓ Predictable states
✓ Accessible communication
---
# 38. Reporting
## 38.1 Purpose
Reporting enables users to notify CircleSfera about content or behavior that may violate platform rules.
Reporting should remain simple, fast and respectful.
---
## 38.2 Reporting Flow
Open Report
↓
Reason Selection
↓
Additional Context (optional)
↓
Confirmation
Avoid unnecessarily long forms.
---
## 38.3 Reasons
Examples:
Spam
Harassment
Hate Speech
Violence
Nudity
False Information
Impersonation
Illegal Activity
Other
Reasons should remain concise.
---
## 38.4 Additional Context
Allow users to provide:
Description
Attachments (optional)
Supporting information
Do not require additional context unless necessary.
---
## 38.5 Confirmation
After submission, explain:
Report received
Expected review process
Possible follow-up
Avoid exposing internal moderation procedures.
---
## 38.6 Report Status
When appropriate, users may view:
Submitted
In Review
Resolved
Closed
Status updates should remain understandable.
---
## 38.7 Duplicate Reports
Prevent unnecessary duplicate reports.
Offer existing report information whenever appropriate.
---
## 38.8 Accessibility
Reporting workflows should remain fully accessible.
---
## 38.9 Validation
✓ Short reporting flow
✓ Clear categories
✓ Transparent confirmation
✓ Accessible interface
✓ Efficient submission
---
# 39. Appeals
## 39.1 Purpose
Appeals allow users to request a review of moderation decisions.
Appeals reinforce transparency and procedural fairness.
---
## 39.2 Appeal Flow
Moderation Decision
↓
Appeal Request
↓
Supporting Information
↓
Review
↓
Final Decision
The process should remain understandable at every step.
---
## 39.3 Appeal Form
Allow users to explain:
Why they disagree.
Additional context.
Supporting evidence.
Avoid excessively long forms.
---
## 39.4 Appeal Status
Display:
Submitted
Under Review
Additional Information Requested
Accepted
Rejected
Resolved
Statuses should update consistently.
---
## 39.5 Decision Communication
Final decisions should explain:
Outcome
Reasoning
Policy reference
Any remaining options
Avoid generic responses.
---
## 39.6 History
Users should retain access to previous appeals.
History should remain chronological and searchable.
---
## 39.7 Accessibility
Appeal interfaces must support:
Keyboard navigation
Screen readers
Dynamic font scaling
---
## 39.8 Validation
✓ Fair process
✓ Clear communication
✓ Transparent workflow
✓ Accessible forms
✓ Predictable outcomes

# 40. Monetization
## 40.1 Purpose
Monetization enables creators to generate revenue while providing users with premium experiences.
The monetization experience should be transparent, understandable and trustworthy.
Financial interactions must never feel confusing.
---
## 40.2 Design Principles
Financial information should always be:
- Accurate
- Transparent
- Consistent
- Easy to understand
Users should immediately understand:
- What they are paying.
- Why they are paying.
- What they receive.
- Whether payments renew automatically.
---
## 40.3 Layout Structure
Safe Area
↓
Navigation Header
↓
Overview
↓
Available Plans
↓
Current Subscription
↓
Payment History
↓
Support
---
## 40.4 Subscription Cards
Each subscription card displays:
- Plan Name
- Price
- Billing Interval
- Benefits
- CTA
Avoid oversized pricing cards.
Only one primary CTA should exist per plan.
---
## 40.5 Comparison Tables
When multiple plans exist:
Display feature comparison.
Highlight the recommended plan.
Keep comparison tables horizontally scrollable on mobile.
---
## 40.6 Current Subscription
Display:
Current Plan
Renewal Date
Status
Billing Cycle
Upgrade / Downgrade
Cancel Subscription
Information should remain immediately visible.
---
## 40.7 Billing History
Display:
Transaction
Date
Amount
Status
Invoice
Receipt
History should remain chronological.
---
## 40.8 Payment Status
Examples:
Pending
Processing
Completed
Refunded
Failed
Cancelled
Statuses should use consistent visual language.
---
## 40.9 Financial Transparency
Always communicate:
Taxes (where applicable)
Platform fees
Creator earnings
Estimated payout dates
Avoid hidden costs.
---
## 40.10 Empty State
If no subscriptions exist:
Explain available plans.
Highlight benefits.
Provide a clear CTA.
---
## 40.11 Accessibility
Financial interfaces must support:
Screen readers
Keyboard navigation
Dynamic text sizes
Visible focus indicators
---
## 40.12 Validation
✓ Clear pricing
✓ Transparent billing
✓ Easy comparison
✓ Accessible interface
✓ Trustworthy presentation
---
# 41. Wallet & Balance
## 41.1 Purpose
The Wallet provides creators with a clear overview of earnings, balances and payouts.
Financial information must remain trustworthy and easy to understand.
---
## 41.2 Layout Structure
Header
↓
Available Balance
↓
Pending Balance
↓
Estimated Payout
↓
Recent Transactions
↓
Payout History
---
## 41.3 Balance Summary
Display:
Available
Pending
Lifetime Earnings
Monthly Earnings
The summary should remain compact.
---
## 41.4 Transactions
Each transaction includes:
Type
Amount
Status
Date
Reference
Associated Content (optional)
Transactions should remain searchable.
---
## 41.5 Payouts
Display:
Destination
Estimated Arrival
Status
Amount
Reference Number
---
## 41.6 Filters
Support:
Date
Status
Revenue Source
Payment Method
---
## 41.7 Empty State
Explain how creators begin earning.
Avoid empty dashboards.
---
## 41.8 Accessibility
Financial data must remain accessible.
Support keyboard navigation and assistive technologies.
---
## 41.9 Validation
✓ Clear balances
✓ Transparent payouts
✓ Searchable history
✓ Accessible interface
✓ Predictable information
---
# 42. Payments
## 42.1 Purpose
Payments allow users to complete purchases safely and efficiently.
Every payment flow should maximize user confidence.
---
## 42.2 Checkout
Display:
Purchase Summary
Selected Plan
Payment Method
Total
Taxes
Confirmation
Avoid unnecessary fields.
---
## 42.3 Payment Methods
Support available payment providers consistently.
Payment methods should display recognizable branding.
Do not prioritize one method through visual imbalance.
---
## 42.4 Confirmation
Before charging:
Display final amount.
Billing frequency.
Renewal conditions.
Cancellation policy.
Users must understand what they are confirming.
---
## 42.5 Success
Successful payments should clearly communicate:
Confirmation
Receipt
Next Steps
Access Granted
Avoid excessive celebration animations.
---
## 42.6 Failure
Payment failures should explain:
Reason (when available)
Possible solutions
Retry action
Support contact
Avoid generic errors.
---
## 42.7 Security
Payment interfaces should reinforce trust.
Never expose sensitive payment information.
Always indicate secure processing.
---
## 42.8 Performance
Checkout should remain responsive.
Avoid unnecessary page transitions.
Minimize waiting time.
---
## 42.9 Accessibility
Payment flows must remain fully accessible.
Support screen readers, keyboard navigation and dynamic typography.
---
## 42.10 Validation
✓ Secure checkout
✓ Clear confirmation
✓ Transparent pricing
✓ Reliable feedback
✓ Accessible payment flow

# 43. Loading States
## 43.1 Purpose
Loading states communicate that the system is actively processing user requests.
They should reduce uncertainty while maintaining visual continuity.
Users should always understand that progress is occurring.
---
## 43.2 Design Principles
Loading should:
- Preserve layout stability.
- Avoid sudden visual jumps.
- Match the final content structure.
- Minimize perceived waiting time.
Never display blank screens during loading.
---
## 43.3 Skeleton Loading
Skeletons should resemble the final content.
Examples:
Feed
Stories
Comments
Chat
Notifications
Search Results
Profile
Avoid generic loading placeholders.
---
## 43.4 Progressive Loading
Content should appear progressively whenever possible.
Load:
Critical content first.
Secondary information afterward.
Heavy media last.
---
## 43.5 Infinite Scroll
When additional content loads:
Do not block scrolling.
Display compact loading indicators.
Avoid large loading sections.
---
## 43.6 Refresh
Pull-to-refresh should:
Provide immediate feedback.
Preserve scroll position whenever possible.
Avoid reloading unchanged content.
---
## 43.7 Media Loading
Images
Videos
Audio
Stories
Frames
should progressively appear instead of blocking the interface.
---
## 43.8 Validation
✓ Stable layout
✓ Skeletons match content
✓ Minimal perceived delay
✓ Progressive rendering
✓ Smooth scrolling
---
# 44. Empty States
## 44.1 Purpose
Empty states guide users toward meaningful actions.
An empty screen should always explain why it is empty.
Whenever possible, offer a next step.
---
## 44.2 Design Principles
Empty states should:
Explain.
Encourage.
Educate.
Remain visually lightweight.
Avoid dead ends.
---
## 44.3 Feed
Explain why no content is available.
Suggest:
Following creators
Exploring content
Refreshing recommendations
---
## 44.4 Search
Explain:
No matching results.
Suggest:
Alternative searches.
Trending topics.
Popular accounts.
---
## 44.5 Notifications
Explain:
No recent notifications.
Avoid making the interface appear broken.
---
## 44.6 Bookmarks
Encourage users to save content.
Display a concise explanation.
---
## 44.7 Collections
Invite users to create their first collection.
Explain its purpose.
---
## 44.8 Messages
Explain that conversations will appear here.
Provide a shortcut to start a conversation.
---
## 44.9 Profile
If no posts exist:
Encourage publishing.
Explain available content types.
---
## 44.10 Validation
✓ Helpful guidance
✓ Clear explanation
✓ Action-oriented
✓ Minimal visual weight
---
# 45. Error States
## 45.1 Purpose
Errors should help users recover.
Never simply state that something failed.
---
## 45.2 Design Principles
Explain:
What happened.
Why it happened (when appropriate).
How to resolve it.
Offer recovery actions.
---
## 45.3 Error Types
Validation
Authentication
Authorization
Network
Server
Unexpected
Each category should have consistent presentation.
---
## 45.4 Retry
Whenever appropriate provide:
Retry
Refresh
Contact Support
Return
Avoid forcing full application reloads.
---
## 45.5 Technical Information
Do not expose internal implementation details.
Log technical information internally.
Display human-readable explanations.
---
## 45.6 Validation
✓ Clear explanation
✓ Recovery available
✓ Human language
✓ Consistent presentation
---
# 46. Offline Experience
## 46.1 Purpose
Temporary network interruptions should not completely interrupt the user experience.
Offline behavior should remain predictable.
---
## 46.2 Design Principles
Clearly indicate connectivity changes.
Avoid unnecessary interruptions.
Resume synchronization automatically.
---
## 46.3 Offline Banner
A compact banner should indicate:
Offline
Limited functionality
Reconnecting
The banner should not block interaction.
---
## 46.4 Cached Content
Previously viewed content should remain accessible whenever possible.
Examples:
Feed
Profiles
Messages
Bookmarks
Collections
Settings
---
## 46.5 Queued Actions
Actions performed while offline should be queued.
Examples:
Likes
Bookmarks
Comments
Messages
Posts
Users should understand that synchronization is pending.
---
## 46.6 Reconnection
After connectivity returns:
Automatically synchronize pending actions.
Inform the user only when necessary.
Avoid duplicate notifications.
---
## 46.7 Validation
✓ Predictable behavior
✓ Cached content
✓ Automatic synchronization
✓ Clear connectivity feedback
✓ Minimal interruption

# 47. Universal Layout Rules
## 47.1 Purpose
These rules apply to every screen, component and workflow within CircleSfera.
They ensure consistency across the entire product regardless of feature or platform.
Every new interface must comply with these principles.
---
## 47.2 Mobile First
Mobile is the primary design target.
Every screen must be designed for mobile before considering tablet or desktop layouts.
Desktop adapts the layout by adding space and additional panels.
Desktop must never become the primary reference.
---
## 47.3 Content First
Content is always the primary element.
Decorative elements must never compete with user content.
If visual decoration reduces readability or usable space, it should be removed.
---
## 47.4 Stable Layout
Interfaces should remain visually stable.
Avoid unexpected layout shifts.
Content should load progressively without moving existing elements whenever possible.
---
## 47.5 Consistent Hierarchy
Every screen should maintain the same visual hierarchy:
Primary Action
↓
Primary Content
↓
Secondary Information
↓
Metadata
↓
Utility Actions
Users should immediately recognize where to focus their attention.
---
## 47.6 Predictable Navigation
Navigation should remain consistent throughout the application.
Users should always know:
Where they are.
Where they came from.
How to return.
---
## 47.7 Visual Consistency
Spacing
Typography
Border Radius
Elevation
Colors
Animation
should remain consistent across every module.
---
## 47.8 Component Reuse
Do not redesign existing components.
Prefer extending reusable components over creating new variations.
Visual consistency is more valuable than unnecessary uniqueness.
---
## 47.9 Progressive Disclosure
Only display information required for the current task.
Advanced options should appear progressively.
Avoid overwhelming users.
---
## 47.10 Feedback
Every user action should produce immediate feedback.
Examples:
Pressed
Loading
Completed
Failed
Feedback should appear within milliseconds.
---
## 47.11 Accessibility
Accessibility is mandatory.
Accessibility requirements must never be sacrificed for aesthetics.
---
## 47.12 Performance
Visual quality must never compromise performance.
Avoid unnecessary rendering.
Avoid excessive animations.
Prioritize smooth interaction.
---
## 47.13 Validation
✓ Consistent hierarchy
✓ Stable layout
✓ Predictable navigation
✓ Immediate feedback
✓ Mobile-first
✓ Accessible
✓ High performance
---
# 48. Responsive Validation
## 48.1 Purpose
Responsive behavior should preserve usability instead of merely resizing interfaces.
Layouts adapt.
Components remain familiar.
---
## 48.2 Mobile
Mobile is the design reference.
Every screen should be reviewed on mobile before larger breakpoints.
---
## 48.3 Tablet
Tablet introduces additional horizontal space.
Use it to improve layout organization.
Avoid enlarging components.
---
## 48.4 Desktop
Desktop increases productivity.
Use additional width for:
Secondary panels
Additional navigation
Extra context
Simultaneous views
Do not scale buttons, typography or cards simply because more space exists.
---
## 48.5 Large Displays
Ultra-wide displays should:
Limit maximum content width.
Maintain comfortable reading lengths.
Avoid stretched interfaces.
---
## 48.6 Foldable Devices
Layouts should gracefully adapt.
Avoid placing critical interactions across fold boundaries.
---
## 48.7 Orientation Changes
Portrait and landscape should preserve usability.
Critical actions should remain accessible.
---
## 48.8 Validation Checklist
Every responsive layout should verify:
✓ Navigation remains accessible.
✓ Content hierarchy remains intact.
✓ Components preserve proportions.
✓ Touch targets remain comfortable.
✓ Text remains readable.
✓ No unnecessary empty space.
---
# 49. Final Design Validation
Every interface implemented in CircleSfera should satisfy the following questions before release.
## 49.1 Usability
Can users immediately understand the purpose of this screen?
Is the primary action obvious?
Is unnecessary complexity avoided?
---
## 49.2 Consistency
Does the interface follow the Design System?
Does it respect the Layout Guidelines?
Are existing components reused?
---
## 49.3 Mobile Experience
Has the design been reviewed on mobile first?
Does it maximize useful content?
Is scrolling comfortable?
Are touch targets appropriate?
---
## 49.4 Accessibility
Is keyboard navigation supported?
Are screen readers supported?
Is color contrast sufficient?
Can users increase text size?
---
## 49.5 Performance
Does the interface feel responsive?
Are animations smooth?
Does loading preserve layout stability?
Are unnecessary re-renders avoided?
---
## 49.6 Content
Does content remain the primary focus?
Are aspect ratios preserved?
Is information density appropriate?
Is whitespace intentional?
---
## 49.7 Trust
Does the interface clearly communicate system status?
Are user actions understandable?
Are errors actionable?
Is financial or moderation information transparent when applicable?
---
## 49.8 Engineering
Can this interface be built using existing reusable components?
Does it avoid unnecessary complexity?
Does it align with current frontend architecture?
---
## 49.9 Approval Criteria
A screen should only be considered production-ready when it satisfies:
✓ Design System
✓ Layout Guidelines
✓ Accessibility Guidelines
✓ Responsive behavior
✓ Performance expectations
✓ Engineering consistency
✓ Product philosophy

# 50. Mobile Density & Proportions
## 50.1 Purpose
CircleSfera is a mobile-first social platform.
Layouts must maximize useful content visibility while preserving readability, usability and visual balance.
The objective is not to fill the screen, but to display as much meaningful content as possible without overwhelming the user.
Information density is a core design quality metric.
---
## 50.2 Mobile Defines Every Layout
Every interface must be designed for mobile first.
Desktop layouts are adaptations of the mobile experience.
Never design for desktop first and scale down afterwards.
Mobile establishes:
- Component sizes
• Typography hierarchy
• Spacing
• Navigation
• Content density
Desktop expands layout, not component scale.
---
## 50.3 Content Over Decoration
Content is the primary focus.
Decorative elements should never reduce the amount of useful information visible.
Avoid excessive:
- Empty space
• Decorative containers
• Large headers
• Oversized cards
• Oversized buttons
Whitespace should improve readability, not reduce information density.
---
## 50.4 Visual Density
Every screen should expose enough content to encourage continuous interaction.
The interface should feel active rather than empty.
Design for efficient scanning.
Avoid layouts where only a few elements occupy the entire screen.
---
## 50.5 Stable Component Scale
Components maintain consistent proportions across devices.
Larger displays should reveal more content instead of enlarging components.
Incorrect:
Desktop
↓
Everything becomes larger.
Correct:
Desktop
↓
More columns.
More information.
Same component scale.
---
## 50.6 Preserve Aspect Ratios
Images.
Videos.
Stories.
Frames.
Avatars.
Media should preserve their intended proportions.
Never stretch media simply to occupy additional space.
Containers adapt to content.
Content should never adapt to decorative layout.
---
## 50.7 Efficient Vertical Space
Vertical space is valuable.
Avoid unnecessarily increasing:
- Header height
• Card padding
• Section spacing
• Margins
• Hero sections
Users should consume content through scrolling, not through oversized layouts.
---
## 50.8 Compact Navigation
Navigation should occupy the minimum space necessary.
Headers should remain compact.
Bottom navigation should avoid unnecessary height.
Floating elements should never obstruct content.
---
## 50.9 Progressive Expansion
Additional space should reveal:
Secondary panels.
Additional metadata.
Contextual actions.
Supplementary information.
Do not use additional space to simply increase component dimensions.
---
## 50.10 Readability Before Density
High information density must never reduce readability.
Maintain:
Comfortable touch targets.
Readable typography.
Adequate spacing.
Clear hierarchy.
Density should improve efficiency, not create clutter.
---
## 50.11 Visual Rhythm
Interfaces should maintain a consistent rhythm.
Avoid alternating between extremely dense and extremely sparse sections.
Spacing should create flow rather than fragmentation.
---
## 50.12 Screen Efficiency
Every screen should efficiently use available space.
Before increasing spacing, verify whether additional content could be displayed instead.
Useful content is preferred over decorative whitespace.
---
## 50.13 Validation
Every mobile screen should satisfy the following questions.
✓ Does the layout prioritize content?
✓ Is the amount of visible information appropriate?
✓ Is whitespace intentional?
✓ Are aspect ratios preserved?
✓ Are components proportionate?
✓ Does the interface avoid oversized elements?
✓ Does desktop add information instead of scaling components?
✓ Does the screen feel efficient without feeling crowded?
✓ Is scrolling natural?
✓ Would this layout feel appropriate in a production social network?

# 51. AI Layout Constraints
## 51.1 Purpose
This document establishes mandatory layout constraints for AI-assisted development.
These rules are intended for AI coding assistants generating or modifying CircleSfera interfaces.
AI should preserve consistency before pursuing novelty.
When uncertainty exists, preserve the existing design language.
---
## 51.2 Mobile Is Always The Reference
Every layout must be evaluated on mobile first.
Desktop screenshots are not sufficient validation.
A layout that looks correct on desktop but inefficient on mobile is considered incorrect.
---
## 51.3 Never Increase Component Size Without Justification
Do not enlarge components simply because additional space is available.
Increasing component size requires a functional reason.
Examples of valid reasons:
Accessibility
Media viewer
Primary onboarding
Critical dialog
Examples of invalid reasons:
Fill empty space
Make the interface "look modern"
Increase visual impact
---
## 51.4 Prefer Additional Content
Whenever additional screen space exists, prefer displaying:
More posts
More comments
More conversations
More notifications
More settings
More search results
instead of increasing spacing or component dimensions.
---
## 51.5 Preserve Existing Scale
When modifying an existing screen:
Do not increase:
Typography
Padding
Margins
Avatar sizes
Button height
Card height
unless explicitly requested.
---
## 51.6 Preserve Information Density
Before increasing spacing ask:
Will this improve usability?
If the answer is no,
do not increase spacing.
---
## 51.7 Respect Aspect Ratios
Never modify media aspect ratios.
Never crop content unnecessarily.
Never stretch media to occupy unused space.
---
## 51.8 Avoid Decorative Growth
Do not add:
Large hero sections
Oversized headers
Oversized empty containers
Decorative spacing
Large gradient backgrounds
unless explicitly requested.
CircleSfera is a content platform.
Content should remain visually dominant.
---
## 51.9 Reuse Existing Patterns
When creating new screens:
Reuse:
Cards
Buttons
Lists
Spacing
Navigation
Typography
Avoid creating new visual languages.
---
## 51.10 Minimize Layout Changes
If only one component requires modification,
modify only that component.
Do not redesign the entire screen.
---
## 51.11 Preserve Scroll Continuity
Scrolling should feel continuous.
Avoid introducing large visual interruptions.
Large decorative sections should be avoided.
---
## 51.12 Avoid Visual Regression
AI-generated changes must never reduce:
Content density
Usability
Accessibility
Consistency
Performance
Visual hierarchy
---
## 51.13 Validation Checklist
Before considering a layout complete, verify:
✓ Mobile reviewed first
✓ Component scale preserved
✓ Aspect ratios preserved
✓ Content density maintained
✓ Existing spacing respected
✓ Existing navigation preserved
✓ Existing components reused
✓ No unnecessary visual growth
✓ Desktop expands layout instead of scaling components
✓ The interface resembles a production social network rather than a marketing page

# Appendix A — Layout Philosophy
CircleSfera layouts are designed around content consumption, not visual decoration.
Every layout decision should maximize usability, consistency and information density while preserving clarity.
The platform follows a mobile-first philosophy where mobile defines the experience and larger devices progressively expand the available workspace.
Interfaces should feel efficient, predictable and familiar.
The objective is not to impress through oversized components or excessive whitespace, but to create an environment where users can comfortably consume, create and manage content.
When multiple layout solutions are possible, prefer the one that:
- Displays more meaningful content.
- Requires fewer interactions.
- Preserves established design patterns.
- Minimizes cognitive load.
- Reuses existing components.
Layout quality is measured by usability rather than visual novelty.

# Appendix B — AI Implementation Notes
These Layout Guidelines are intended to guide both human designers and AI-assisted development tools.
When generating or modifying interfaces, AI systems should prioritize:
- Existing design consistency.
- Mobile-first layouts.
- Stable component proportions.
- Information density.
- Predictable navigation.
- Reusable components.
AI should avoid introducing unnecessary visual variation, oversized components, excessive whitespace or layouts that reduce the amount of useful content visible on screen.
If uncertainty exists, preserve the current design language rather than inventing a new one.

# Appendix C — Document Scope
This document defines layout structure and screen composition.
It does not define:
- Colors
• Typography
• Component implementation
• Motion specifications
• Responsive component sizing
• Accessibility implementation details
Those topics are documented separately in:
- DESIGN_SYSTEM.md
• COMPONENT_PATTERNS.md
• SCREEN_DENSITY.md
• COMPONENT_SIZING.md
• RESPONSIVE_GUIDELINES.md
• [ACCESSIBILITY.md](http://accessibility.md/)