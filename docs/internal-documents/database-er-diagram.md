Database ER Diagram
CircleSfera

---

Entidades Principales

1. Users (Core)
   • user_id (PK)
   • username (UNIQUE)
   • email (UNIQUE)
   • password_hash
   • account_type (personal, creator, business)
   • plan_type (free, premium, business, elite_creator)
   • is_active
   • is_banned
   • created_at
2. User_Profiles (Related to Users)
   • profile_id (PK)
   • user_id (FK → users)
   • display_name
   • bio
   • avatar_url
   • cover_url
   • verified (boolean)
3. User_Settings (Related to Users)
   • user_id (PK, FK → users)
   • privacy_level (public, followers, private)
   • content_preference (general, mature)
   • allow_messages_from

---

Content Entities 4. Posts (Main Content)
• post_id (PK)
• user_id (FK → users)
• content (TEXT)
• content_rating (general, mature)
• created_at
• is_public
• status (published, draft, archived) 5. Media_Files (Related to Posts)
• media_id (PK)
• post_id (FK → posts)
• url
• type (image, video)
• moderation_score
• moderation_status (pending, approved, flagged, removed) 6. Stories (Ephemeral Content)
• story_id (PK)
• user_id (FK → users)
• media_url
• created_at
• expires_at (24h)
• moderation_status (pending, approved, flagged, removed) 7. Frames (Short Videos)
• frame_id (PK)
• user_id (FK → users)
• video_url
• duration
• content_rating (general, mature)
• created_at
• moderation_status (pending, approved, flagged, removed)

---

Interaction Entities 8. Likes (Polymorphic)
• like_id (PK)
• user_id (FK → users)
• likeable_id (post_id, comment_id, frame_id)
• likeable_type (post, comment, frame)
• created_at 9. Comments (Related to Posts)
• comment_id (PK)
• user_id (FK → users)
• post_id (FK → posts)
• parent_comment_id (FK → comments) [for threading]
• content
• created_at
• is_edited 10. Shares (Related to Posts)
• share_id (PK)
• user_id (FK → users)
• shareable_id (post_id, frame_id)
• shareable_type
• created_at 11. Bookmarks (Related to Posts)
• bookmark_id (PK)
• user_id (FK → users)
• post_id (FK → posts)
• created_at

---

Social Graph 12. Follows
• follow_id (PK)
• follower_id (FK → users)
• following_id (FK → users)
• status (active, pending, rejected)
• created_at
• CHECK: follower_id != following_id 13. Blocks
• block_id (PK)
• blocker_id (FK → users)
• blocked_id (FK → users)
• created_at 14. Mutes
• mute_id (PK)
• muter_id (FK → users)
• muted_id (FK → users)
• created_at

---

Moderation 15. Reports
• report_id (PK)
• reporter_id (FK → users)
• reported_user_id (FK → users, NULLABLE)
• reportable_type (post, comment, user, frame, story)
• reportable_id
• reason (spam, harassment, illegal_content, violence, hate_speech, impersonation)
• description
• status (pending, reviewing, resolved, rejected)
• created_at 16. Moderation_Actions
• action_id (PK)
• report_id (FK → reports)
• target_type (post, comment, user, frame, story)
• target_id
• action_type (remove_content, restrict, warn, suspend, ban_user)
• reason (legal_article_or_policy_reference)
• moderator_id (FK → users)
• created_at 17. Appeals
• appeal_id (PK)
• action_id (FK → moderation_actions)
• user_id (FK → users)
• status (pending, approved, rejected)
• appeal_reason
• created_at
• resolved_at

---

Monetización 18. Platform_Plans
• plan_id (PK)
• name (free, premium, business, elite_creator)
• monthly_price
• yearly_price
• is_active
• created_at 19. User_Subscriptions
• subscription_id (PK)
• user_id (FK → users)
• plan_id (FK → platform_plans)
• billing_provider (stripe)
• provider_subscription_id
• status (active, cancelled, past_due, incomplete, trialing)
• billing_cycle (monthly, yearly)
• started_at
• renews_at
• cancelled_at 20. Platform_Transactions
• transaction_id (PK)
• user_id (FK → users)
• subscription_id (FK → user_subscriptions, NULLABLE)
• type (plan_subscription, renewal, upgrade, downgrade, verification_fee, promotion_fee, business_feature_purchase)
• amount
• currency
• provider (stripe)
• provider_payment_intent_id
• status (pending, completed, failed, refunded)
• created_at 21. Feature_Entitlements
• entitlement_id (PK)
• user_id (FK → users)
• feature_key (advanced_analytics, no_ads, priority_support, business_badge, extended_links, premium_tools)
• source_type (plan, manual, promo)
• source_id
• starts_at
• ends_at
• is_active

---

Analytics 22. User_Analytics (Daily Rollups)
• analytics_id (PK)
• user_id (FK → users)
• date
• profile_views
• follower_count
• following_count
• posts_count
• frames_count 23. Content_Analytics (Daily Rollups)
• analytics_id (PK)
• content_type (post, frame, story)
• content_id
• date
• impressions
• reach
• views
• likes
• comments
• shares
• saves 24. Subscription_Analytics (Daily Rollups)
• analytics_id (PK)
• date
• new_subscriptions
• cancelled_subscriptions
• active_subscriptions
• mrr_eur
• arr_eur

---

Metadata 25. Hashtags
• hashtag_id (PK)
• tag (UNIQUE)
• usage_count
• created_at 26. Post_Hashtags (Junction)
• post_id (FK → posts)
• hashtag_id (FK → hashtags)
• PRIMARY KEY (post_id, hashtag_id)

Relationship Summary

users (1) ──── (many) posts
users (1) ──── (many) comments
users (1) ──── (many) likes
users (1) ──── (many) follows [follower side]
users (1) ──── (many) follows [following side]
users (1) ──── (many) blocks
users (1) ──── (many) mutes
users (1) ──── (many) reports
users (1) ──── (many) moderation_actions
users (1) ──── (many) user_subscriptions
users (1) ──── (many) platform_transactions
users (1) ──── (many) feature_entitlements

platform_plans (1) ──── (many) user_subscriptions
user_subscriptions (1) ──── (many) platform_transactions

posts (1) ──── (many) comments
posts (1) ──── (many) likes
posts (1) ──── (many) media_files
posts (1) ──── (many) bookmarks
posts (many) ── (many) hashtags [via post_hashtags]

comments (1) ──── (many) likes
comments (1) ──── (many) comments [self-referential for threading]

moderation_actions (1) ──── (many) appeals
