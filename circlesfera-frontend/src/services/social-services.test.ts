import { beforeEach, describe, expect, it, vi } from 'vitest';

// The rest of the service clients, the same way as the critical ones: each
// method must use the right HTTP method, path, query and body.
const client = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('./api', () => ({ apiClient: client }));

import { adminAuthApi } from './admin-auth.service';
import { aiApi } from './ai.service';
import { audioApi } from './audio.service';
import { chatApi } from './chat.service';
import { closeFriendsApi } from './closeFriends.service';
import { collectionsApi } from './collections.service';
import { commentsApi } from './comments.service';
import { creatorApi } from './creator.service';
import { getLatestDataExport, requestDataExport } from './data-export.service';
import { editsService } from './edits.service';
import { feedApi } from './feed.service';
import { followsApi } from './follows.service';
import { highlightsApi } from './highlights.service';
import { interactiveApi } from './interactive.service';
import { likesApi } from './likes.service';
import { liveApi } from './live';
import { notificationsApi } from './notifications.service';
import { placesApi } from './places.service';
import { postsApi } from './posts.service';
import { pushApi } from './push.service';
import { searchApi } from './search.service';
import { storiesApi } from './stories.service';
import { uploadApi } from './upload.service';
import { usersApi } from './users.service';

type Verb = keyof typeof client;
type Case = [name: string, call: () => unknown, verb: Verb, args: unknown[]];

const paged = (page: number, limit: number, more: object = {}) => ({
  params: { page, limit, ...more },
});
const form = new FormData();
const state = { filter: 'none', adjustments: {} };

const cases: Case[] = [
  // Posts and the feed
  [
    'posts.create',
    () => postsApi.create({ caption: 'c' } as never),
    'post',
    ['posts', { caption: 'c' }],
  ],
  [
    'posts.getAll',
    () => postsApi.getAll(),
    'get',
    ['posts', paged(1, 10, { sort: 'latest' })],
  ],
  [
    'posts.getAll trending',
    () => postsApi.getAll(2, 5, 'trending'),
    'get',
    ['posts', paged(2, 5, { sort: 'trending' })],
  ],
  [
    'posts.getFrames',
    () => postsApi.getFrames(),
    'get',
    ['posts/frames', paged(1, 10)],
  ],
  [
    'posts.getFrames page',
    () => postsApi.getFrames(3, 4),
    'get',
    ['posts/frames', paged(3, 4)],
  ],
  [
    'posts.getByUser',
    () => postsApi.getByUser('ana'),
    'get',
    ['posts/user/ana', paged(1, 10, { type: undefined })],
  ],
  [
    'posts.getByUser of a type',
    () => postsApi.getByUser('ana', 2, 9, 'FRAME'),
    'get',
    ['posts/user/ana', paged(2, 9, { type: 'FRAME' })],
  ],
  [
    'posts.getTagged',
    () => postsApi.getTagged('ana'),
    'get',
    ['posts/user/ana/tagged', paged(1, 10)],
  ],
  [
    'posts.getTagged page',
    () => postsApi.getTagged('ana', 2, 6),
    'get',
    ['posts/user/ana/tagged', paged(2, 6)],
  ],
  ['posts.getById', () => postsApi.getById('p1'), 'get', ['posts/p1']],
  ['posts.delete', () => postsApi.delete('p1'), 'delete', ['/posts/p1']],
  [
    'posts.adminDelete',
    () => postsApi.adminDelete('p1'),
    'delete',
    ['/posts/p1/admin'],
  ],
  [
    'posts.getByTag',
    () => postsApi.getByTag('sea'),
    'get',
    ['/posts/tags/sea', paged(1, 10)],
  ],
  [
    'posts.getByTag page',
    () => postsApi.getByTag('sea', 2, 7),
    'get',
    ['/posts/tags/sea', paged(2, 7)],
  ],
  [
    'feed.getForYou',
    () => feedApi.getForYou(),
    'get',
    ['feed/foryou', paged(1, 10, { asOf: undefined })],
  ],
  [
    'feed.getForYou as of a moment',
    () => feedApi.getForYou(2, 5, 't0'),
    'get',
    ['feed/foryou', paged(2, 5, { asOf: 't0' })],
  ],
  [
    'feed.getFollowing',
    () => feedApi.getFollowing(),
    'get',
    ['feed/following', paged(1, 10)],
  ],
  [
    'feed.getFollowing page',
    () => feedApi.getFollowing(2, 5),
    'get',
    ['feed/following', paged(2, 5)],
  ],
  [
    'likes.toggle',
    () => likesApi.toggle('p1'),
    'post',
    ['/posts/p1/likes/toggle'],
  ],
  ['likes.check', () => likesApi.check('p1'), 'get', ['/posts/p1/likes/check']],

  // Comments
  [
    'comments.create',
    () => commentsApi.create('p1', { content: 'hi' } as never),
    'post',
    ['posts/p1/comments', { content: 'hi' }],
  ],
  [
    'comments.getByPost',
    () => commentsApi.getByPost('p1'),
    'get',
    ['posts/p1/comments', paged(1, 10)],
  ],
  [
    'comments.getByPost page',
    () => commentsApi.getByPost('p1', 2, 5),
    'get',
    ['posts/p1/comments', paged(2, 5)],
  ],
  [
    'comments.delete',
    () => commentsApi.delete('p1', 'c1'),
    'delete',
    ['posts/p1/comments/c1'],
  ],
  [
    'comments.like',
    () => commentsApi.like('p1', 'c1'),
    'post',
    ['posts/p1/comments/c1/like'],
  ],
  [
    'comments.unlike',
    () => commentsApi.unlike('p1', 'c1'),
    'delete',
    ['posts/p1/comments/c1/like'],
  ],

  // Stories and highlights
  [
    'stories.create',
    () => storiesApi.create({ url: 'u' } as never),
    'post',
    ['stories', { url: 'u' }],
  ],
  ['stories.getAll', () => storiesApi.getAll(), 'get', ['stories']],
  [
    'stories.getByUser',
    () => storiesApi.getByUser('ana'),
    'get',
    ['stories/user/ana'],
  ],
  [
    'stories.getArchive',
    () => storiesApi.getArchive(),
    'get',
    ['stories/archive'],
  ],
  [
    'stories.markViewed',
    () => storiesApi.markViewed('s1'),
    'post',
    ['stories/s1/view'],
  ],
  [
    'stories.getViews',
    () => storiesApi.getViews('s1'),
    'get',
    ['stories/s1/views', { params: { cursor: undefined, limit: 50 } }],
  ],
  [
    'stories.getViews next page',
    () => storiesApi.getViews('s1', 'c2', 20),
    'get',
    ['stories/s1/views', { params: { cursor: 'c2', limit: 20 } }],
  ],
  [
    'stories.addReaction',
    () => storiesApi.addReaction('s1', '🔥'),
    'post',
    ['stories/s1/react', { reaction: '🔥' }],
  ],
  [
    'stories.getReactions',
    () => storiesApi.getReactions('s1'),
    'get',
    ['stories/s1/reactions', { params: { cursor: undefined, limit: 50 } }],
  ],
  [
    'stories.getReactions next page',
    () => storiesApi.getReactions('s1', 'c2', 20),
    'get',
    ['stories/s1/reactions', { params: { cursor: 'c2', limit: 20 } }],
  ],
  ['stories.delete', () => storiesApi.delete('s1'), 'delete', ['stories/s1']],
  [
    'highlights.create',
    () => highlightsApi.create({ title: 't', storyIds: ['s1'] }),
    'post',
    ['highlights', { title: 't', storyIds: ['s1'] }],
  ],
  [
    'highlights.getProfileHighlights',
    () => highlightsApi.getProfileHighlights('pr1'),
    'get',
    ['highlights/profile/pr1'],
  ],
  [
    'highlights.getUserHighlights',
    () => highlightsApi.getUserHighlights('pr1'),
    'get',
    ['highlights/profile/pr1'],
  ],
  [
    'highlights.getOne',
    () => highlightsApi.getOne('h1'),
    'get',
    ['highlights/h1'],
  ],
  [
    'highlights.update',
    () => highlightsApi.update('h1', { title: 'n' }),
    'patch',
    ['highlights/h1', { title: 'n' }],
  ],
  [
    'highlights.delete',
    () => highlightsApi.delete('h1'),
    'delete',
    ['highlights/h1'],
  ],
  [
    'interactive.createPoll',
    () => interactiveApi.createPoll({ question: 'q', options: ['a', 'b'] }),
    'post',
    ['interactive/poll', { question: 'q', options: ['a', 'b'] }],
  ],
  [
    'interactive.createQna',
    () => interactiveApi.createQna({ prompt: 'p' }),
    'post',
    ['interactive/qna', { prompt: 'p' }],
  ],
  [
    'interactive.getPoll',
    () => interactiveApi.getPoll('k1'),
    'get',
    ['interactive/poll/k1'],
  ],
  [
    'interactive.votePoll',
    () => interactiveApi.votePoll('k1', 1),
    'post',
    ['interactive/poll/vote', { pollId: 'k1', optionIndex: 1 }],
  ],
  [
    'interactive.getQna',
    () => interactiveApi.getQna('q1'),
    'get',
    ['interactive/qna/q1'],
  ],
  [
    'interactive.answerQna',
    () => interactiveApi.answerQna('q1', 'yes'),
    'post',
    ['interactive/qna/answer', { qnaBoxId: 'q1', answerText: 'yes' }],
  ],

  // People
  [
    'follows.toggle',
    () => followsApi.toggle('ana'),
    'post',
    ['users/ana/follow/toggle'],
  ],
  [
    'follows.check',
    () => followsApi.check('ana'),
    'get',
    ['users/ana/follow/check'],
  ],
  [
    'follows.getFollowers',
    () => followsApi.getFollowers('ana'),
    'get',
    [
      'users/ana/follow/followers',
      { params: { cursor: undefined, limit: 20 } },
    ],
  ],
  [
    'follows.getFollowers next page',
    () => followsApi.getFollowers('ana', 'c2', 5),
    'get',
    ['users/ana/follow/followers', { params: { cursor: 'c2', limit: 5 } }],
  ],
  [
    'follows.getFollowing',
    () => followsApi.getFollowing('ana'),
    'get',
    [
      'users/ana/follow/following',
      { params: { cursor: undefined, limit: 20 } },
    ],
  ],
  [
    'follows.getFollowing next page',
    () => followsApi.getFollowing('ana', 'c2', 5),
    'get',
    ['users/ana/follow/following', { params: { cursor: 'c2', limit: 5 } }],
  ],
  [
    'follows.block',
    () => followsApi.block('ana'),
    'post',
    ['users/ana/follow/block'],
  ],
  [
    'follows.unblock',
    () => followsApi.unblock('ana'),
    'post',
    ['users/ana/follow/unblock'],
  ],
  [
    'follows.getBlocked',
    () => followsApi.getBlocked(),
    'get',
    ['users/me/follow/blocked'],
  ],
  [
    'follows.mute',
    () => followsApi.mute('ana'),
    'post',
    ['users/ana/follow/mute', { duration: 'forever' }],
  ],
  [
    'follows.mute for a week',
    () => followsApi.mute('ana', '7d'),
    'post',
    ['users/ana/follow/mute', { duration: '7d' }],
  ],
  [
    'follows.unmute',
    () => followsApi.unmute('ana'),
    'post',
    ['users/ana/follow/unmute'],
  ],
  [
    'follows.getMuted',
    () => followsApi.getMuted(),
    'get',
    ['users/me/follow/muted'],
  ],
  [
    'follows.getPending',
    () => followsApi.getPending(),
    'get',
    ['users/me/follow/pending'],
  ],
  [
    'follows.acceptRequest',
    () => followsApi.acceptRequest('ana'),
    'post',
    ['users/ana/follow/accept'],
  ],
  [
    'follows.rejectRequest',
    () => followsApi.rejectRequest('ana'),
    'post',
    ['users/ana/follow/reject'],
  ],
  [
    'closeFriends.get',
    () => closeFriendsApi.getCloseFriends(),
    'get',
    ['close-friends'],
  ],
  [
    'closeFriends.toggle',
    () => closeFriendsApi.toggleCloseFriend('f1'),
    'post',
    ['close-friends/f1'],
  ],
  [
    'users.updateLocale',
    () => usersApi.updateLocale('es'),
    'put',
    ['/users/me/locale', { locale: 'es' }],
  ],
  [
    'users.suggestions by default',
    () => usersApi.getSuggestions(),
    'get',
    ['/users/suggestions', { params: { limit: 10 } }],
  ],

  // Search and places
  [
    'search.search',
    () => searchApi.search('sea & sun'),
    'get',
    ['search?q=sea%20%26%20sun'],
  ],
  [
    'search.search verified only',
    () => searchApi.search('ana', true),
    'get',
    ['search?q=ana&verified=true'],
  ],
  [
    'search.searchUsers',
    () => searchApi.searchUsers('a/b'),
    'get',
    ['search/users?q=a%2Fb'],
  ],
  [
    'search.searchPosts',
    () => searchApi.searchPosts('a b'),
    'get',
    ['search/posts?q=a%20b'],
  ],
  [
    'search.searchSemantic',
    () => searchApi.searchSemantic('a b'),
    'get',
    ['search/ai?q=a%20b'],
  ],
  [
    'search.searchSemanticProfiles',
    () => searchApi.searchSemanticProfiles('a b'),
    'get',
    ['search/ai/profiles?q=a%20b'],
  ],
  [
    'search.getTrending',
    () => searchApi.getTrending(),
    'get',
    ['search/trending?limit=10'],
  ],
  [
    'search.getTrending of a size',
    () => searchApi.getTrending(3),
    'get',
    ['search/trending?limit=3'],
  ],
  [
    'search.getHistory',
    () => searchApi.getHistory(),
    'get',
    ['search/history'],
  ],
  [
    'search.clearHistory',
    () => searchApi.clearHistory(),
    'delete',
    ['search/history'],
  ],
  [
    'places.getMap',
    () => placesApi.getMap({ north: 1 } as never),
    'get',
    ['places/map', { params: { north: 1 } }],
  ],
  ['places.getById', () => placesApi.getById('pl1'), 'get', ['places/pl1']],
  [
    'places.getPosts',
    () => placesApi.getPosts('pl1'),
    'get',
    ['places/pl1/posts', paged(1, 21)],
  ],
  [
    'places.getPosts page',
    () => placesApi.getPosts('pl1', 2, 9),
    'get',
    ['places/pl1/posts', paged(2, 9)],
  ],
  [
    'audio.search',
    () => audioApi.search('lo fi'),
    'get',
    ['audio/search?q=lo%20fi'],
  ],
  [
    'audio.getTrending',
    () => audioApi.getTrending(),
    'get',
    ['audio/trending'],
  ],
  ['audio.getById', () => audioApi.getById('a1'), 'get', ['audio/a1']],

  // Collections and notifications
  [
    'collections.create',
    () => collectionsApi.create({ name: 'Trips' }),
    'post',
    ['collections', { name: 'Trips' }],
  ],
  ['collections.getAll', () => collectionsApi.getAll(), 'get', ['collections']],
  [
    'collections.getById',
    () => collectionsApi.getById('c1'),
    'get',
    ['collections/c1'],
  ],
  [
    'collections.update',
    () => collectionsApi.update('c1', { name: 'Sea' }),
    'patch',
    ['collections/c1', { name: 'Sea' }],
  ],
  [
    'collections.delete',
    () => collectionsApi.delete('c1'),
    'delete',
    ['collections/c1'],
  ],
  [
    'notifications.getAll',
    () => notificationsApi.getAll(),
    'get',
    ['notifications', paged(1, 10)],
  ],
  [
    'notifications.getAll page',
    () => notificationsApi.getAll(2, 30),
    'get',
    ['notifications', paged(2, 30)],
  ],
  [
    'notifications.getUnreadCount',
    () => notificationsApi.getUnreadCount(),
    'get',
    ['/notifications/unread-count'],
  ],
  [
    'notifications.markAsRead',
    () => notificationsApi.markAsRead('n1'),
    'put',
    ['/notifications/n1/read'],
  ],
  [
    'notifications.markAllAsRead',
    () => notificationsApi.markAllAsRead(),
    'put',
    ['/notifications/read-all'],
  ],
  [
    'push.getPublicKey',
    () => pushApi.getPublicKey(),
    'get',
    ['/push/public-key'],
  ],
  [
    'push.subscribe',
    () => pushApi.subscribe({ endpoint: 'e' } as never),
    'post',
    ['/push/subscribe', { endpoint: 'e' }],
  ],
  [
    'push.unsubscribe',
    () => pushApi.unsubscribe('https://push.example/a?b=1'),
    'delete',
    ['/push/unsubscribe?endpoint=https%3A%2F%2Fpush.example%2Fa%3Fb%3D1'],
  ],

  // Chat
  [
    'chat.getConversations',
    () => chatApi.getConversations(),
    'get',
    ['/chat/conversations'],
  ],
  [
    'chat.getConversations of the requests',
    () => chatApi.getConversations('requests'),
    'get',
    ['/chat/conversations?folder=requests'],
  ],
  [
    'chat.getConversation',
    () => chatApi.getConversation('c1'),
    'get',
    ['/chat/conversations/c1'],
  ],
  [
    'chat.acceptRequest',
    () => chatApi.acceptRequest('c1'),
    'post',
    ['/chat/conversations/c1/accept'],
  ],
  [
    'chat.declineRequest',
    () => chatApi.declineRequest('c1'),
    'post',
    ['/chat/conversations/c1/decline'],
  ],
  [
    'chat.getUnreadCount',
    () => chatApi.getUnreadCount(),
    'get',
    ['/chat/conversations/unread-count'],
  ],
  [
    'chat.getMessages',
    () => chatApi.getMessages('c1'),
    'get',
    ['/chat/conversations/c1/messages'],
  ],
  [
    'chat.sendMessage',
    () => chatApi.sendMessage({ conversationId: 'c1', content: 'hi' }),
    'post',
    ['/chat/messages', { conversationId: 'c1', content: 'hi' }],
  ],
  [
    'chat.markAsRead',
    () => chatApi.markAsRead('c1'),
    'put',
    ['/chat/conversations/c1/read'],
  ],
  [
    'chat.createGroup',
    () => chatApi.createGroup({ participantIds: ['a', 'b'], name: 'G' }),
    'post',
    ['/chat/conversations', { participantIds: ['a', 'b'], name: 'G' }],
  ],
  [
    'chat.deleteConversation for both',
    () => chatApi.deleteConversation('c1'),
    'delete',
    ['/chat/conversations/c1?mode=both'],
  ],
  [
    'chat.deleteConversation for me',
    () => chatApi.deleteConversation('c1', 'me'),
    'delete',
    ['/chat/conversations/c1?mode=me'],
  ],
  [
    'chat.updateGroup',
    () => chatApi.updateGroup('c1', { name: 'N' }),
    'put',
    ['/chat/conversations/c1/group', { name: 'N' }],
  ],
  [
    'chat.removeParticipant',
    () => chatApi.removeParticipant('c1', 'u2'),
    'delete',
    ['/chat/conversations/c1/participants/u2'],
  ],
  [
    'chat.leaveGroup',
    () => chatApi.leaveGroup('c1'),
    'delete',
    ['/chat/conversations/c1/leave'],
  ],
  [
    'chat.editMessage',
    () => chatApi.editMessage('m1', 'new'),
    'put',
    ['/chat/messages/m1', { content: 'new' }],
  ],
  [
    'chat.deleteMessage',
    () => chatApi.deleteMessage('m1'),
    'delete',
    ['/chat/messages/m1'],
  ],

  // Creator tools
  ['creator.getStats', () => creatorApi.getStats(), 'get', ['creator/stats']],
  [
    'creator.getActivityChart',
    () => creatorApi.getActivityChart(),
    'get',
    ['creator/activity-chart'],
  ],
  [
    'creator.getPosts',
    () => creatorApi.getPosts(),
    'get',
    ['creator/posts', paged(1, 10, { type: undefined })],
  ],
  [
    'creator.getPosts of a type',
    () => creatorApi.getPosts(2, 5, 'FRAME'),
    'get',
    ['creator/posts', paged(2, 5, { type: 'FRAME' })],
  ],
  [
    'creator.getStories',
    () => creatorApi.getStories(),
    'get',
    ['creator/stories', paged(1, 10)],
  ],
  [
    'creator.getStories page',
    () => creatorApi.getStories(2, 5),
    'get',
    ['creator/stories', paged(2, 5)],
  ],
  [
    'creator.getPromotions',
    () => creatorApi.getPromotions(),
    'get',
    ['creator/promotions', paged(1, 10)],
  ],
  [
    'creator.getPromotions page',
    () => creatorApi.getPromotions(2, 5),
    'get',
    ['creator/promotions', paged(2, 5)],
  ],
  [
    'creator.getPostInsights',
    () => creatorApi.getPostInsights('p1'),
    'get',
    ['analytics/post/p1/insights'],
  ],
  [
    'creator.recordPromotionView',
    () => creatorApi.recordPromotionView('pr1'),
    'post',
    ['/creator/promotions/pr1/view'],
  ],
  [
    'creator.createPromotion',
    () =>
      creatorApi.createPromotion({
        targetType: 'POST',
        targetId: 'p1',
        durationDays: 3,
      }),
    'post',
    [
      'creator/promotions',
      { targetType: 'POST', targetId: 'p1', durationDays: 3 },
    ],
  ],
  [
    'creator.trackFrameLoop',
    () => creatorApi.trackFrameLoop('p1'),
    'post',
    ['analytics/post/p1/loop'],
  ],
  [
    'creator.cancelPromotion',
    () => creatorApi.cancelPromotion('pr1'),
    'delete',
    ['creator/promotions/pr1'],
  ],
  [
    'creator.pausePromotion',
    () => creatorApi.pausePromotion('pr1'),
    'post',
    ['creator/promotions/pr1/pause'],
  ],
  [
    'creator.resumePromotion',
    () => creatorApi.resumePromotion('pr1'),
    'post',
    ['creator/promotions/pr1/resume'],
  ],
  [
    'creator.updatePromotion',
    () => creatorApi.updatePromotion('pr1', { objective: 'REACH' }),
    'patch',
    ['creator/promotions/pr1', { objective: 'REACH' }],
  ],
  [
    'creator.getRevenueAnalytics',
    () => creatorApi.getRevenueAnalytics(),
    'get',
    ['creator/analytics/revenue', { params: { period: '30d' } }],
  ],
  [
    'creator.getRevenueAnalytics of a period',
    () => creatorApi.getRevenueAnalytics('7d'),
    'get',
    ['creator/analytics/revenue', { params: { period: '7d' } }],
  ],
  [
    'creator.getAudienceRetentionAnalytics',
    () => creatorApi.getAudienceRetentionAnalytics(),
    'get',
    ['creator/analytics/retention'],
  ],
  [
    'creator.getTopPerformingContent',
    () => creatorApi.getTopPerformingContent(),
    'get',
    ['creator/analytics/top-posts', { params: { limit: 5 } }],
  ],
  [
    'creator.getTopPerformingContent of a size',
    () => creatorApi.getTopPerformingContent(3),
    'get',
    ['creator/analytics/top-posts', { params: { limit: 3 } }],
  ],
  [
    'creator.exportAnalyticsCsv',
    () => creatorApi.exportAnalyticsCsv(),
    'get',
    [
      'creator/analytics/export',
      { params: { period: '30d' }, responseType: 'text' },
    ],
  ],
  [
    'creator.exportAnalyticsCsv of a period',
    () => creatorApi.exportAnalyticsCsv('90d'),
    'get',
    [
      'creator/analytics/export',
      { params: { period: '90d' }, responseType: 'text' },
    ],
  ],

  // The studio
  ['edits.getProjects', () => editsService.getProjects(), 'get', ['/edits']],
  [
    'edits.getProject',
    () => editsService.getProject('e1'),
    'get',
    ['/edits/e1'],
  ],
  [
    'edits.createProject',
    () => editsService.createProject('u', 'video', state, 'Trip'),
    'post',
    ['/edits', { mediaUrl: 'u', mediaType: 'video', state, name: 'Trip' }],
  ],
  [
    'edits.updateProjectState',
    () => editsService.updateProjectState('e1', state),
    'put',
    ['/edits/e1', { state }],
  ],
  [
    'edits.deleteProject',
    () => editsService.deleteProject('e1'),
    'delete',
    ['/edits/e1'],
  ],
  [
    'edits.startCaptions',
    () => editsService.startCaptions('e1', 'clip'),
    'post',
    ['/edits/e1/captions', { clipId: 'clip' }],
  ],
  [
    'edits.getCaptionsJob',
    () => editsService.getCaptionsJob('e1', 'j1'),
    'get',
    ['/edits/e1/captions/j1'],
  ],

  // Live
  [
    'live.getActiveStreams',
    () => liveApi.getActiveStreams(),
    'get',
    ['/live/active'],
  ],
  ['live.getStream', () => liveApi.getStream('l1'), 'get', ['/live/l1']],
  [
    'live.inviteCoHost',
    () => liveApi.inviteCoHost('l1', 'u2'),
    'post',
    ['/live/l1/cohost/invite', { coHostUserId: 'u2' }],
  ],
  [
    'live.acceptCoHostInvite',
    () => liveApi.acceptCoHostInvite('l1'),
    'post',
    ['/live/l1/cohost/accept'],
  ],
  [
    'live.removeCoHost',
    () => liveApi.removeCoHost('l1'),
    'delete',
    ['/live/l1/cohost'],
  ],
  [
    'live.sendGift',
    () => liveApi.sendGift('l1', 'rose', 'https://app.example/back'),
    'post',
    [
      '/live/l1/gift',
      { giftId: 'rose', returnUrl: 'https://app.example/back' },
    ],
  ],
  [
    'live.sendGift back to this page',
    () => liveApi.sendGift('l1', 'rose'),
    'post',
    ['/live/l1/gift', { giftId: 'rose', returnUrl: window.location.href }],
  ],

  // Uploads, alt text and exports of personal data
  [
    'upload.upload',
    () => uploadApi.upload(form),
    'post',
    ['/uploads', form, { headers: { 'Content-Type': 'multipart/form-data' } }],
  ],
  [
    'ai.generateAltText',
    () => aiApi.generateAltText('https://cdn/x.jpg'),
    'post',
    ['/ai/alt-text', { imageUrl: 'https://cdn/x.jpg' }],
  ],
  [
    'dataExport.request',
    () => requestDataExport(),
    'get',
    ['/users/gdpr/export'],
  ],

  // Staff sign-in
  [
    'adminAuth.login',
    () => adminAuthApi.login('a@b.c', 'pw'),
    'post',
    ['/admin-auth/login', { email: 'a@b.c', password: 'pw' }],
  ],
  [
    'adminAuth.verifyMfa',
    () => adminAuthApi.verifyMfa('tok', '123456'),
    'post',
    ['/admin-auth/mfa/verify', { mfaToken: 'tok', code: '123456' }],
  ],
  ['adminAuth.me', () => adminAuthApi.me(), 'get', ['/admin-auth/me']],
  [
    'adminAuth.logout',
    () => adminAuthApi.logout(),
    'post',
    ['/admin-auth/logout'],
  ],
  [
    'adminAuth.refresh',
    () => adminAuthApi.refresh(),
    'post',
    ['/admin-auth/refresh'],
  ],
  [
    'adminAuth.stepUp',
    () => adminAuthApi.stepUp({ totpCode: '123456' }),
    'post',
    ['/admin-auth/step-up', { totpCode: '123456' }],
  ],
];

describe('service clients', () => {
  beforeEach(() => {
    for (const fn of Object.values(client)) {
      fn.mockReset().mockResolvedValue({ data: 'payload' });
    }
  });

  it.each(cases)('%s', async (_name, call, verb, args) => {
    await call();
    expect(client[verb]).toHaveBeenCalledTimes(1);
    expect(client[verb]).toHaveBeenCalledWith(...args);
    for (const [other, fn] of Object.entries(client)) {
      if (other !== verb) expect(fn).not.toHaveBeenCalled();
    }
  });

  it('hand back the data of the answer where they unwrap it', async () => {
    await expect(editsService.getProjects()).resolves.toBe('payload');
    await expect(editsService.getProject('e1')).resolves.toBe('payload');
    await expect(editsService.createProject('u', 'video', state)).resolves.toBe(
      'payload',
    );
    await expect(editsService.updateProjectState('e1', state)).resolves.toBe(
      'payload',
    );
    await expect(editsService.startCaptions('e1', 'c')).resolves.toBe(
      'payload',
    );
    await expect(editsService.getCaptionsJob('e1', 'j')).resolves.toBe(
      'payload',
    );
    await expect(editsService.deleteProject('e1')).resolves.toBeUndefined();
    await expect(liveApi.getActiveStreams()).resolves.toBe('payload');
    await expect(liveApi.getStream('l1')).resolves.toBe('payload');
    await expect(liveApi.inviteCoHost('l1', 'u2')).resolves.toBe('payload');
    await expect(liveApi.acceptCoHostInvite('l1')).resolves.toBe('payload');
    await expect(liveApi.removeCoHost('l1')).resolves.toBe('payload');
    await expect(liveApi.sendGift('l1', 'rose')).resolves.toBe('payload');
    await expect(requestDataExport()).resolves.toBe('payload');
  });

  it('gives the most recent export of personal data', async () => {
    client.get.mockResolvedValue({ data: [{ id: 'new' }, { id: 'old' }] });

    await expect(getLatestDataExport()).resolves.toEqual({ id: 'new' });
    expect(client.get).toHaveBeenCalledWith('/users/gdpr/exports');
  });
});
