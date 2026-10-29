import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewReportUseCase } from '../admin/use-cases/content/commands/review-report.use-case.js';
import { AIService } from '../ai/ai.service.js';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SlackService } from './slack.service.js';
import { SlackStaff } from './slack-staff.js';

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    isAxiosError: vi.fn().mockReturnValue(false),
  },
}));

function axiosErrorWithStatus(status: number) {
  return Object.assign(new Error(`Request failed with status ${status}`), {
    isAxiosError: true,
    response: { status },
  });
}

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

  const mockSlackStaff = { moderatorFor: vi.fn(), staffFor: vi.fn() };
  const mockReviews = {
    updateStatus: vi.fn(),
    resolveWithPenalty: vi.fn(),
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
    // The Slack account is a member of staff with the permission asked.
    mockSlackStaff.staffFor.mockResolvedValue('admin-1');
    mockSlackStaff.moderatorFor.mockResolvedValue('admin-1');
    (axios.post as any).mockResolvedValue({ data: 'ok' });
    (axios.isAxiosError as any).mockReturnValue(false);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlackService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: AIService, useValue: mockAIService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: SlackStaff, useValue: mockSlackStaff },
        { provide: ReviewReportUseCase, useValue: mockReviews },
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
        mockSlackStaff as any,
        { get: () => mockReviews } as any,
      );

      await emptyService.sendProductionAlert({ message: 'No webhook alert' });
      expect(axios.post).not.toHaveBeenCalled();
    });

    describe('retry classification', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('recovers on retry after a transient (network) axios failure', async () => {
        (axios.post as any)
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce({ data: 'ok' });

        const promise = service.sendProductionAlert({
          message: 'Axios fails once',
        });
        await vi.advanceTimersByTimeAsync(300);
        await expect(promise).resolves.toBeUndefined();
        expect(axios.post).toHaveBeenCalledTimes(2);
      });

      it('retries a 429 and a 5xx as transient', async () => {
        (axios.post as any)
          .mockRejectedValueOnce(axiosErrorWithStatus(429))
          .mockRejectedValueOnce(axiosErrorWithStatus(503))
          .mockResolvedValueOnce({ data: 'ok' });
        (axios.isAxiosError as any).mockReturnValue(true);

        const promise = service.sendProductionAlert({
          message: 'Rate limited then server error',
        });
        await vi.advanceTimersByTimeAsync(300);
        await vi.advanceTimersByTimeAsync(600);
        await expect(promise).resolves.toBeUndefined();
        expect(axios.post).toHaveBeenCalledTimes(3);
      });

      it('retries up to 3 attempts total and logs SLACK_DELIVERY_FAILED when every attempt fails', async () => {
        (axios.post as any).mockRejectedValue(new Error('Slack is down'));
        const errorSpy = vi.spyOn((service as any).logger, 'error');

        const promise = service.sendProductionAlert({
          message: 'Axios always fails',
        });
        await vi.advanceTimersByTimeAsync(300);
        await vi.advanceTimersByTimeAsync(600);
        await expect(promise).resolves.toBeUndefined();
        expect(axios.post).toHaveBeenCalledTimes(3);
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('SLACK_DELIVERY_FAILED after 3 attempt(s)'),
          expect.any(Error),
        );
      });

      it('does not retry a permanent 4xx (e.g. 400) and gives up immediately', async () => {
        (axios.post as any).mockRejectedValue(axiosErrorWithStatus(400));
        (axios.isAxiosError as any).mockReturnValue(true);
        const errorSpy = vi.spyOn((service as any).logger, 'error');

        await expect(
          service.sendProductionAlert({ message: 'Bad payload' }),
        ).resolves.toBeUndefined();
        expect(axios.post).toHaveBeenCalledTimes(1);
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('SLACK_DELIVERY_FAILED after 1 attempt(s)'),
          expect.any(Error),
        );
      });
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
      // Who reported and what they wrote stay in the Admin Panel.
      const sent = JSON.stringify(vi.mocked(axios.post).mock.calls.at(-1)?.[1]);
      expect(sent).not.toContain('user-1');
      expect(sent).not.toContain('Offensive advertising');
      expect(sent).toContain('https://admin.circlesfera.com/reports');
      const actions = (
        (vi.mocked(axios.post).mock.calls.at(-1) ?? [])[1] as {
          blocks: Array<{
            type: string;
            elements?: Array<{ action_id: string }>;
          }>;
        }
      ).blocks
        .find((b) => b.type === 'actions')
        ?.elements?.map((e) => e.action_id);
      expect(actions).toEqual([
        'moderate_dismiss',
        'moderate_strike',
        'moderate_ban',
        'moderate_ai',
      ]);
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

  describe('sendSupportReplyAlert', () => {
    it('tells the support channel the number of the ticket, and nothing the requester wrote', async () => {
      await service.sendSupportReplyAlert({
        id: 'tick-1',
        reference: 42,
        subject: 'Cannot login',
        // Fields a caller may hold; none of them belongs in the alert.
        email: 'user@example.com',
        requesterRef: 'u-1',
      } as never);

      expect(axios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/support',
        expect.anything(),
        { timeout: 5_000 },
      );
      const sent = JSON.stringify(vi.mocked(axios.post).mock.calls.at(-1)?.[1]);
      expect(sent).toContain('#42');
      expect(sent).not.toContain('Cannot login');
      expect(sent).not.toContain('user@example.com');
    });
  });

  describe('sendSupportEmailInAlert', () => {
    it('tells the support channel the three counts and nothing of anyone’s email', async () => {
      await service.sendSupportEmailInAlert({
        noTicket: 7,
        senderMismatch: 4,
        stuck: 2,
        // Nothing but the counts belongs in the alert.
        fromAddress: 'user@example.com',
      } as never);

      expect(axios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/support',
        expect.anything(),
        { timeout: 5_000 },
      );
      const sent = JSON.stringify(vi.mocked(axios.post).mock.calls.at(-1)?.[1]);
      expect(sent).toContain('\\n7');
      expect(sent).toContain('\\n4');
      expect(sent).toContain('\\n2');
      expect(sent).not.toContain('user@example.com');
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
      // Who wrote and what they wrote stay in the Help Desk.
      const sent = JSON.stringify(vi.mocked(axios.post).mock.calls.at(-1)?.[1]);
      expect(sent).toContain('tick-1');
      expect(sent).not.toContain('user@example.com');
      expect(sent).not.toContain('Cannot login');
      expect(sent).not.toContain('Passkey error');
    });
  });

  describe('handleStatsCommand', () => {
    it('returns dashboard blocks with aggregated metrics', async () => {
      mockPrismaService.user.count
        .mockResolvedValueOnce(150)
        .mockResolvedValueOnce(5);
      mockPrismaService.post.count.mockResolvedValueOnce(45);
      mockPrismaService.report.count.mockResolvedValueOnce(3);

      const res = await service.handleStatsCommand('U123');

      expect(res.response_type).toBe('in_channel');
      expect(res.blocks).toHaveLength(2);
      expect(res.blocks[0].text.text).toBe('📊 CircleSfera Metrics Dashboard');
    });

    it('handles database error and returns error text', async () => {
      mockPrismaService.user.count.mockRejectedValueOnce(
        new Error('DB failure'),
      );

      const res = await service.handleStatsCommand('U123');

      expect(res.text).toBe('❌ Error fetching stats from database.');
    });
  });

  describe('handleUserCommand', () => {
    it('returns prompt if text is empty or whitespace', async () => {
      const res = await service.handleUserCommand('   ', 'U123');
      expect(res.text).toContain('Por favor, proporciona un email');
    });

    it('returns not found if user does not exist', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      const res = await service.handleUserCommand('nonexistent', 'U123');
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

      const res = await service.handleUserCommand('shading', 'U123');

      // Only to whoever asked, with no email, bio or post.
      expect(res.response_type).toBe('ephemeral');
      expect(res.blocks[0].text.text).toContain('@shading');
      const shown = JSON.stringify(res);
      expect(shown).toContain('usr-1');
      expect(shown).not.toContain('user@circle.com');
      expect(shown).not.toContain('Creator of worlds');
      expect(shown).not.toContain('First post');
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

      const res = await service.handleUserCommand('nobio', 'U123');

      expect(res.response_type).toBe('ephemeral');
      expect(res.blocks[0].text.text).toContain('@nobio');
    });

    it('catches database error and returns error text', async () => {
      mockPrismaService.user.findFirst.mockRejectedValue(
        new Error('DB failure'),
      );

      const res = await service.handleUserCommand('erroruser', 'U123');
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
        mockSlackStaff as any,
        { get: () => mockReviews } as any,
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
      expect(res).toEqual({
        text: 'ℹ️ Este aviso no corresponde a ninguna denuncia.',
      });
    });

    it('tells who pressed that the report of an alert no longer exists, as one of a test', async () => {
      mockPrismaService.report.findUnique.mockResolvedValue(null);

      const res = await service.handleModerationInteraction({
        user: { id: 'U123' },
        channel: { id: 'C1' },
        actions: [{ action_id: 'moderate_ignore', value: 'ignore_rep-404' }],
      });

      expect(res.text).toContain('Esta denuncia ya no existe');
      // Slack drops what the request answers: it is told to them apart.
      expect(axios.post).toHaveBeenCalledWith(
        'https://slack.com/api/chat.postEphemeral',
        { channel: 'C1', user: 'U123', text: res.text },
        {
          headers: { Authorization: 'Bearer xoxb-mock-token' },
          timeout: 5_000,
        },
      );
    });

    it('still answers when telling who pressed fails, or nobody can be told', async () => {
      mockPrismaService.report.findUnique.mockResolvedValue(null);
      (axios.post as any).mockRejectedValueOnce(new Error('Slack down'));

      await expect(
        service.handleModerationInteraction({
          user: { id: 'U123' },
          channel: { id: 'C1' },
          actions: [{ action_id: 'moderate_ignore', value: 'ignore_rep-404' }],
        }),
      ).resolves.toEqual(expect.objectContaining({ text: expect.any(String) }));

      (axios.post as any).mockClear();
      await service.handleModerationInteraction({
        actions: [{ action_id: 'moderate_ignore', value: 'ignore_rep-404' }],
      });
      expect(axios.post).not.toHaveBeenCalled();
    });

    describe('report buttons act as the member of staff who pressed them', () => {
      const pending = {
        id: 'rep-1',
        status: 'PENDING',
        targetType: 'POST',
        targetId: 'post-1',
      };
      const pressed = (action_id: string, value: string) => ({
        user: { id: 'U123', username: 'mod_admin' },
        channel: { id: 'C1' },
        message: { ts: '1.2', blocks: [{ type: 'actions' }] },
        actions: [{ action_id, value }],
      });

      beforeEach(() => {
        mockPrismaService.report.findUnique.mockResolvedValue(pending);
        mockSlackStaff.moderatorFor.mockResolvedValue('admin-1');
      });

      it('dismisses through the staff use case, which tells the reporter', async () => {
        const res = await service.handleModerationInteraction(
          pressed('moderate_dismiss', 'dismiss_rep-1'),
        );

        expect(mockSlackStaff.moderatorFor).toHaveBeenCalledWith('U123');
        expect(mockReviews.updateStatus).toHaveBeenCalledWith(
          'admin-1',
          'rep-1',
          'REJECTED',
        );
        expect(res.text).toContain('desestimada por @mod_admin');
        // The message loses its buttons and says what was decided.
        expect(axios.post).toHaveBeenCalledWith(
          'https://slack.com/api/chat.update',
          expect.objectContaining({ channel: 'C1', ts: '1.2' }),
          expect.anything(),
        );
        // The message shows it: nobody is told apart.
        expect(axios.post).toHaveBeenCalledTimes(1);
      });

      it('an older ignore button dismisses the same way', async () => {
        await service.handleModerationInteraction(
          pressed('moderate_ignore', 'ignore_rep-1'),
        );

        expect(mockReviews.updateStatus).toHaveBeenCalledWith(
          'admin-1',
          'rep-1',
          'REJECTED',
        );
      });

      it('a violation goes through the strike ladder, with its notice and appeal', async () => {
        const res = await service.handleModerationInteraction(
          pressed('moderate_strike', 'strike_rep-1'),
        );

        expect(mockReviews.resolveWithPenalty).toHaveBeenCalledWith(
          'admin-1',
          'rep-1',
          'STRIKE',
        );
        expect(res.text).toContain('Infracción aplicada');
      });

      it('a ban bans the reported Profile through the staff use case, never the account directly', async () => {
        const res = await service.handleModerationInteraction(
          pressed('moderate_ban', 'ban_rep-1'),
        );

        expect(mockReviews.resolveWithPenalty).toHaveBeenCalledWith(
          'admin-1',
          'rep-1',
          'BAN',
        );
        expect(mockPrismaService.user.update).not.toHaveBeenCalled();
        expect(res.text).toContain('Perfil baneado');
      });

      it('does nothing for a Slack account that is no member of staff who may decide reports', async () => {
        mockSlackStaff.moderatorFor.mockResolvedValue(null);

        const res = await service.handleModerationInteraction(
          pressed('moderate_ban', 'ban_rep-1'),
        );

        expect(mockReviews.resolveWithPenalty).not.toHaveBeenCalled();
        expect(mockReviews.updateStatus).not.toHaveBeenCalled();
        // The alert keeps its buttons; only who pressed is told.
        expect(axios.post).toHaveBeenCalledTimes(1);
        expect(axios.post).toHaveBeenCalledWith(
          'https://slack.com/api/chat.postEphemeral',
          expect.objectContaining({ user: 'U123', text: res.text }),
          expect.anything(),
        );
        expect(res.text).toContain('No se ha hecho nada');
        expect(res.text).toContain('https://admin.circlesfera.com/reports');
      });

      it('does not decide again a report already decided', async () => {
        mockPrismaService.report.findUnique.mockResolvedValue({
          ...pending,
          status: 'RESOLVED',
        });

        const res = await service.handleModerationInteraction(
          pressed('moderate_strike', 'strike_rep-1'),
        );

        expect(mockReviews.resolveWithPenalty).not.toHaveBeenCalled();
        expect(res.text).toContain('ya estaba decidida');
      });

      it('the delete button of older alerts removes nothing and points to the panel', async () => {
        const res = await service.handleModerationInteraction(
          pressed('moderate_delete', 'delete_rep-1'),
        );

        expect(mockPrismaService.post.update).not.toHaveBeenCalled();
        expect(mockPrismaService.comment.update).not.toHaveBeenCalled();
        expect(mockReviews.resolveWithPenalty).not.toHaveBeenCalled();
        expect(axios.post).toHaveBeenCalledTimes(1);
        expect(axios.post).toHaveBeenCalledWith(
          'https://slack.com/api/chat.postEphemeral',
          expect.objectContaining({ text: res.text }),
          expect.anything(),
        );
        expect(res.text).toContain('panel de staff');
      });
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

    it("opens the reply form for a ticket's id, which names no report", async () => {
      const res = await service.handleModerationInteraction({
        user: { id: 'U123' },
        trigger_id: 'trig-1',
        actions: [
          { action_id: 'support_reply', value: 'cmh1ticket0000000000000000' },
        ],
      });

      expect(res).toBeUndefined();
      expect(mockPrismaService.report.findUnique).not.toHaveBeenCalled();
      expect(axios.post).toHaveBeenCalledWith(
        'https://slack.com/api/views.open',
        expect.objectContaining({
          view: expect.objectContaining({
            callback_id: 'support_reply_modal_cmh1ticket0000000000000000',
          }),
        }),
        expect.anything(),
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
        mockSlackStaff as any,
        { get: () => mockReviews } as any,
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

    const replyPayload = (ticketId: string, value: string) => ({
      user: { id: 'U123' },
      view: {
        callback_id: `support_reply_modal_${ticketId}`,
        state: {
          values: { reply_input_block: { reply_text: { value } } },
        },
      },
    });

    it('hands an answer written in the channel to the Help Desk, which owns the ticket', async () => {
      const helpdeskData = {
        answerFromTeamChannel: vi.fn().mockResolvedValue(true),
      };
      Object.assign(service, { helpdeskData });

      const res = await service.handleViewSubmission(
        replyPayload('tick-77', 'Here is your invoice link.'),
      );

      // As the member of staff behind the Slack account.
      expect(mockSlackStaff.staffFor).toHaveBeenCalledWith('U123', 'support');
      expect(helpdeskData.answerFromTeamChannel).toHaveBeenCalledWith(
        'tick-77',
        'Here is your invoice link.',
        'admin-1',
      );
      // The channel no longer writes the ticket or sends the email itself.
      expect(mockPrismaService.supportTicket.update).not.toHaveBeenCalled();
      expect(mockEmailService.sendSupportReplyEmail).not.toHaveBeenCalled();
      expect(res).toEqual({ response_action: 'clear' });
    });

    it('does nothing more when the Help Desk refuses the answer', async () => {
      const helpdeskData = {
        answerFromTeamChannel: vi.fn().mockResolvedValue(false),
      };
      Object.assign(service, { helpdeskData });

      const res = await service.handleViewSubmission(
        replyPayload('tick-resolved', 'Duplicate reply'),
      );

      expect(mockEmailService.sendSupportReplyEmail).not.toHaveBeenCalled();
      expect(res).toEqual({ response_action: 'clear' });
    });

    it('catches and handles exceptions gracefully during view submission', async () => {
      Object.assign(service, {
        helpdeskData: {
          answerFromTeamChannel: vi
            .fn()
            .mockRejectedValue(new Error('DB crash')),
        },
      });

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

  describe('a Slack account that is no member of staff with the permission', () => {
    beforeEach(() => {
      mockSlackStaff.staffFor.mockResolvedValue(null);
      mockSlackStaff.moderatorFor.mockResolvedValue(null);
    });

    it('reads no metrics and no person with a command', async () => {
      const stats = await service.handleStatsCommand('U999');
      const user = await service.handleUserCommand('alice', 'U999');

      expect(mockSlackStaff.staffFor).toHaveBeenCalledWith(
        'U999',
        'users.read',
      );
      expect(stats.response_type).toBe('ephemeral');
      expect(stats.text).toContain('No se ha hecho nada');
      expect(user.text).toContain('No se ha hecho nada');
      expect(mockPrismaService.user.count).not.toHaveBeenCalled();
      expect(mockPrismaService.user.findFirst).not.toHaveBeenCalled();
    });

    it('sends no reported content to the AI', async () => {
      mockPrismaService.report.findUnique.mockResolvedValue({
        id: 'rep-ai',
        targetType: 'POST',
        targetId: 'post-1',
      });

      const res = await service.handleModerationInteraction({
        user: { id: 'U999' },
        actions: [{ action_id: 'moderate_ai', value: 'ai_rep-ai' }],
      });

      expect(res.text).toContain('No se ha hecho nada');
      expect(mockAIService.moderateContent).not.toHaveBeenCalled();
    });

    it('opens no reply form for a ticket', async () => {
      const res = await service.handleModerationInteraction({
        user: { id: 'U999' },
        trigger_id: 'trig-1',
        actions: [{ action_id: 'support_reply', value: 'tick-1' }],
      });

      expect(mockSlackStaff.staffFor).toHaveBeenCalledWith('U999', 'support');
      expect(res.text).toContain('No se ha hecho nada');
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('sends no answer to the requester of a ticket', async () => {
      const helpdeskData = { answerFromTeamChannel: vi.fn() };
      Object.assign(service, { helpdeskData });

      const res = await service.handleViewSubmission({
        user: { id: 'U999' },
        view: {
          callback_id: 'support_reply_modal_tick-1',
          state: {
            values: { reply_input_block: { reply_text: { value: 'Hi' } } },
          },
        },
      });

      expect(helpdeskData.answerFromTeamChannel).not.toHaveBeenCalled();
      expect(res).toEqual({
        response_action: 'errors',
        errors: { reply_input_block: expect.stringContaining('soporte') },
      });
    });
  });
});
