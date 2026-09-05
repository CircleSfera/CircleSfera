import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Automatically cleanup after each test
afterEach(() => {
  cleanup();
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // Deprecated
    removeListener: vi.fn(), // Deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
class IntersectionObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: IntersectionObserverMock,
});

// Jsdom does not implement scrollTo; stub for ScrollToTop and keyboard shortcuts
window.scrollTo = vi.fn();
Element.prototype.scrollTo = vi.fn();

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any, extra?: any) => {
      const translations: Record<string, string> = {
        'auth.login.identifier_label': 'Email or Username',
        'auth.login.password_label': 'Password',
        'auth.login.sign_in': 'Sign In',
        'auth.login.title': 'Sign In',
        'landing.nav.log_in': 'Log In',
        'landing.nav.sign_up': 'Sign Up',
        'landing.nav.primary': 'Primary',
        'landing.nav.open_menu': 'Open menu',
        'landing.nav.close_menu': 'Close menu',
        'landing.hero.badge': 'Feed · Frames · Direct · Live',
        'landing.hero.title_part1': 'Your feed.',
        'landing.hero.title_part2': 'You decide.',
        'landing.hero.subtitle':
          'Posts, stories, Frames, Direct, and Live. You choose what you see and who can reach you.',
        'landing.hero.get_started': 'Create account',
        'landing.hero.log_in': 'Log in',
        'landing.hero.already': 'Already have an account?',
        'landing.hero.explore_demo': 'Explore CircleSfera',
        'landing.preview.home': 'Home',
        'landing.preview.explore': 'Explore',
        'landing.preview.frames': 'Frames',
        'landing.preview.direct': 'Direct',
        'landing.preview.live': 'Live',
        'landing.preview.creator': 'Creator tools',
        'landing.preview.following': 'Following',
        'landing.preview.feed': 'Home',
        'feed.foryou': 'For You',
        'feed.following': 'Following',
        'explore.trending': 'Trending',
        'landing.chapters.learn_more': 'See how it works',
        'explore.for_you': 'For You',
        'landing.principles.badge': 'Principles',
        'landing.principles.title': 'Control you can use.',
        'landing.principles.subtitle':
          'Five rules for what you see, who can reach you, and how your data is used.',
        'landing.principles.items.control.title': 'User control first',
        'landing.principles.items.control.desc': 'You decide what you consume.',
        'landing.principles.items.transparency.title': 'Why you see this',
        'landing.principles.items.transparency.desc':
          'What shows up should make sense.',
        'landing.principles.items.no_suppression.title':
          'Visibility you control',
        'landing.principles.items.no_suppression.desc':
          'Mute, hide, and feed preferences change what you see.',
        'landing.principles.items.moderation.title':
          'Strict, explicit moderation',
        'landing.principles.items.moderation.desc':
          'Community rules are public. You can appeal from Settings.',
        'landing.principles.items.data.title': 'Responsible data handling',
        'landing.principles.items.data.desc':
          'We keep what the product needs, and can say why.',
        'landing.faq.badge': 'FAQ',
        'landing.faq.title': 'Straight answers',
        'landing.faq.subtitle':
          'What CircleSfera is today — plans, the feed, and how to use it on your phone.',
        'landing.faq.items.free.q': 'Is CircleSfera free?',
        'landing.faq.items.free.a': 'Yes. Core social features are free.',
        'landing.faq.items.verify.q': 'How does identity verification work?',
        'landing.faq.items.verify.a': 'Via Stripe Identity from Settings.',
        'landing.faq.items.control.q': 'Do I control what I see?',
        'landing.faq.items.control.a': 'Yes. Preferences and appeals.',
        'landing.faq.items.mobile.q': 'Is there a mobile app?',
        'landing.faq.items.mobile.a':
          'CircleSfera works in the browser on your phone and on desktop.',
        'landing.faq.items.plans.q': 'What do platform plans unlock?',
        'landing.faq.items.plans.a':
          'Premium, Elite Creator, and Business via Stripe.',
        'landing.faq.items.support.q': 'Is there real technical support?',
        'landing.faq.items.support.a':
          'Yes. Log in, write from Support, and a person replies by email.',
        'common.footer.explore': 'Explore',
        'common.footer.pricing': 'Pricing',
        'common.footer.support': 'Support',
        'landing.footer.features': 'Features',
        'landing.footer.principles': 'Principles',
        'landing.footer.product': 'Product',
        'landing.footer.platform': 'Platform',
        'landing.footer.legal': 'Legal',
        'landing.footer.account': 'Account',
        'landing.footer.desc':
          'A social network for posts, Frames, Direct, Live, and creator tools.',
        'landing.footer.rights': '© 2026 CircleSfera. All rights reserved.',
        'landing.footer.tagline': 'One product. Every screen.',
        'post.content.likes': 'likes',
        'post.content.view_all_comments': 'View all {{count}} comments',
        'onboarding.continue': 'Continue',
        'onboarding.follow': 'Follow',
        'onboarding.following': 'Following',
        'onboarding.find_circle': 'Find your circle',
        'onboarding.enter': 'Enter CircleSfera',
        'onboarding.back': 'Back',
        'onboarding.step_profile': 'Profile',
        'onboarding.step_circle': 'Circle',
        'onboarding.empty_places_label': 'Where to find people',
        'onboarding.empty_message':
          'No creators to follow yet. Enter CircleSfera and find people from Home and Explore.',
        'onboarding.retry_suggestions': 'Refresh suggestions',
        'onboarding.find_circle_empty_subtitle':
          'No one to follow yet — you can skip this step.',
        'nav.home': 'Home',
        'nav.explore': 'Explore',
        'settings.hub.edit_profile': 'Edit',
        'settings.hub.plan_a11y': 'Subscription: {{plan}}',
        'settings.hub.privacy_a11y': 'Privacy: {{visibility}}',
        'settings.hub.public': 'Public',
        'settings.billing.free': 'Free',
        'settings.hub.nav_label': 'Account settings',
        'settings.hub.back': 'Back to account',
        'settings.notifications_tab.native_alerts': 'Native Alerts',
        'settings.notifications_tab.subscribe_success': 'Native alerts enabled',
        'settings.notifications_tab.subscribe_error':
          "Couldn't enable native alerts. Try again.",
        'settings.notifications_tab.unsubscribe_success':
          'Native alerts disabled',
        'settings.notifications_tab.unsubscribe_error':
          "Couldn't disable native alerts. Try again.",
        'settings.notifications_tab.enabling': 'Enabling native alerts…',
        'settings.notifications_tab.disabling': 'Disabling native alerts…',
        'settings.notifications_tab.not_registered': 'NOT REGISTERED',
        'settings.notifications_tab.enabled': 'ENABLED',
        'settings.notifications_tab.not_supported': 'NOT SUPPORTED',
        'settings.notifications_tab.status': 'Status',
        'settings.notifications_tab.pwa_support': 'PWA Support',
        'settings.notifications_tab.blocked':
          'Notifications are blocked in your browser settings.',
        'chat.incoming_video_call': 'Incoming video call...',
        'chat.incoming_audio_call': 'Incoming audio call...',
        'chat.decline': 'Decline',
        'chat.accept': 'Accept',
        'post.modals.delete_title': 'Delete Post?',
        'post.modals.delete_warning': 'This action cannot be undone.',
        'post.modals.cancel': 'Cancel',
        'post.modals.delete': 'Delete',
        'post.modals.deleting': 'Deleting...',
        'post.modals.edit_title': 'Edit Caption',
        'post.modals.write_caption': 'Write a caption...',
        'post.modals.save': 'Save',
        'post.modals.saving': 'Saving...',
        'modals.block.title': 'Block @{{username}}?',
        'modals.block.message':
          "They won't be able to find your profile, posts, or story on CircleSfera.",
        'modals.block.cancel': 'Cancel',
        'modals.block.confirm': 'Block',
        'modals.share.share_to': 'Share to...',
        'modals.share.search_conversations': 'Search conversations...',
        'modals.share.sent': 'Sent',
        'modals.share.send': 'Send',
        'modals.share.no_conversations': 'No conversations found',
        'modals.share.done': 'Done',
        'settings.close_friends_modal.title': 'Close Friends',
        'settings.close_friends_modal.search': 'Search...',
        'settings.close_friends_modal.search_min':
          'Type at least 2 characters to search.',
        'settings.close_friends_modal.loading': 'Loading...',
        'settings.close_friends_modal.list_title': 'Close Friends List',
        'settings.close_friends_modal.list_desc':
          "We don't send notifications when you edit your close friends list.",
        'settings.close_friends_modal.done': 'Done',
        'wallet.send_gift': 'Send Gift',
        'wallet.support_with_money': 'Support {{name}} with a tip',
        'wallet.send_tip': 'Send Tip',
        'wallet.error_send_tip': 'Error sending tip',
        'chat.new_message': 'New Message',
        'chat.creating': 'Creating...',
        'chat.chat': 'Chat',
        'chat.to': 'To:',
        'chat.search_dots': 'Search...',
        'chat.name_group_optional': 'Name your group (optional)',
        'chat.no_account_found': 'No account found.',
        'chat.no_following': 'No Following',
        'chat.suggested': 'Suggested',
        'chat.cancel': 'Cancel',
        'chat.members': '{{count}} members',
        'chat.group_chat': 'Group Chat',
        'chat.group_details.title': 'Group details',
        'chat.group_details.default_name': 'Group chat',
        'chat.group_details.name_label': 'Group name',
        'chat.group_details.avatar_label': 'Avatar image URL (optional)',
        'chat.group_details.save': 'Save',
        'chat.group_details.edit_info': 'Edit info',
        'chat.group_details.participants': 'Participants',
        'chat.group_details.admin_badge': 'Admin',
        'chat.group_details.remove_title': 'Remove from group',
        'chat.group_details.remove_confirm':
          'Remove @{{username}} from this group?',
        'chat.group_details.leave_confirm':
          'Leave this group? You will stop receiving new messages.',
        'chat.group_details.leave_group': 'Leave group',
        'studio.export_options_title': 'Export settings',
        'studio.export_quality': 'Encode quality',
        'studio.export_quality_hint':
          'Faster presets finish sooner; slower ones look a bit sharper.',
        'studio.export_mobile_hint':
          'On this device export uses a lighter 720p encode for speed.',
        'studio.export_long_duration_hint':
          'Long projects take longer to encode on-device. Prefer shorter cuts on mobile.',
        'studio.export_schedule_hint':
          'Optional. The date is carried into Create when you publish.',
        'studio.export_start': 'Start export',
        'studio.export_cancel': 'Cancel export',
        'studio.export_presets.ultrafast': 'Fastest (draft)',
        'studio.export_presets.veryfast': 'Balanced',
        'studio.export_presets.fast': 'Higher quality',
        'studio.export_rendering': 'Rendering…',
        'studio.export_ready': 'Video ready',
        'studio.export_progress': 'Rendering… {{percent}}%',
        'studio.export_success': 'Your project has been rendered successfully.',
        'studio.export_publish': 'Publish to CircleSfera',
        'studio.export_download': 'Download to device',
        'createPost.caption.schedule': 'Schedule publish',
        'createPost.caption.clear_schedule': 'Clear schedule',
        'common.cancel': 'Cancel',
        'common.loading': 'Loading...',
        'studio.default_project_name': 'New Project',
        'studio.drafts.title': 'My drafts',
        'studio.drafts.empty': 'No saved drafts yet',
        'studio.drafts.error': 'Could not load drafts',
        'studio.drafts.updated': 'Updated: {{date}}',
        'studio.drafts.delete': 'Delete draft',
        'studio.drafts.delete_confirm': 'Delete this draft permanently?',
        'studio.drafts.deleted': 'Draft deleted',
        'studio.drafts.delete_error': 'Could not delete draft',
        'modals.highlight.new_highlight': 'New Highlight',
        'modals.highlight.title_and_cover': 'Title & Cover',
        'modals.highlight.select_stories_desc':
          'Select stories to add to this highlight.',
        'modals.highlight.no_stories': 'No stories found.',
        'modals.highlight.post_some_stories':
          'Post some stories to create a highlight!',
        'modals.highlight.highlight_name': 'Highlight Name',
        'modals.highlight.next': 'Next',
        'modals.highlight.done': 'Done',
        'collections.new_collection': 'New Collection',
        'collections.collection_name': 'Collection Name',
        'collections.placeholder_name': 'e.g. Travel, Recipes',
        'collections.create': 'Create Collection',
        'collections.posts_count': '{{count}} posts',
        'frames.save_to_collection': 'Save to collection',
        'modals.audio.title': 'Select music',
        'modals.audio.search_placeholder': 'Search by song or artist…',
        'modals.audio.clear_selection': 'Remove selected music',
        'modals.audio.loading': 'Loading audio tracks…',
        'modals.audio.no_results': 'No results found.',
        'modals.audio.empty': 'No audio tracks available.',
        'modals.audio.unknown_artist': 'Unknown artist',
        'modals.audio.selected': 'Selected',
        'modals.audio.use': 'Use',
        'modals.audio.play_preview': 'Play preview',
        'modals.audio.pause_preview': 'Pause preview',
        'modals.support.title': 'Help & Support',
        'modals.support.subtitle': 'Send a question or report to our team',
        'modals.support.email_label': 'Email',
        'modals.support.email_placeholder': 'you@email.com',
        'modals.support.category_label': 'Category',
        'modals.support.subject_label': 'Subject',
        'modals.support.subject_placeholder': 'Brief summary of the issue',
        'modals.support.message_label': 'Detailed message',
        'modals.support.message_placeholder':
          'Describe your request in detail…',
        'modals.support.attach_screenshot': 'Attach screenshot',
        'modals.support.attachment_attached': 'Screenshot attached ✓',
        'modals.support.attachment_label': 'Attachment',
        'modals.support.send_button': 'Send ticket',
        'modals.support.upload_error': 'Could not upload the screenshot.',
        'modals.support.submit_error': 'Could not submit your request.',
        'modals.support.success_title': 'Ticket sent!',
        'modals.support.success_desc':
          'We received your message and will reply soon.',
        'modals.support.categories.TECHNICAL': 'Technical issue',
        'modals.support.categories.BILLING': 'Billing & payments',
        'modals.support.categories.ACCOUNT': 'Account & access',
        'modals.support.categories.SUGGESTION': 'Suggestion',
        'modals.insights.post_stats': 'Post Statistics',
        'modals.insights.realtime_metrics': 'Real-time performance metrics',
        'modals.insights.views': 'Views',
        'modals.insights.impressions': 'Impressions',
        'modals.insights.likes': 'Likes',
        'modals.insights.comments': 'Comments',
        'modals.insights.saves': 'Saves',
        'modals.insights.shares': 'Shares',
        'modals.insights.dwell_time': 'Dwell Time',
        'modals.insights.conversion_rate': 'Conv. Rate',
        'modals.insights.views_evolution': 'Views Evolution',
        'modals.insights.last_days': 'Last days',
        'modals.insights.not_enough_data': 'Not enough historical data yet',
        'modals.insights.impact_summary': 'Impact Summary',
        'modals.insights.engagement_rate_prefix':
          'This post has an engagement rate of ',
        'modals.insights.above_average':
          ' You are beating your category average.',
        'modals.insights.keep_promoting': ' Keep promoting to gain more reach.',
        'creator.promotions.error_create': 'Error creating promotion',
        'creator.promotions.redirecting': 'Redirecting to secure checkout...',
        'creator.promotions.select_content': 'Select Content',
        'creator.promotions.configure_reach': 'Configure Reach',
        'creator.promotions.boost_best': 'Boost your best content',
        'creator.promotions.untitled': 'Untitled',
        'creator.promotions.no_posts': 'No posts available',
        'creator.promotions.selected_post': 'Selected post',
        'creator.promotions.change_post': 'Change post',
        'creator.promotions.daily_budget': 'Daily Budget ({{currency}})',
        'creator.promotions.campaign_duration': 'Campaign Duration',
        'creator.promotions.days': '{{count}} Days',
        'creator.promotions.boost_total':
          'Boost for {{currency}}{{total}} total',
        'creator.promotions.estimated_reach': 'Estimated reach',
        'creator.promotions.objective': 'Objective',
        'creator.promotions.objective_profile': 'Profile Visits',
        'creator.promotions.objective_follows': 'Get Followers',
        'creator.promotions.objective_conversions': 'Subscription Conversions',
        'creator.promotions.countries_placeholder':
          'Countries (comma-separated, optional)',
        'creator.promotions.interests_placeholder':
          'Interests (comma-separated, optional)',
        'creator.promotions.investment': 'Investment',
        'creator.promotions.per_day': 'day',
        'creator.promotions.campaign_objective': 'Campaign Objective',
        'creator.promotions.countries_hint': 'Countries (e.g. ES, MX, US)',
        'creator.promotions.all_countries': 'All countries',
        'creator.promotions.interests_hint': 'Interests (e.g. Music, Fashion)',
        'creator.promotions.all_interests': 'All interests',
        'post.menu.promote': 'Boost Post',
        'profile.stats.followers': 'Followers',
        'profile.stats.following': 'Following',
        'profile.empty.no_users_found': 'No users found.',
        'profile.about.title': 'About this account',
        'profile.about.joined': 'Joined',
        'profile.about.email': 'Email confirmed',
        'profile.about.identity': 'Identity verified',
        'profile.about.account_type': 'Account type',
        'profile.about.country': 'Country',
        'profile.about.activity_label': 'Recent activity',
        'profile.about.standing': 'Account status',
        'profile.about.suspended': 'Suspended',
        'profile.about.in_good_standing': 'In good standing',
        'profile.about.strikes': 'Moderation strikes',
        'profile.about.yes': 'Yes',
        'profile.about.no': 'No',
        'profile.about.bot_label': 'Possibly automated',
        'profile.about.bot_label_hint':
          'Staff applied this label after review. The account owner can appeal in Settings.',
        'profile.about.identity_disclaimer':
          'Identity verified means government ID checked via Stripe Identity. It is separate from a paid plan badge.',
        'mute.title': 'Mute {{username}}',
        'mute.subtitle':
          'Their posts will be hidden from your feed. They will not be notified.',
        'mute.confirm': 'Mute',
        'mute.duration.24h': '24 hours',
        'mute.duration.7d': '7 days',
        'mute.duration.30d': '30 days',
        'mute.duration.forever': 'Forever',
      };
      let val = translations[key] || key;
      if (options && typeof options === 'object') {
        if (options.count !== undefined) {
          val = val.replace('{{count}}', options.count.toString());
        }
        if (options.plan !== undefined) {
          val = val.replace('{{plan}}', String(options.plan));
        }
        if (options.visibility !== undefined) {
          val = val.replace('{{visibility}}', String(options.visibility));
        }
        if (options.username !== undefined) {
          val = val.replace('{{username}}', String(options.username));
        }
        if (options.type !== undefined) {
          val = val.replace('{{type}}', String(options.type));
        }
        if (options.name !== undefined) {
          val = val.replace('{{name}}', String(options.name));
        }
        if (options.percent !== undefined) {
          val = val.replace('{{percent}}', String(options.percent));
        }
        if (options.date !== undefined) {
          val = val.replace('{{date}}', String(options.date));
        }
        if (options.currency !== undefined) {
          val = val.replace('{{currency}}', String(options.currency));
        }
        if (options.total !== undefined) {
          val = val.replace('{{total}}', String(options.total));
        }
        if (options.defaultValue) {
          val = options.defaultValue;
        }
      } else if (typeof options === 'string') {
        // Prefer catalog entry when present; fallback string only if missing
        if (!translations[key]) {
          val = options;
        }
        if (extra && typeof extra === 'object') {
          if (extra.type !== undefined) {
            val = val.replace('{{type}}', String(extra.type));
          }
          if (extra.username !== undefined) {
            val = val.replace('{{username}}', String(extra.username));
          }
        }
      }
      return val;
    },
    i18n: {
      changeLanguage: () => Promise.resolve(),
      language: 'en',
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: () => {},
  },
}));
