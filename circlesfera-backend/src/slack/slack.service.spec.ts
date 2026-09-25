import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIService } from '../ai/ai.service.js';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SlackService } from './slack.service.js';

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}));

describe('SlackService', () => {
  let service: SlackService;

  const mockPrismaService = {
    user: {
      count: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    post: {
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    comment: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    report: {
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    platformSubscription: {
      count: vi.fn(),
    },
    supportTicket: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };

  const mockEmailService = {
    sendSupportReplyEmail: vi.fn(),
  };

  const mockAIService = {
    generateMorningBriefing: vi.fn(),
    moderateContent: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn((key: string) => {
      switch (key) {
        case 'SLACK_BOT_TOKEN':
          return 'xoxb-mock-token';
        case 'SLACK_WEBHOOK_URL':
          return 'https://hooks.slack.com/services/default';
        case 'SLACK_WEBHOOK_ALERTS':
          return 'https://hooks.slack.com/services/alerts';
        case 'SLACK_WEBHOOK_MODERATION':
          return 'https://hooks.slack.com/services/moderation';
        case 'SLACK_WEBHOOK_PAYMENTS':
          return 'https://hooks.slack.com/services/payments';
        case 'SLACK_WEBHOOK_SUPPORT':
          return 'https://hooks.slack.com/services/support';
        default:
          return null;
      }
    }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    (axios.post as any).mockResolvedValue({ data: 'ok' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlackService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: AIService, useValue: mockAIService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<SlackService>(SlackService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendMessage error and fallback handling', () => {
    it('skips gracefully if webhook is not configured', async () => {
      // Create service instance with no webhook URLs
      const emptyConfig = { get: vi.fn().mockReturnValue(undefined) };
      const emptyService = new SlackService(
        mockPrismaService as any,
        mockEmailService as any,
        mockAIService as any,
        emptyConfig as any,
      );

      await emptyService.sendProductionAlert({ message: 'No webhook alert' });
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('recovers on retry after a transient axios failure', async () => {
      (axios.post as any)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ data: 'ok' });

      await expect(
        service.sendProductionAlert({ message: 'Axios fails once' }),
      ).resolves.not.toThrow();
      expect(axios.post).toHaveBeenCalledTimes(2);
    });

    it('retries up to 3 attempts total and logs SLACK_DELIVERY_FAILED when every attempt fails (INT-001)', async () => {
      (axios.post as any).mockRejectedValue(new Error('Slack is down'));

      await expect(
        service.sendProductionAlert({ message: 'Axios always fails' }),
      ).resolves.not.toThrow();
      expect(axios.post).toHaveBeenCalledTimes(3);
    });
  });

  describe('sendProductionAlert & handleSystemIncident', () => {
    it('sends production alert with correlationId and stacktrace', async () => {
      await service.sendProductionAlert({
        message: 'Fatal error',
        stack: 'Error at file.ts:1',
        path: '/api/v1/fail',
        correlationId: 'corr-123',
      });

      expect(axios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/alerts',
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              type: 'header',
              text: { type: 'plain_text', text: '🚨 Production Error 🚨' },
            }),
          ]),
        }),
        { timeout: 5_000 },
      );
    });

    it('delegates handleSystemIncident to sendProductionAlert', async () => {
      const spy = vi
        .spyOn(service, 'sendProductionAlert')
        .mockResolvedValue(undefined);

      await service.handleSystemIncident({
        message: 'System crash',
        path: '/api/crash',
      });

      expect(spy).toHaveBeenCalledWith({
        message: 'System crash',
        path: '/api/crash',
      });
    });
  });

  describe('sendModerationAlert', () => {
    it('sends moderation alert with details and interactive action buttons', async () => {
      await service.sendModerationAlert({
        reportId: 'rep-1',
        reporterId: 'user-1',
        targetType: 'POST',
        targetId: 'post-1',
        reason: 'SPAM',
        details: 'Offensive advertising',
      });

      expect(axios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/moderation',
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              type: 'header',
              text: { type: 'plain_text', text: '🛡️ New Moderation Report' },
            }),
            expect.objectContaining({
              type: 'actions',
            }),
          ]),
        }),
        { timeout: 5_000 },
      );
    });

    it('sends moderation alert without details', async () => {
      await service.sendModerationAlert({
        reportId: 'rep-2',
        reporterId: 'user-2',
        targetType: 'COMMENT',
        targetId: 'comm-1',
        reason: 'HARASSMENT',
      });

      expect(axios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/moderation',
        expect.any(Object),
        { timeout: 5_000 },
      );
    });
  });

  describe('sendPaymentAlert', () => {
    it('sends payment alert with full metadata', async () => {
      await service.sendPaymentAlert({
        eventType: 'charge.succeeded',
        amount: 2500,
        currency: 'eur',
        userId: 'usr-1',
        description: 'Pro Subscription',
      });

      expect(axios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/payments',
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              type: 'header',
              text: { type: 'plain_text', text: '💰 Payment Activity' },
            }),
          ]),
        }),
        { timeout: 5_000 },
      );
    });

    it('sends payment alert with minimal metadata', async () => {
      await service.sendPaymentAlert({
        eventType: 'invoice.payment_failed',
      });

      expect(axios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/payments',
        expect.any(Object),
        { timeout: 5_000 },
      );
    });
  });

  describe('sendSupportAlert', () => {
    it('sends support alert with ticket details and reply button', async () => {
      const ticket: any = {
        id: 'tick-1',
        email: 'user@example.com',
        subject: 'Cannot login',
        message: 'Passkey error occurred',
      };

      await service.sendSupportAlert(ticket);

      expect(axios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/support',
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              type: 'header',
              text: { type: 'plain_text', text: '🎟️ Nuevo Ticket de Soporte' },
            }),
          ]),
        }),
        { timeout: 5_000 },
      );
    });
  });

  describe('handleStatsCommand', () => {
    it('returns dashboard blocks with aggregated metrics', async () => {
      mockPrismaService.user.count
        .mockResolvedValueOnce(150)
        .mockResolvedValueOnce(5);
      mockPrismaService.post.count.mockResolvedValueOnce(45);
      mockPrismaService.report.count.mockResolvedValueOnce(3);

      const res = await service.handleStatsCommand();

      expect(res.response_type).toBe('in_channel');
      expect(res.blocks).toHaveLength(2);
      expect(res.blocks[0].text.text).toBe('📊 CircleSfera Metrics Dashboard');
    });

    it('handles database error and returns error text', async () => {
      mockPrismaService.user.count.mockRejectedValueOnce(
        new Error('DB failure'),
      );

      const res = await service.handleStatsCommand();

      expect(res.text).toBe('❌ Error fetching stats from database.');
    });
  });

  describe('handleUserCommand', () => {
    it('returns prompt if text is empty or whitespace', async () => {
      const res = await service.handleUserCommand('   ');
      expect(res.text).toContain('Por favor, proporciona un email');
    });

    it('returns not found if user does not exist', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      const res = await service.handleUserCommand('nonexistent');
      expect(res.text).toContain(
        'No se ha encontrado ningún usuario con: `nonexistent`',
      );
    });

    it('returns formatted user card when user has profiles, bio, and post', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'usr-1',
        email: 'user@circle.com',
        isActive: true,
        role: 'USER',
        createdAt: new Date('2026-01-15T12:00:00Z'),
        profiles: [
          {
            username: 'shading',
            bio: 'Creator of worlds',
            verificationLevel: 'VERIFIED',
            posts: [{ caption: 'First post on CircleSfera!' }],
          },
        ],
      });

      const res = await service.handleUserCommand('shading');

      expect(res.response_type).toBe('in_channel');
      expect(res.blocks[0].text.text).toContain('@shading');
      expect(
        res.blocks.some((b: any) => b.text?.text?.includes('First post')),
      ).toBe(true);
    });

    it('returns formatted user card when user has no bio and empty posts', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'usr-2',
        email: 'nobio@circle.com',
        isActive: false,
        role: 'USER',
        createdAt: new Date('2026-01-15T12:00:00Z'),
        profiles: [
          {
            username: 'nobio',
            bio: null,
            verificationLevel: null,
            posts: [],
          },
        ],
      });

      const res = await service.handleUserCommand('nobio');

      expect(res.response_type).toBe('in_channel');
      expect(res.blocks[0].text.text).toContain('@nobio');
    });

    it('catches database error and returns error text', async () => {
      mockPrismaService.user.findFirst.mockRejectedValue(
        new Error('DB failure'),
      );

      const res = await service.handleUserCommand('erroruser');
      expect(res.text).toBe(
        '❌ Error al buscar el usuario en la base de datos.',
      );
    });
  });

  describe('sendDailyMorningBriefing', () => {
    it('skips if alertsWebhookUrl is not configured', async () => {
      const emptyConfig = { get: vi.fn().mockReturnValue(null) };
      const customService = new SlackService(
        mockPrismaService as any,
        mockEmailService as any,
        mockAIService as any,
        emptyConfig as any,
      );

      await customService.sendDailyMorningBriefing();
      expect(mockAIService.generateMorningBriefing).not.toHaveBeenCalled();
    });

    it('collects metrics, calls AI service, and sends morning briefing', async () => {
      mockPrismaService.user.count.mockResolvedValue(10);
      mockPrismaService.post.count.mockResolvedValue(25);
      mockPrismaService.report.count.mockResolvedValue(1);
      mockPrismaService.platformSubscription.count.mockResolvedValue(4);
      mockAIService.generateMorningBriefing.mockResolvedValue(
        'All systems flourishing.',
      );

      await service.sendDailyMorningBriefing();

      expect(mockAIService.generateMorningBriefing).toHaveBeenCalledWith({
        newUsers: 10,
        newPosts: 25,
        pendingReports: 1,
        newSubscriptions: 4,
      });
      expect(axios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/alerts',
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              type: 'header',
              text: { type: 'plain_text', text: '🌅 Morning Briefing (AI)' },
            }),
          ]),
        }),
        { timeout: 5_000 },
      );
    });

    it('catches and logs errors during briefing generation', async () => {
      mockPrismaService.user.count.mockRejectedValue(
        new Error('Briefing error'),
      );

      await expect(service.sendDailyMorningBriefing()).resolves.not.toThrow();
    });
  });

  describe('handleModerationInteraction', () => {
    it('returns early when actions are absent', async () => {
      const res = await service.handleModerationInteraction({});
      expect(res).toBeUndefined();
    });

    it('returns error when reportId cannot be parsed', async () => {
      const res = await service.handleModerationInteraction({
        actions: [{ action_id: 'moderate_ignore', value: 'invalid' }],
      });
      expect(res).toEqual({ text: 'Invalid report ID' });
    });

    it('returns error when report is not found in database', async () => {
      mockPrismaService.report.findUnique.mockResolvedValue(null);

      const res = await service.handleModerationInteraction({
        actions: [{ action_id: 'moderate_ignore', value: 'ignore_rep-404' }],
      });
      expect(res).toEqual({ text: 'Report not found' });
    });

    it('handles moderate_ignore by resolving report and updating message via chat.update', async () => {
      mockPrismaService.report.findUnique.mockResolvedValue({ id: 'rep-1' });
      mockPrismaService.report.update.mockResolvedValue({
        id: 'rep-1',
        status: 'RESOLVED',
      });

      const payload = {
        user: { username: 'mod_admin' },
        actions: [{ action_id: 'moderate_ignore', value: 'ignore_rep-1' }],
        channel: { id: 'C12345' },
        message: { blocks: [{ type: 'actions' }], ts: '1234567890.123456' },
      };

      const res = await service.handleModerationInteraction(payload);

      expect(mockPrismaService.report.update).toHaveBeenCalledWith({
        where: { id: 'rep-1' },
        data: { status: 'RESOLVED' },
      });
      expect(axios.post).toHaveBeenCalledWith(
        'https://slack.com/api/chat.update',
        expect.objectContaining({
          channel: 'C12345',
          ts: '1234567890.123456',
        }),
        expect.objectContaining({ timeout: 5_000 }),
      );
      expect(res.text).toContain('Report ignored by @mod_admin');
    });

    it('handles moderate_delete for POST', async () => {
      mockPrismaService.report.findUnique.mockResolvedValue({
        id: 'rep-post',
        targetType: 'POST',
        targetId: 'post-1',
      });

      const payload = {
        user: { username: 'mod_admin' },
        actions: [{ action_id: 'moderate_delete', value: 'delete_rep-post' }],
      };

      const res = await service.handleModerationInteraction(payload);

      expect(mockPrismaService.post.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { moderationStatus: 'REMOVED' },
      });
      expect(mockPrismaService.report.update).toHaveBeenCalledWith({
        where: { id: 'rep-post' },
        data: { status: 'RESOLVED' },
      });
      expect(res.text).toContain('Post deleted by @mod_admin');
    });

    it('handles moderate_delete for COMMENT', async () => {
      mockPrismaService.report.findUnique.mockResolvedValue({
        id: 'rep-comm',
        targetType: 'COMMENT',
        targetId: 'comm-1',
      });

      const payload = {
        user: { username: 'mod_admin' },
        actions: [{ action_id: 'moderate_delete', value: 'delete_rep-comm' }],
      };

      const res = await service.handleModerationInteraction(payload);

      expect(mockPrismaService.comment.update).toHaveBeenCalledWith({
        where: { id: 'comm-1' },
        data: { moderationStatus: 'REMOVED' },
      });
      expect(res.text).toContain('Comment deleted by @mod_admin');
    });

    it('handles moderate_delete for unhandled target type', async () => {
      mockPrismaService.report.findUnique.mockResolvedValue({
        id: 'rep-other',
        targetType: 'PROFILE',
        targetId: 'prof-1',
      });

      const payload = {
        user: { username: 'mod_admin' },
        actions: [{ action_id: 'moderate_delete', value: 'delete_rep-other' }],
      };

      const res = await service.handleModerationInteraction(payload);

      expect(res.text).toContain('Cannot delete target type: PROFILE');
    });

    it('handles moderate_ban for USER target type', async () => {
      mockPrismaService.report.findUnique.mockResolvedValue({
        id: 'rep-user',
        targetType: 'USER',
        targetId: 'usr-1',
      });

      const payload = {
        user: { username: 'mod_admin' },
        actions: [{ action_id: 'moderate_ban', value: 'ban_rep-user' }],
      };

      const res = await service.handleModerationInteraction(payload);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'usr-1' },
        data: { isActive: false },
      });
      expect(res.text).toContain('User banned by @mod_admin');
    });

    it('handles moderate_ban for POST target type', async () => {
      mockPrismaService.report.findUnique.mockResolvedValue({
        id: 'rep-post-ban',
        targetType: 'POST',
        targetId: 'post-1',
      });
      mockPrismaService.post.findUnique.mockResolvedValue({
        profileId: 'usr-author',
      });

      const payload = {
        user: { username: 'mod_admin' },
        actions: [{ action_id: 'moderate_ban', value: 'ban_rep-post-ban' }],
      };

      const res = await service.handleModerationInteraction(payload);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'usr-author' },
        data: { isActive: false },
      });
      expect(res.text).toContain('User banned by @mod_admin');
    });

    it('handles moderate_ban for COMMENT target type', async () => {
      mockPrismaService.report.findUnique.mockResolvedValue({
        id: 'rep-comment-ban',
        targetType: 'COMMENT',
        targetId: 'comm-1',
      });
      mockPrismaService.comment.findUnique.mockResolvedValue({
        profileId: 'usr-commenter',
      });

      const payload = {
        user: { username: 'mod_admin' },
        actions: [{ action_id: 'moderate_ban', value: 'ban_rep-comment-ban' }],
      };

      const res = await service.handleModerationInteraction(payload);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'usr-commenter' },
        data: { isActive: false },
      });
      expect(res.text).toContain('User banned by @mod_admin');
    });

    it('handles moderate_ban when target user cannot be found', async () => {
      mockPrismaService.report.findUnique.mockResolvedValue({
        id: 'rep-lost',
        targetType: 'POST',
        targetId: 'post-404',
      });
      mockPrismaService.post.findUnique.mockResolvedValue(null);

      const payload = {
        user: { username: 'mod_admin' },
        actions: [{ action_id: 'moderate_ban', value: 'ban_rep-lost' }],
      };

      const res = await service.handleModerationInteraction(payload);

      expect(res.text).toContain('Could not find user to ban');
    });

    it('handles moderate_ai with flagged content', async () => {
      mockPrismaService.report.findUnique.mockResolvedValue({
        id: 'rep-ai',
        targetType: 'POST',
        targetId: 'post-ai',
      });
      mockPrismaService.post.findUnique.mockResolvedValue({
        caption: 'Harmful words',
      });
      mockAIService.moderateContent.mockResolvedValue({
        flagged: true,
        categories: { hate: true, violence: false },
      });

      const payload = {
        user: { username: 'mod_admin' },
        actions: [{ action_id: 'moderate_ai', value: 'ai_rep-ai' }],
      };

      const res = await service.handleModerationInteraction(payload);

      expect(res.text).toContain('AI Analysis (FLAGGED)');
      expect(res.text).toContain('hate');
    });

    it('handles moderate_ai with safe content in comment', async () => {
      mockPrismaService.report.findUnique.mockResolvedValue({
        id: 'rep-ai-safe',
        targetType: 'COMMENT',
        targetId: 'comm-ai',
      });
      mockPrismaService.comment.findUnique.mockResolvedValue({
        content: 'Nice picture',
      });
      mockAIService.moderateContent.mockResolvedValue({
        flagged: false,
        categories: {},
      });

      const payload = {
        user: { username: 'mod_admin' },
        actions: [{ action_id: 'moderate_ai', value: 'ai_rep-ai-safe' }],
      };

      const res = await service.handleModerationInteraction(payload);

      expect(res.text).toContain('AI Analysis (SAFE)');
    });

    it('handles moderate_ai with empty content', async () => {
      mockPrismaService.report.findUnique.mockResolvedValue({
        id: 'rep-empty',
        targetType: 'POST',
        targetId: 'post-empty',
      });
      mockPrismaService.post.findUnique.mockResolvedValue({ caption: '' });

      const payload = {
        user: { username: 'mod_admin' },
        actions: [{ action_id: 'moderate_ai', value: 'ai_rep-empty' }],
      };

      const res = await service.handleModerationInteraction(payload);

      expect(res.text).toContain(
        'El contenido ya no está disponible o está vacío',
      );
    });

    it('handles support_reply opening Slack modal with bot token', async () => {
      const payload = {
        trigger_id: 'trig-123',
        actions: [{ action_id: 'support_reply', value: 'ticket_999' }],
      };

      const res = await service.handleModerationInteraction(payload);

      expect(res).toBeUndefined();
      expect(axios.post).toHaveBeenCalledWith(
        'https://slack.com/api/views.open',
        expect.objectContaining({
          trigger_id: 'trig-123',
          view: expect.objectContaining({
            callback_id: 'support_reply_modal_ticket_999',
          }),
        }),
        expect.objectContaining({
          headers: { Authorization: 'Bearer xoxb-mock-token' },
        }),
      );
    });

    it('handles axios failure when opening slack modal in support_reply', async () => {
      (axios.post as any).mockRejectedValueOnce(new Error('Slack API down'));
      const payload = {
        trigger_id: 'trig-123',
        actions: [{ action_id: 'support_reply', value: 'ticket_999' }],
      };

      const res = await service.handleModerationInteraction(payload);
      expect(res).toBeUndefined();
    });

    it('handles support_reply when bot token is missing', async () => {
      const emptyConfig = { get: vi.fn().mockReturnValue(null) };
      const customService = new SlackService(
        mockPrismaService as any,
        mockEmailService as any,
        mockAIService as any,
        emptyConfig as any,
      );

      const payload = {
        trigger_id: 'trig-123',
        actions: [{ action_id: 'support_reply', value: 'ticket_999' }],
      };

      const res = await customService.handleModerationInteraction(payload);
      expect(res).toEqual({ text: 'Bot token missing. Check server config.' });
    });

    it('catches and handles errors during moderation interaction', async () => {
      mockPrismaService.report.findUnique.mockRejectedValue(
        new Error('Fatal error'),
      );

      const res = await service.handleModerationInteraction({
        actions: [{ action_id: 'moderate_ignore', value: 'ignore_err' }],
      });

      expect(res).toEqual({ text: '❌ Error executing moderation action' });
    });
  });

  describe('handleViewSubmission', () => {
    it('ignores unknown callback_id and returns clear action', async () => {
      const res = await service.handleViewSubmission({
        view: { callback_id: 'unknown_modal' },
      });
      expect(res).toEqual({ response_action: 'clear' });
    });

    it('processes support_reply_modal and sends email to user', async () => {
      const ticket = {
        id: 'tick-77',
        email: 'customer@domain.com',
        subject: 'Invoice request',
        status: 'PENDING',
        resolvedAt: null,
      };
      mockPrismaService.supportTicket.findUnique.mockResolvedValue(ticket);

      const payload = {
        view: {
          callback_id: 'support_reply_modal_tick-77',
          state: {
            values: {
              reply_input_block: {
                reply_text: { value: 'Here is your invoice link.' },
              },
            },
          },
        },
      };

      const res = await service.handleViewSubmission(payload);

      expect(mockEmailService.sendSupportReplyEmail).toHaveBeenCalledWith(
        'customer@domain.com',
        'Invoice request',
        'Here is your invoice link.',
      );
      expect(mockPrismaService.supportTicket.update).toHaveBeenCalledWith({
        where: { id: 'tick-77' },
        data: {
          status: 'RESOLVED',
          reply: 'Here is your invoice link.',
          resolvedAt: expect.any(Date),
        },
      });
      expect(res).toEqual({ response_action: 'clear' });
    });

    it('skips email if ticket is already RESOLVED', async () => {
      mockPrismaService.supportTicket.findUnique.mockResolvedValue({
        id: 'tick-resolved',
        status: 'RESOLVED',
      });

      const payload = {
        view: {
          callback_id: 'support_reply_modal_tick-resolved',
          state: {
            values: {
              reply_input_block: {
                reply_text: { value: 'Duplicate reply' },
              },
            },
          },
        },
      };

      await service.handleViewSubmission(payload);

      expect(mockEmailService.sendSupportReplyEmail).not.toHaveBeenCalled();
    });

    it('catches and handles exceptions gracefully during view submission', async () => {
      mockPrismaService.supportTicket.findUnique.mockRejectedValue(
        new Error('DB crash'),
      );

      const payload = {
        view: {
          callback_id: 'support_reply_modal_err',
          state: {
            values: {
              reply_input_block: {
                reply_text: { value: 'Crash' },
              },
            },
          },
        },
      };

      const res = await service.handleViewSubmission(payload);
      expect(res).toEqual({ response_action: 'clear' });
    });
  });
});
