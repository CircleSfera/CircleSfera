import { describe, expect, it } from 'vitest';
import { type Notice, renderDigest, renderNotice } from './notice-copy.js';

const day = new Date('2026-11-03T12:00:00Z');

// One notice of every kind, with the fields each one needs.
const EVERY_NOTICE: Notice[] = [
  { key: 'post_liked' },
  { key: 'comment_liked' },
  { key: 'post_commented' },
  { key: 'comment_replied' },
  { key: 'mentioned_in_comment' },
  { key: 'mentioned_in_post' },
  { key: 'followed' },
  { key: 'follow_requested' },
  { key: 'follow_accepted' },
  { key: 'likes_aggregated', name: 'ana', target: 'post' },
  { key: 'content_moderated', contentType: 'POST', status: 'removed' },
  { key: 'report_updated', reportType: 'USER', status: 'REVIEWING' },
  { key: 'appeal_decided', outcome: 'APPROVED' },
  { key: 'account_suspended', until: day },
  { key: 'account_warned' },
  { key: 'bot_labeled' },
  { key: 'promotion_approved' },
  { key: 'promotion_rejected' },
  { key: 'profile_warning', rule: 'SPAM', expires: day },
  {
    key: 'profile_strike',
    rule: 'HARASSMENT',
    expires: day,
    count: 1,
    max: 3,
    consequence: 'NONE',
  },
  { key: 'profile_banned' },
  { key: 'profile_suspended_activity', until: day },
  { key: 'profile_restricted', by: 'automated', hours: 72, days: 7 },
  { key: 'message_unlocked', amountCents: 499, currency: 'eur' },
  { key: 'tip_received', amountCents: 1250, currency: 'eur' },
];

describe('renderNotice', () => {
  it.each(EVERY_NOTICE.map((n) => [n.key, n] as const))(
    '%s exists in both languages and they differ',
    (_key, notice) => {
      const en = renderNotice('en', notice);
      const es = renderNotice('es', notice);
      expect(en.length).toBeGreaterThan(5);
      expect(es.length).toBeGreaterThan(5);
      expect(es).not.toBe(en);
    },
  );

  it('formats money and dates for each language', () => {
    const tip = {
      key: 'tip_received',
      amountCents: 1250,
      currency: 'eur',
    } as const;
    expect(renderNotice('en', tip)).toBe('sent you a €12.50 tip');
    // Spanish puts the symbol after the amount, with a non-breaking space.
    expect(renderNotice('es', tip)).toMatch(
      /^te ha enviado una propina de 12,50\s€$/,
    );

    const until = { key: 'account_suspended', until: day } as const;
    expect(renderNotice('en', until)).toContain('3 November 2026');
    expect(renderNotice('es', until)).toContain('3 de noviembre de 2026');
  });

  it('adds staff notes and reasons only when there are any', () => {
    expect(
      renderNotice('es', {
        key: 'appeal_decided',
        outcome: 'REJECTED',
        notes: ' Spam ',
      }),
    ).toBe(
      'Hemos revisado tu apelación y la decisión se mantiene. Notas: Spam',
    );
    expect(renderNotice('en', { key: 'promotion_rejected', note: '  ' })).toBe(
      'Your promotion request was rejected.',
    );
  });

  it('names what was moderated or reported in each language', () => {
    expect(
      renderNotice('es', {
        key: 'content_moderated',
        contentType: 'COMMENT',
        status: 'hidden',
        automated: true,
      }),
    ).toBe(
      'La moderación automática ha ocultado tu comentario. Puedes apelar desde Ajustes → Apelaciones.',
    );
    expect(
      renderNotice('es', {
        key: 'report_updated',
        reportType: 'STORY',
        status: 'REJECTED',
      }),
    ).toBe('Tu denuncia sobre una historia ahora está desestimada.');
    expect(
      renderNotice('en', {
        key: 'report_updated',
        reportType: 'MESSAGE',
        status: 'ODD',
      }),
    ).toBe('Your report about a message is now odd.');
  });

  it('describes each strike consequence', () => {
    const base = {
      key: 'profile_strike',
      rule: 'SCAM',
      expires: day,
      count: 2,
      max: 3,
    } as const;
    expect(
      renderNotice('en', {
        ...base,
        consequence: 'SUSPENDED',
        suspendedUntil: day,
      }),
    ).toContain('suspended until 3 November 2026');
    expect(
      renderNotice('es', { ...base, count: 3, consequence: 'BANNED' }),
    ).toContain('Este perfil queda bloqueado');
    expect(renderNotice('es', { ...base, consequence: 'NONE' })).toContain(
      'estafa',
    );
  });

  it('explains staff restrictions with their length', () => {
    expect(
      renderNotice('en', {
        key: 'profile_restricted',
        by: 'staff',
        hours: 72,
        days: 7,
      }),
    ).toContain('for 7 days');
  });
});

describe('renderDigest', () => {
  it.each([
    ['en', 1, 'You have 1 new interaction on your posts.'],
    ['en', 4, 'You have 4 new interactions on your posts.'],
    ['es', 1, 'Tienes 1 interacción nueva en tus publicaciones.'],
    ['es', 4, 'Tienes 4 interacciones nuevas en tus publicaciones.'],
  ] as const)('%s with %i', (locale, count, body) => {
    expect(renderDigest(locale, count).body).toBe(body);
  });
});

describe('aggregated likes', () => {
  it('aggregated likes never show a blank sender name', () => {
    const notice: Notice = {
      key: 'likes_aggregated',
      name: '',
      target: 'post',
    };

    expect(renderNotice('en', notice)).toBe('Several people liked your post');
    expect(renderNotice('es', notice)).toBe(
      'A varias personas les ha gustado tu publicación',
    );
    expect(
      renderNotice('es', {
        key: 'likes_aggregated',
        name: 'ana',
        target: 'comment',
      }),
    ).toBe('A ana y a otras personas les ha gustado tu comentario');
  });
});
