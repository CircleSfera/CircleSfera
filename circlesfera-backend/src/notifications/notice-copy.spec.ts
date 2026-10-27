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
  { key: 'mentioned_in_story' },
  { key: 'countdown_ended', title: 'Fiesta' },
  { key: 'followed' },
  { key: 'follow_requested' },
  { key: 'follow_accepted' },
  { key: 'likes_aggregated', name: 'ana', target: 'post' },
  { key: 'content_moderated', contentType: 'POST', status: 'removed' },
  { key: 'report_updated', reportType: 'USER', status: 'REVIEWING' },
  { key: 'appeal_decided', outcome: 'APPROVED' },
  { key: 'account_suspended', until: day },
  { key: 'account_warned' },
  { key: 'live_host_warned', reason: 'Showing a phone number' },
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
  { key: 'profile_suspended_cause', until: day, cause: 'HARASSMENT' },
  { key: 'profile_suspended_cause', until: day, cause: 'COMPROMISED' },
  { key: 'profile_restricted', by: 'automated', hours: 72, days: 7 },
  { key: 'message_unlocked', amountCents: 499, currency: 'eur' },
  { key: 'tip_received', amountCents: 1250, currency: 'eur' },
  { key: 'support_answered', subject: 'I was charged twice' },
  { key: 'live_started' },
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

  it('tells a suspended Profile its cause and that it can appeal, and a compromised one that it is not a sanction', () => {
    const sanction = renderNotice('en', {
      key: 'profile_suspended_cause',
      until: day,
      cause: 'SCAM',
    });
    expect(sanction).toContain('for a scam or fraud');
    expect(sanction).toContain('3 November 2026');
    expect(sanction).toContain('You can appeal');

    for (const locale of ['en', 'es'] as const) {
      const protection = renderNotice(locale, {
        key: 'profile_suspended_cause',
        until: day,
        cause: 'COMPROMISED',
      });
      expect(protection).not.toMatch(/appeal|apelar/);
      expect(protection).toMatch(/not a sanction|no una sanción/);
    }
  });

  it('adds staff notes and reasons only when there are any', () => {
    expect(
      renderNotice('es', {
        key: 'appeal_decided',
        outcome: 'REJECTED',
        notes: ' Spam ',
      }),
    ).toBe(
      'Hemos revisado tu apelación y la decisión se mantiene. Notas: Spam. También puedes acudir a un órgano certificado de resolución extrajudicial de litigios o a los tribunales.',
    );
    expect(renderNotice('en', { key: 'promotion_rejected', note: '  ' })).toBe(
      'Your promotion request was rejected. You can appeal this decision once, within six months. You can also turn to a certified out-of-court dispute settlement body or to the courts.',
    );
    // Money back is told only when it came back.
    expect(
      renderNotice('es', {
        key: 'promotion_rejected',
        note: 'Engañosa',
        refunded: true,
      }),
    ).toBe(
      'Tu solicitud de promoción ha sido rechazada. Motivo: Engañosa. Te devolvemos lo que no se haya gastado. Puedes apelar esta decisión una vez, en los seis meses siguientes. También puedes acudir a un órgano certificado de resolución extrajudicial de litigios o a los tribunales.',
    );
    expect(
      renderNotice('en', {
        key: 'promotion_rejected',
        note: 'Misleading',
        refunded: true,
      }),
    ).toBe(
      'Your promotion request was rejected. Reason: Misleading. What was not spent is refunded. You can appeal this decision once, within six months. You can also turn to a certified out-of-court dispute settlement body or to the courts.',
    );
  });

  it('every decision that can be appealed names the six months and the other ways to seek redress', () => {
    const until = new Date('2026-11-01T00:00:00.000Z');
    const expires = new Date('2027-01-01T00:00:00.000Z');
    const decisions = [
      { key: 'content_moderated', contentType: 'POST', status: 'removed' },
      { key: 'account_suspended', until, reason: 'Spam' },
      { key: 'bot_labeled' },
      { key: 'promotion_rejected' },
      { key: 'profile_warning', rule: 'SPAM', expires },
      {
        key: 'profile_strike',
        rule: 'SPAM',
        expires,
        count: 1,
        max: 3,
        consequence: 'NONE',
      },
      { key: 'profile_banned' },
      { key: 'profile_suspended_activity', until },
      { key: 'profile_suspended_cause', until, cause: 'SCAM' },
      { key: 'profile_restricted', by: 'staff', hours: 24, days: 7 },
    ] as const;
    for (const notice of decisions) {
      expect(renderNotice('en', notice)).toContain(
        'You can appeal this decision once, within six months. You can also turn to a certified out-of-court dispute settlement body or to the courts.',
      );
      expect(renderNotice('es', notice)).toContain(
        'Puedes apelar esta decisión una vez, en los seis meses siguientes. También puedes acudir a un órgano certificado de resolución extrajudicial de litigios o a los tribunales.',
      );
    }
    // Restored content and a Profile paused to protect it are not decisions
    // against the person.
    expect(
      renderNotice('en', {
        key: 'content_moderated',
        contentType: 'POST',
        status: 'restored',
      }),
    ).toBe('Moderation restored your post.');
    expect(
      renderNotice('en', {
        key: 'profile_suspended_cause',
        until,
        cause: 'COMPROMISED',
      }),
    ).not.toContain('appeal');
    // An approved appeal needs no other way.
    expect(
      renderNotice('en', { key: 'appeal_decided', outcome: 'APPROVED' }),
    ).toBe('Your appeal was approved.');
  });

  it('says why staff removed content: their note, else the reason the removal email gives', () => {
    expect(
      renderNotice('en', {
        key: 'content_moderated',
        contentType: 'POST',
        status: 'removed',
        note: ' Spam ',
      }),
    ).toBe(
      'Moderation removed your post. Reason: Spam. You can appeal this decision once, within six months. You can also turn to a certified out-of-court dispute settlement body or to the courts.',
    );
    expect(
      renderNotice('es', {
        key: 'content_moderated',
        contentType: 'STORY',
        status: 'removed',
        note: '  ',
      }),
    ).toBe(
      'Moderación ha retirado tu historia. Motivo: Incumplimiento de las normas de la comunidad. Puedes acudir a un órgano certificado de resolución extrajudicial de litigios o a los tribunales.',
    );
    expect(
      renderNotice('en', {
        key: 'content_moderated',
        contentType: 'COMMENT',
        status: 'removed',
      }),
    ).toContain('Reason: Violation of the community guidelines.');
    // An automated removal shows no assessment, and a note on any other
    // decision is shown as a note.
    expect(
      renderNotice('en', {
        key: 'content_moderated',
        contentType: 'POST',
        status: 'removed',
        automated: true,
      }),
    ).not.toContain('Reason');
    expect(
      renderNotice('es', {
        key: 'content_moderated',
        contentType: 'POST',
        status: 'restored',
        note: 'Revisado',
      }),
    ).toBe('Moderación ha restaurado tu publicación. Nota: Revisado');
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
      // A comment cannot be appealed yet: only the other ways are named.
      'La moderación automática ha ocultado tu comentario. Puedes acudir a un órgano certificado de resolución extrajudicial de litigios o a los tribunales.',
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

describe('a countdown that ended', () => {
  it('is named in each language', () => {
    const notice: Notice = { key: 'countdown_ended', title: 'Fiesta' };
    expect(renderNotice('en', notice)).toBe('countdown “Fiesta” has ended');
    expect(renderNotice('es', notice)).toBe(
      'la cuenta atrás «Fiesta» ha terminado',
    );
  });

  it('tells a person someone is worried about them, with where to find help in their language', () => {
    const en = renderNotice('en', { key: 'support_resources' });
    const es = renderNotice('es', { key: 'support_resources' });
    expect(en).toContain('112');
    expect(en).toContain('findahelpline.com');
    expect(es).toContain('024');
    expect(es).toContain('112');
    // It never names who reported, and it is not a sanction.
    expect(`${en} ${es}`).not.toMatch(/report|denunci|appeal|apela/i);
  });
});
