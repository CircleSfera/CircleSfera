import { beforeEach, describe, expect, it, vi } from 'vitest';

// The staff panel acts on accounts, content and money: each of its calls
// must use the right HTTP method, path, query and body.
const client = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('./api', () => ({ apiClient: client }));

import { adminApi } from './admin.service';

type Verb = keyof typeof client;
type Case = [name: string, call: () => unknown, verb: Verb, args: unknown[]];

const q = (params: object) => ({ params });
const blob = { responseType: 'blob' };
const audio = { title: 't', artist: 'a', url: 'u', duration: 30 };
const article = { slug: 's', topic: 'ACCOUNT', position: 1, texts: {} };

const cases: Case[] = [
  // Risk cases and figures
  [
    'getRiskCases',
    () => adminApi.getRiskCases(),
    'get',
    ['admin/risk-cases', q({ status: 'OPEN', page: 1, limit: 20 })],
  ],
  [
    'getRiskCases closed',
    () => adminApi.getRiskCases('RESOLVED' as never, 2, 5),
    'get',
    ['admin/risk-cases', q({ status: 'RESOLVED', page: 2, limit: 5 })],
  ],
  [
    'getRiskCaseStats',
    () => adminApi.getRiskCaseStats(),
    'get',
    ['admin/risk-cases/stats'],
  ],
  [
    'resolveRiskCase',
    () => adminApi.resolveRiskCase('r1', 'DISMISS' as never, 'fine'),
    'post',
    ['admin/risk-cases/r1/resolve', { decision: 'DISMISS', note: 'fine' }],
  ],
  ['getStats', () => adminApi.getStats(), 'get', ['/admin/stats']],
  [
    'getEnhancedStats',
    () => adminApi.getEnhancedStats(),
    'get',
    ['/admin/stats/enhanced'],
  ],
  [
    'getSystemHealth',
    () => adminApi.getSystemHealth(),
    'get',
    ['/admin/health'],
  ],
  [
    'getActivityChart',
    () => adminApi.getActivityChart(),
    'get',
    ['admin/stats/activity-chart', q({ days: 14 })],
  ],
  [
    'getActivityChart of a month',
    () => adminApi.getActivityChart(30),
    'get',
    ['admin/stats/activity-chart', q({ days: 30 })],
  ],
  [
    'getTopUsers',
    () => adminApi.getTopUsers(),
    'get',
    ['admin/stats/top-users'],
  ],

  // Accounts
  [
    'getUsers',
    () => adminApi.getUsers(),
    'get',
    [
      '/admin/users',
      q({
        page: 1,
        limit: 50,
        search: '',
        status: undefined,
        role: undefined,
        kycStatus: undefined,
      }),
    ],
  ],
  [
    'getUsers filtered',
    () => adminApi.getUsers(2, 10, 'ana', 'BANNED', 'USER', 'verified'),
    'get',
    [
      '/admin/users',
      q({
        page: 2,
        limit: 10,
        search: 'ana',
        status: 'BANNED',
        role: 'USER',
        kycStatus: 'verified',
      }),
    ],
  ],
  [
    'getKycStats',
    () => adminApi.getKycStats(),
    'get',
    ['/admin/users/kyc/stats'],
  ],
  [
    'updateUserStatus',
    () => adminApi.updateUserStatus('u1', { isActive: false }),
    'patch',
    ['admin/users/u1/status', { isActive: false }],
  ],
  [
    'getUserDetail',
    () => adminApi.getUserDetail('u1'),
    'get',
    ['admin/users/u1/detail'],
  ],
  [
    'getLinkedAccounts',
    () => adminApi.getLinkedAccounts('u1'),
    'get',
    ['admin/users/u1/linked-accounts'],
  ],
  [
    'getTrustScore',
    () => adminApi.getTrustScore('u1'),
    'get',
    ['admin/users/u1/trust-score'],
  ],
  [
    'applyBotLabel',
    () => adminApi.applyBotLabel('u1', 'spam'),
    'post',
    ['admin/users/u1/bot-label', { reason: 'spam' }],
  ],
  [
    'clearBotLabel',
    () => adminApi.clearBotLabel('u1'),
    'delete',
    ['admin/users/u1/bot-label'],
  ],
  [
    'getSignupFunnel',
    () => adminApi.getSignupFunnel(),
    'get',
    ['admin/trust/funnel'],
  ],
  ['banUser', () => adminApi.banUser('u1'), 'patch', ['admin/users/u1/ban']],
  [
    'unbanUser',
    () => adminApi.unbanUser('u1'),
    'patch',
    ['admin/users/u1/unban'],
  ],
  [
    'warnUser',
    () => adminApi.warnUser('u1', 'tone'),
    'patch',
    ['admin/users/u1/warn', { reason: 'tone' }],
  ],
  [
    'suspendUser',
    () => adminApi.suspendUser('u1', 7, 'spam'),
    'patch',
    ['admin/users/u1/suspend', { days: 7, reason: 'spam' }],
  ],
  [
    'restoreUser',
    () => adminApi.restoreUser('u1'),
    'patch',
    ['admin/users/u1/restore'],
  ],
  [
    'updateUserRole',
    () => adminApi.updateUserRole('u1', 'USER'),
    'patch',
    ['/admin/users/u1/role', { role: 'USER' }],
  ],
  [
    'revokeUserKYC',
    () => adminApi.revokeUserKYC('u1'),
    'post',
    ['admin/users/u1/revoke-kyc'],
  ],
  [
    'syncUserKYC',
    () => adminApi.syncUserKYC('u1'),
    'post',
    ['admin/users/u1/sync-kyc'],
  ],
  ['deleteUser', () => adminApi.deleteUser('u1'), 'delete', ['admin/users/u1']],
  [
    'exportUsersCSV',
    () => adminApi.exportUsersCSV(),
    'get',
    ['admin/users/export', blob],
  ],

  // Money
  [
    'getPayoutStats',
    () => adminApi.getPayoutStats(),
    'get',
    ['/admin/payouts/stats'],
  ],
  [
    'getPayouts',
    () => adminApi.getPayouts(),
    'get',
    [
      'admin/payouts',
      q({ page: 1, limit: 20, status: undefined, search: undefined }),
    ],
  ],
  [
    'getPayouts filtered',
    () => adminApi.getPayouts(2, 5, 'failed', 'ana'),
    'get',
    [
      'admin/payouts',
      q({ page: 2, limit: 5, status: 'failed', search: 'ana' }),
    ],
  ],
  [
    'getMonetizationAnalytics',
    () => adminApi.getMonetizationAnalytics(),
    'get',
    ['admin/analytics/monetization'],
  ],
  [
    'getPromotions',
    () => adminApi.getPromotions(),
    'get',
    [
      '/admin/promotions',
      q({ page: 1, limit: 10, status: undefined, search: undefined }),
    ],
  ],
  [
    'getPromotions filtered',
    () => adminApi.getPromotions(2, 5, 'PENDING', 'ana'),
    'get',
    [
      '/admin/promotions',
      q({ page: 2, limit: 5, status: 'PENDING', search: 'ana' }),
    ],
  ],
  [
    'updatePromotion',
    () => adminApi.updatePromotion('p1', 'REJECTED', 'misleading'),
    'patch',
    ['/admin/promotions/p1', { status: 'REJECTED', note: 'misleading' }],
  ],
  [
    'getDisputes',
    () => adminApi.getDisputes({ state: 'open', page: 1 }),
    'get',
    ['admin/disputes', q({ state: 'open', page: 1 })],
  ],
  [
    'getSubscriptions',
    () => adminApi.getSubscriptions({ status: 'active' }),
    'get',
    ['admin/subscriptions', q({ status: 'active' })],
  ],
  ['getPlans', () => adminApi.getPlans(), 'get', ['admin/plans']],
  [
    'updatePlan',
    () => adminApi.updatePlan('pl1', { isActive: false } as never),
    'patch',
    ['admin/plans/pl1', { isActive: false }],
  ],
  [
    'getTransactions',
    () => adminApi.getTransactions(),
    'get',
    [
      'admin/transactions',
      q({ page: 1, limit: 20, status: undefined, search: undefined }),
    ],
  ],
  [
    'getTransactions filtered',
    () => adminApi.getTransactions(3, 5, 'FAILED', 'ana'),
    'get',
    [
      'admin/transactions',
      q({ page: 3, limit: 5, status: 'FAILED', search: 'ana' }),
    ],
  ],
  [
    'getWebhookEvents',
    () => adminApi.getWebhookEvents(),
    'get',
    ['admin/webhooks', q({ page: 1, limit: 20, status: undefined })],
  ],
  [
    'getWebhookEvents failed',
    () => adminApi.getWebhookEvents(2, 5, 'FAILED'),
    'get',
    ['admin/webhooks', q({ page: 2, limit: 5, status: 'FAILED' })],
  ],
  [
    'getWebhookEvent',
    () => adminApi.getWebhookEvent('w1'),
    'get',
    ['admin/webhooks/w1'],
  ],
  [
    'replayWebhookEvent',
    () => adminApi.replayWebhookEvent('w1'),
    'post',
    ['admin/webhooks/w1/replay'],
  ],

  // Content
  [
    'getPosts',
    () => adminApi.getPosts(),
    'get',
    [
      'admin/posts',
      q({
        page: 1,
        limit: 10,
        search: undefined,
        type: undefined,
        userId: undefined,
        moderationStatus: undefined,
      }),
    ],
  ],
  [
    'getPosts filtered',
    () => adminApi.getPosts(2, 5, 'sea', 'FRAME', 'u1', 'HIDDEN'),
    'get',
    [
      'admin/posts',
      q({
        page: 2,
        limit: 5,
        search: 'sea',
        type: 'FRAME',
        userId: 'u1',
        moderationStatus: 'HIDDEN',
      }),
    ],
  ],
  ['deletePost', () => adminApi.deletePost('p1'), 'delete', ['admin/posts/p1']],
  [
    'exportPostsCSV',
    () => adminApi.exportPostsCSV(),
    'get',
    ['admin/posts/export', blob],
  ],
  [
    'getHashtags',
    () => adminApi.getHashtags(),
    'get',
    ['admin/hashtags', q({ page: 1, limit: 20, search: undefined })],
  ],
  [
    'getHashtags searched',
    () => adminApi.getHashtags(2, 5, 'sea'),
    'get',
    ['admin/hashtags', q({ page: 2, limit: 5, search: 'sea' })],
  ],
  [
    'getComments',
    () => adminApi.getComments(),
    'get',
    [
      'admin/comments',
      q({
        page: 1,
        limit: 10,
        search: undefined,
        userId: undefined,
        moderationStatus: undefined,
      }),
    ],
  ],
  [
    'getComments filtered',
    () => adminApi.getComments(2, 5, 'x', 'u1', 'HIDDEN'),
    'get',
    [
      'admin/comments',
      q({
        page: 2,
        limit: 5,
        search: 'x',
        userId: 'u1',
        moderationStatus: 'HIDDEN',
      }),
    ],
  ],
  [
    'deleteComment',
    () => adminApi.deleteComment('c1'),
    'delete',
    ['admin/comments/c1'],
  ],
  [
    'getStories',
    () => adminApi.getStories(),
    'get',
    ['admin/stories', q({ page: 1, limit: 10 })],
  ],
  [
    'getStories filtered',
    () => adminApi.getStories(2, 5, { expired: 'true', userId: 'u1' }),
    'get',
    ['admin/stories', q({ page: 2, limit: 5, expired: 'true', userId: 'u1' })],
  ],
  [
    'deleteStory',
    () => adminApi.deleteStory('s1'),
    'delete',
    ['admin/stories/s1'],
  ],
  [
    'getAudio',
    () => adminApi.getAudio(),
    'get',
    ['admin/audio', q({ page: 1, limit: 10, search: undefined })],
  ],
  [
    'getAudio searched',
    () => adminApi.getAudio(2, 5, 'lo fi'),
    'get',
    ['admin/audio', q({ page: 2, limit: 5, search: 'lo fi' })],
  ],
  [
    'createAudio',
    () => adminApi.createAudio(audio),
    'post',
    ['admin/audio', audio],
  ],
  [
    'updateAudio',
    () => adminApi.updateAudio('a1', audio),
    'patch',
    ['admin/audio/a1', audio],
  ],
  [
    'deleteAudio',
    () => adminApi.deleteAudio('a1'),
    'delete',
    ['admin/audio/a1'],
  ],
  [
    'getLiveStreams',
    () => adminApi.getLiveStreams(),
    'get',
    [
      'admin/live',
      q({ page: 1, limit: 20, status: undefined, userId: undefined }),
    ],
  ],
  [
    'getLiveStreams filtered',
    () => adminApi.getLiveStreams(2, 5, 'LIVE', 'u1'),
    'get',
    ['admin/live', q({ page: 2, limit: 5, status: 'LIVE', userId: 'u1' })],
  ],
  [
    'endLiveStream',
    () => adminApi.endLiveStream('l1'),
    'post',
    ['admin/live/l1/end'],
  ],

  // Reports and moderation
  [
    'getReports',
    () => adminApi.getReports(),
    'get',
    [
      'admin/reports',
      q({
        page: 1,
        limit: 10,
        search: undefined,
        status: undefined,
        userId: undefined,
        assignedAdminId: undefined,
      }),
    ],
  ],
  [
    'getReports filtered',
    () => adminApi.getReports(2, 5, 'x', 'PENDING', 'u1', 'adm1'),
    'get',
    [
      'admin/reports',
      q({
        page: 2,
        limit: 5,
        search: 'x',
        status: 'PENDING',
        userId: 'u1',
        assignedAdminId: 'adm1',
      }),
    ],
  ],
  [
    'updateReport',
    () =>
      adminApi.updateReport('r1', { status: 'RESOLVED', internalNotes: 'n' }),
    'patch',
    ['admin/reports/r1', { status: 'RESOLVED', internalNotes: 'n' }],
  ],
  [
    'claimReport',
    () => adminApi.claimReport('r1'),
    'post',
    ['admin/reports/r1/claim'],
  ],
  [
    'unclaimReport',
    () => adminApi.unclaimReport('r1'),
    'post',
    ['admin/reports/r1/unclaim'],
  ],
  [
    'reassignReport',
    () => adminApi.reassignReport('r1', 'adm2'),
    'post',
    ['admin/reports/r1/reassign', { toAdminId: 'adm2' }],
  ],
  [
    'bulkUpdateReports',
    () => adminApi.bulkUpdateReports(['r1', 'r2'], 'DISMISSED'),
    'post',
    ['admin/reports/bulk', { ids: ['r1', 'r2'], status: 'DISMISSED' }],
  ],
  [
    'resolveReportWithPenalty',
    () => adminApi.resolveReportWithPenalty('r1', 'STRIKE'),
    'post',
    ['admin/reports/r1/resolve-penalty', { action: 'STRIKE' }],
  ],
  [
    'getTrustQueue',
    () => adminApi.getTrustQueue(),
    'get',
    ['admin/trust/queue'],
  ],
  [
    'getAuditLogs',
    () => adminApi.getAuditLogs(),
    'get',
    ['admin/audit-logs', q({ page: 1, limit: 50 })],
  ],
  [
    'getAuditLogs filtered',
    () => adminApi.getAuditLogs(2, 10, { action: 'BAN', from: '2026-01-01' }),
    'get',
    [
      'admin/audit-logs',
      q({ page: 2, limit: 10, action: 'BAN', from: '2026-01-01' }),
    ],
  ],
  [
    'getModerationQueue',
    () => adminApi.getModerationQueue(),
    'get',
    [
      'admin/moderation/queue',
      q({ page: 1, limit: 10, type: undefined, search: undefined }),
    ],
  ],
  [
    'getModerationQueue filtered',
    () => adminApi.getModerationQueue(2, 5, 'POST', 'x'),
    'get',
    [
      'admin/moderation/queue',
      q({ page: 2, limit: 5, type: 'POST', search: 'x' }),
    ],
  ],
  [
    'updateModerationStatus',
    () => adminApi.updateModerationStatus('STORY', 's1', 'HIDDEN', 'graphic'),
    'patch',
    ['admin/moderation/STORY/s1', { status: 'HIDDEN', note: 'graphic' }],
  ],
  [
    'getFirewallRules',
    () => adminApi.getFirewallRules(),
    'get',
    ['admin/firewall/rules', q({ page: 1, limit: 20, search: undefined })],
  ],
  [
    'getFirewallRules searched',
    () => adminApi.getFirewallRules(2, 5, 'spam'),
    'get',
    ['admin/firewall/rules', q({ page: 2, limit: 5, search: 'spam' })],
  ],
  [
    'createFirewallRule',
    () => adminApi.createFirewallRule({ keyword: 'spam', action: 'BLOCK' }),
    'post',
    ['admin/firewall/rules', { keyword: 'spam', action: 'BLOCK' }],
  ],
  [
    'updateFirewallRule',
    () => adminApi.updateFirewallRule('f1', { isActive: false }),
    'patch',
    ['admin/firewall/rules/f1', { isActive: false }],
  ],
  [
    'deleteFirewallRule',
    () => adminApi.deleteFirewallRule('f1'),
    'delete',
    ['admin/firewall/rules/f1'],
  ],
  [
    'getFirewallSignatures',
    () => adminApi.getFirewallSignatures(),
    'get',
    ['admin/firewall', q({ page: 1, limit: 20 })],
  ],
  [
    'getFirewallSignatures page',
    () => adminApi.getFirewallSignatures(2, 5),
    'get',
    ['admin/firewall', q({ page: 2, limit: 5 })],
  ],
  [
    'addFirewallSignature',
    () => adminApi.addFirewallSignature('buy now', 'SPAM'),
    'post',
    ['admin/firewall', { text: 'buy now', category: 'SPAM' }],
  ],
  [
    'deleteFirewallSignature',
    () => adminApi.deleteFirewallSignature('f1'),
    'delete',
    ['admin/firewall/f1'],
  ],

  // Access to the product and tests
  [
    'getWhitelist',
    () => adminApi.getWhitelist(),
    'get',
    ['admin/whitelist', q({ page: 1, limit: 10, search: undefined })],
  ],
  [
    'getWhitelist searched',
    () => adminApi.getWhitelist(2, 5, 'ana'),
    'get',
    ['admin/whitelist', q({ page: 2, limit: 5, search: 'ana' })],
  ],
  [
    'createWhitelist',
    () => adminApi.createWhitelist({ email: 'a@b.c', name: 'Ana' }),
    'post',
    ['admin/whitelist', { email: 'a@b.c', name: 'Ana' }],
  ],
  [
    'updateWhitelist',
    () => adminApi.updateWhitelist('w1', { name: 'Ana' } as never),
    'patch',
    ['admin/whitelist/w1', { name: 'Ana' }],
  ],
  [
    'deleteWhitelist',
    () => adminApi.deleteWhitelist('w1'),
    'delete',
    ['admin/whitelist/w1'],
  ],
  [
    'sendBroadcast',
    () => adminApi.sendBroadcast({ subject: 's', title: 't', content: 'c' }),
    'post',
    ['admin/broadcast', { subject: 's', title: 't', content: 'c' }],
  ],
  [
    'getUserExperiments',
    () => adminApi.getUserExperiments(),
    'get',
    ['admin/experiments/users', q({ page: 1, limit: 20, search: undefined })],
  ],
  [
    'getUserExperiments searched',
    () => adminApi.getUserExperiments(2, 5, 'ana'),
    'get',
    ['admin/experiments/users', q({ page: 2, limit: 5, search: 'ana' })],
  ],
  [
    'assignUserExperiment',
    () => adminApi.assignUserExperiment('u1', 'new_feed', 'B'),
    'post',
    [
      'admin/experiments/users',
      { userId: 'u1', experimentKey: 'new_feed', variant: 'B' },
    ],
  ],
  [
    'removeUserExperiment',
    () => adminApi.removeUserExperiment('x1'),
    'delete',
    ['admin/experiments/users/x1'],
  ],
  [
    'getFeatureFlags',
    () => adminApi.getFeatureFlags(),
    'get',
    ['admin/feature-flags'],
  ],
  [
    'upsertFeatureFlag',
    () =>
      adminApi.upsertFeatureFlag('new_feed', {
        isEnabled: true,
        percentage: 10,
      }),
    'put',
    ['admin/feature-flags/new_feed', { isEnabled: true, percentage: 10 }],
  ],
  [
    'deleteFeatureFlag',
    () => adminApi.deleteFeatureFlag('new_feed'),
    'delete',
    ['admin/feature-flags/new_feed'],
  ],
  [
    'getSystemSettings',
    () => adminApi.getSystemSettings(),
    'get',
    ['admin/settings'],
  ],
  [
    'updateSystemSettings',
    () => adminApi.updateSystemSettings([{ key: 'k', value: 'v' }]),
    'patch',
    ['admin/settings', { updates: [{ key: 'k', value: 'v' }] }],
  ],

  // Support
  [
    'getSupportTickets',
    () => adminApi.getSupportTickets(),
    'get',
    [
      'admin/support/tickets',
      q({ page: 1, limit: 20, status: undefined, category: undefined }),
    ],
  ],
  [
    'getSupportTickets of the team',
    () =>
      adminApi.getSupportTickets(2, 5, 'OPEN', 'BILLING', {
        assignment: 'mine',
        priority: 'HIGH',
        target: 'past',
      }),
    'get',
    [
      'admin/support/tickets',
      q({
        page: 2,
        limit: 5,
        status: 'OPEN',
        category: 'BILLING',
        assignment: 'mine',
        priority: 'HIGH',
        target: 'past',
      }),
    ],
  ],
  [
    'getSavedReplies',
    () => adminApi.getSavedReplies(),
    'get',
    ['admin/support/saved-replies'],
  ],
  [
    'createSavedReply',
    () => adminApi.createSavedReply({ title: 't', body: 'b', shared: true }),
    'post',
    ['admin/support/saved-replies', { title: 't', body: 'b', shared: true }],
  ],
  [
    'updateSavedReply',
    () => adminApi.updateSavedReply('sr1', { body: 'b2' }),
    'patch',
    ['admin/support/saved-replies/sr1', { body: 'b2' }],
  ],
  [
    'deleteSavedReply',
    () => adminApi.deleteSavedReply('sr1'),
    'delete',
    ['admin/support/saved-replies/sr1'],
  ],
  [
    'getSupportFigures',
    () => adminApi.getSupportFigures(30),
    'get',
    ['admin/support/tickets/figures', q({ days: 30 })],
  ],
  [
    'getArticles',
    () => adminApi.getArticles(),
    'get',
    ['admin/support/articles'],
  ],
  [
    'getArticle',
    () => adminApi.getArticle('ar1'),
    'get',
    ['admin/support/articles/ar1'],
  ],
  [
    'createArticle',
    () => adminApi.createArticle(article as never),
    'post',
    ['admin/support/articles', article],
  ],
  [
    'updateArticle',
    () => adminApi.updateArticle('ar1', { position: 2 }),
    'patch',
    ['admin/support/articles/ar1', { position: 2 }],
  ],
  [
    'publishArticle',
    () => adminApi.publishArticle('ar1'),
    'post',
    ['admin/support/articles/ar1/publish'],
  ],
  [
    'takeBackArticle',
    () => adminApi.takeBackArticle('ar1'),
    'post',
    ['admin/support/articles/ar1/take-back'],
  ],
  [
    'deleteArticle',
    () => adminApi.deleteArticle('ar1'),
    'delete',
    ['admin/support/articles/ar1'],
  ],
  [
    'getSupportAgents',
    () => adminApi.getSupportAgents(),
    'get',
    ['admin/support/tickets/agents'],
  ],
  [
    'assignSupportTicket',
    () => adminApi.assignSupportTicket('t1', 'agent-1'),
    'post',
    ['admin/support/tickets/t1/assignment', { agentRef: 'agent-1' }],
  ],
  [
    'assignSupportTicket to nobody',
    () => adminApi.assignSupportTicket('t1', null),
    'post',
    ['admin/support/tickets/t1/assignment', { agentRef: null }],
  ],
  [
    'updateSupportTicket',
    () => adminApi.updateSupportTicket('t1', { priority: 'HIGH' }),
    'patch',
    ['admin/support/tickets/t1', { priority: 'HIGH' }],
  ],
  [
    'getSupportTicket',
    () => adminApi.getSupportTicket('t1'),
    'get',
    ['admin/support/tickets/t1'],
  ],
  [
    'addSupportMessage',
    () =>
      adminApi.addSupportMessage('t1', { body: 'hi', visibility: 'INTERNAL' }),
    'post',
    [
      'admin/support/tickets/t1/messages',
      { body: 'hi', visibility: 'INTERNAL' },
    ],
  ],
  [
    'escalateSupportTicket',
    () => adminApi.escalateSupportTicket('t1'),
    'post',
    ['admin/support/tickets/t1/escalate'],
  ],
  [
    'getSupportTicketAccount',
    () => adminApi.getSupportTicketAccount('t1'),
    'get',
    ['admin/support/tickets/t1/account'],
  ],

  // The staff itself
  [
    'getOperators',
    () => adminApi.getOperators(),
    'get',
    [
      'admin/operators',
      q({ page: 1, limit: 20, search: undefined, status: undefined }),
    ],
  ],
  [
    'getOperators filtered',
    () => adminApi.getOperators(2, 5, 'ana', 'DISABLED'),
    'get',
    [
      'admin/operators',
      q({ page: 2, limit: 5, search: 'ana', status: 'DISABLED' }),
    ],
  ],
  [
    'getOperatorRoles',
    () => adminApi.getOperatorRoles(),
    'get',
    ['admin/operators/roles'],
  ],
  [
    'getOperator',
    () => adminApi.getOperator('o1'),
    'get',
    ['admin/operators/o1'],
  ],
  [
    'createOperator',
    () =>
      adminApi.createOperator({
        email: 'a@b.c',
        password: 'pw',
        displayName: 'Ana',
        roleIds: ['r1'],
      }),
    'post',
    [
      'admin/operators',
      { email: 'a@b.c', password: 'pw', displayName: 'Ana', roleIds: ['r1'] },
    ],
  ],
  [
    'updateOperatorStatus',
    () => adminApi.updateOperatorStatus('o1', 'DISABLED'),
    'patch',
    ['admin/operators/o1/status', { status: 'DISABLED' }],
  ],
  [
    'replaceOperatorRoles',
    () => adminApi.replaceOperatorRoles('o1', ['r1', 'r2']),
    'put',
    ['admin/operators/o1/roles', { roleIds: ['r1', 'r2'] }],
  ],
  [
    'resetOperatorMfa',
    () => adminApi.resetOperatorMfa('o1'),
    'post',
    ['admin/operators/o1/reset-mfa'],
  ],
  [
    'resetOperatorPassword',
    () => adminApi.resetOperatorPassword('o1', 'new-pw'),
    'post',
    ['admin/operators/o1/reset-password', { password: 'new-pw' }],
  ],
];

describe('the staff API client', () => {
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

  it('covers every call of the client', () => {
    const tested = new Set(cases.map(([name]) => name.split(' ')[0]));
    const missing = Object.keys(adminApi).filter((name) => !tested.has(name));
    expect(missing).toEqual([]);
  });

  it('hands back the data of the answer where it unwraps it', async () => {
    await expect(adminApi.getRiskCases()).resolves.toBe('payload');
    await expect(adminApi.getRiskCaseStats()).resolves.toBe('payload');
    await expect(
      adminApi.resolveRiskCase('r1', 'DISMISS' as never),
    ).resolves.toBe('payload');
    await expect(adminApi.getStats()).resolves.toBe('payload');
    await expect(adminApi.getEnhancedStats()).resolves.toBe('payload');
    await expect(adminApi.getSystemHealth()).resolves.toBe('payload');
    await expect(adminApi.getSystemSettings()).resolves.toBe('payload');
    await expect(adminApi.updateSystemSettings([])).resolves.toBe('payload');
  });
});
