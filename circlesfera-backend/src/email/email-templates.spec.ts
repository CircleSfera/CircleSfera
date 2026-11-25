import { describe, expect, it } from 'vitest';
import { EMAIL_COPY, escapeHtml, fill } from './email-copy.js';
import { type EmailContext, EmailTemplates } from './email-templates.js';

const en: EmailContext = {
  locale: 'en',
  frontendUrl: 'https://circlesfera.com',
};
const es: EmailContext = {
  locale: 'es',
  frontendUrl: 'https://circlesfera.com',
};

describe('EmailTemplates', () => {
  it('renders every email in the recipient language', () => {
    const verifyEn = EmailTemplates.verification(en, 'https://x/verify');
    const verifyEs = EmailTemplates.verification(es, 'https://x/verify');

    expect(verifyEn.subject).toBe('Verify your CircleSfera account');
    expect(verifyEn.html).toContain('<html lang="en">');
    expect(verifyEn.html).toContain('Verify email');
    expect(verifyEn.html).toContain('All rights reserved');
    expect(verifyEs.subject).toBe('Verifica tu cuenta en CircleSfera');
    expect(verifyEs.html).toContain('<html lang="es">');
    expect(verifyEs.html).toContain('Verificar email');
    expect(verifyEs.html).toContain('Todos los derechos reservados');
  });

  it('the staff set-up email says the link works once and for 24 hours, in each language', () => {
    const enMail = EmailTemplates.staffEnrolment(en, 'https://x/login?enrol=t');
    const esMail = EmailTemplates.staffEnrolment(es, 'https://x/login?enrol=t');

    expect(enMail.subject).toBe('Set up your CircleSfera staff access');
    expect(enMail.html).toContain('expires in 24 hours');
    expect(enMail.html).toContain('href="https://x/login?enrol=t"');
    expect(esMail.subject).toBe('Configura tu acceso de equipo en CircleSfera');
    expect(esMail.html).toContain('caduca en 24 horas');
  });

  it('the company code email shows the digits only, in each language', () => {
    const enMail = EmailTemplates.companyDomainCode(en, '<b>123456</b>');
    const esMail = EmailTemplates.companyDomainCode(es, '654321');

    expect(enMail.subject).toBe('Your CircleSfera company verification code');
    expect(enMail.html).toContain('>123456</p>');
    expect(enMail.html).not.toContain('<b>');
    expect(enMail.html).toContain('valid for 30 minutes');
    expect(esMail.html).toContain('>654321</p>');
    expect(esMail.html).toContain('Vale durante 30 minutos');
  });

  it('the company decision email carries the notice, escaped', () => {
    const ok = EmailTemplates.companyDecided(
      en,
      true,
      'Your company is verified.',
    );
    const no = EmailTemplates.companyDecided(es, false, 'No <b>aprobada</b>');
    expect(ok.subject).toBe('Your company is verified on CircleSfera');
    expect(ok.html).toContain('Company verified');
    expect(no.subject).toBe('Tu verificación de empresa en CircleSfera');
    expect(no.html).toContain('No &lt;b&gt;aprobada&lt;/b&gt;');
  });

  it('carries the brand: logo, wordmark, gradient and a solid fallback', () => {
    const { html } = EmailTemplates.passwordReset(en, 'https://x/reset');

    expect(html).toContain('src="https://circlesfera.com/email/logo.png"');
    expect(html).toContain('>CircleSfera</td>');
    expect(html).toContain('linear-gradient(90deg, #ff5757 0%, #884cff 100%)');
    expect(html).toContain('bgcolor="#884cff"');
    expect(html).toContain('href="https://circlesfera.com/privacy"');
  });

  it('a button also offers its link as text', () => {
    const { html } = EmailTemplates.verification(
      es,
      'https://x/verify?token=a&b=c',
    );

    expect(html).toContain(EMAIL_COPY.es.buttonFallback);
    expect(html).toContain('href="https://x/verify?token=a&amp;b=c"');
  });

  it('escapes names, staff notes and support replies', () => {
    const attack = '<img src=x onerror=alert(1)>';
    const outputs = [
      EmailTemplates.welcome(en, attack).html,
      EmailTemplates.accountBanned(en, attack).html,
      EmailTemplates.postRemoved(en, 'Ana', attack).html,
      EmailTemplates.appealDecision(en, 'Ana', false, attack).html,
      EmailTemplates.dataExportReady(en, attack, 'https://x').html,
      EmailTemplates.supportReply(en, 'Help', `${attack}\nsecond line`).html,
      EmailTemplates.subscriptionReceipt(en, attack, '€9.99').html,
    ];

    for (const html of outputs) {
      expect(html).not.toContain('<img src=x');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    }
    expect(outputs[5]).toContain('&gt;<br>second line');
  });

  it('uses the default reason and notes when staff gave none', () => {
    expect(EmailTemplates.postRemoved(es, 'Ana', '  ').html).toContain(
      EMAIL_COPY.es.moderationReason,
    );
    expect(
      EmailTemplates.appealDecision(en, 'Ana', true, undefined).html,
    ).toContain(EMAIL_COPY.en.appealDefaultNotes);
  });

  it('says how many posts were removed, once, with the general reason and the guidelines', () => {
    const mail = EmailTemplates.postsRemoved(en, '<b>Ana</b>', 12);

    expect(mail.subject).toBe('12 of your posts were removed');
    expect(mail.html).toContain('12 of your posts were removed by');
    expect(mail.html).toContain(EMAIL_COPY.en.moderationReason);
    expect(mail.html).toContain('href="https://circlesfera.com/guidelines"');
    expect(mail.html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
    expect(EmailTemplates.postsRemoved(es, 'Ana', 3).subject).toBe(
      'Hemos retirado 3 publicaciones tuyas',
    );
  });

  it('approved and rejected appeals read differently', () => {
    expect(EmailTemplates.appealDecision(es, 'Ana', true, 'ok').subject).toBe(
      'Tu apelación ha sido aprobada',
    );
    expect(EmailTemplates.appealDecision(es, 'Ana', false, 'no').subject).toBe(
      'Hemos revisado tu apelación',
    );
  });

  it('a rejected appeal and every removal or ban name the other ways to seek redress', () => {
    const redress = {
      en: 'certified out-of-court dispute settlement body or to the courts',
      es: 'órgano certificado de resolución extrajudicial de litigios o a los tribunales',
    };
    for (const [ctx, words] of [
      [en, redress.en],
      [es, redress.es],
    ] as const) {
      expect(
        EmailTemplates.appealDecision(ctx, 'Ana', false, 'no').html,
      ).toContain(words);
      expect(EmailTemplates.accountBanned(ctx, 'Ana').html).toContain(words);
      expect(EmailTemplates.postRemoved(ctx, 'Ana', 'x').html).toContain(words);
      expect(EmailTemplates.postsRemoved(ctx, 'Ana', 2).html).toContain(words);
      // An approved appeal leaves nothing to seek.
      expect(
        EmailTemplates.appealDecision(ctx, 'Ana', true, 'ok').html,
      ).not.toContain(words);
    }
    expect(EmailTemplates.postRemoved(en, 'Ana', 'x').html).toContain(
      'once, within six months',
    );
  });

  it('a cancelled plan says until when it lasts, in each language, and links to the plan', () => {
    const endsAt = new Date('2026-11-01T00:00:00.000Z');
    const mail = EmailTemplates.planCancelled(en, '<b>Pro</b>', 'ana', endsAt);

    expect(mail.subject).toBe('Your <b>Pro</b> plan is cancelled');
    expect(mail.html).toContain('1 November 2026');
    expect(mail.html).toContain('&lt;b&gt;Pro&lt;/b&gt;');
    expect(mail.html).toContain('@ana');
    expect(mail.html).toContain(
      'href="https://circlesfera.com/accounts/billing"',
    );
    expect(
      EmailTemplates.planCancelled(es, 'Pro', 'ana', endsAt).html,
    ).toContain('1 de noviembre de 2026');
  });

  it('a resumed plan says when it renews, in each language, and links to the plan', () => {
    const renewsAt = new Date('2026-11-01T00:00:00.000Z');
    const mail = EmailTemplates.planResumed(en, '<b>Pro</b>', 'ana', renewsAt);

    expect(mail.subject).toBe('Your <b>Pro</b> plan continues');
    expect(mail.html).toContain('renews on <strong>1 November 2026</strong>');
    expect(mail.html).toContain('&lt;b&gt;Pro&lt;/b&gt;');
    expect(mail.html).toContain('@ana');
    expect(mail.html).toContain(
      'href="https://circlesfera.com/accounts/billing"',
    );
    expect(
      EmailTemplates.planResumed(es, 'Pro', 'ana', renewsAt).html,
    ).toContain('1 de noviembre de 2026');
  });

  it('the end of a free year says the day, the monthly price with VAT a saved card pays and how to cancel, in each language, and links to the plan', () => {
    const endsAt = new Date('2027-11-25T10:00:00.000Z');
    const mail = EmailTemplates.freeYearEnding(
      en,
      '<b>Verified</b>',
      'ana',
      endsAt,
      499,
      'eur',
    );

    expect(mail.subject).toBe(
      'Your free year of <b>Verified</b> ends on 25 November 2027',
    );
    expect(mail.html).toContain('ends on <strong>25 November 2027</strong>');
    expect(mail.html).toContain('<strong>€4.99 a month, VAT included</strong>');
    expect(mail.html).toContain('the plan ends by itself');
    expect(mail.html).toContain('Settings → Subscription');
    expect(mail.html).toContain('&lt;b&gt;Verified&lt;/b&gt;');
    expect(mail.html).toContain(
      'href="https://circlesfera.com/accounts/billing"',
    );
    const es_ = EmailTemplates.freeYearEnding(
      es,
      'Verified',
      'ana',
      endsAt,
      499,
      'EUR',
    );
    expect(es_.subject).toBe(
      'Tu año gratis de Verified termina el 25 de noviembre de 2027',
    );
    expect(es_.html).toMatch(/4,99\s€ al mes, IVA incluido/);
  });

  it('a withdrawn plan says it ended and how much is refunded, in each language, and links to the plan', () => {
    const mail = EmailTemplates.planWithdrawn(
      en,
      '<b>Pro</b>',
      'ana',
      666,
      'eur',
    );

    expect(mail.subject).toBe('You withdrew from your <b>Pro</b> plan');
    expect(mail.html).toContain(
      'A refund of <strong>€6.66</strong>, the part of the period you had not used, is on its way',
    );
    expect(mail.html).toContain('&lt;b&gt;Pro&lt;/b&gt;');
    expect(mail.html).toContain('@ana');
    expect(mail.html).toContain(
      'href="https://circlesfera.com/accounts/billing"',
    );
    const es666 = EmailTemplates.planWithdrawn(es, 'Pro', 'ana', 666, 'eur');
    expect(es666.subject).toBe('Has desistido de tu plan Pro');
    expect(es666.html).toMatch(
      /Una devolución de <strong>6,66\s€<\/strong>.* está en camino/,
    );
  });

  it('a withdrawn plan paid partly from the balance says the card part is on its way and the team returns the rest, in each language', () => {
    const mail = EmailTemplates.planWithdrawn(
      en,
      'Pro',
      'ana',
      400,
      'eur',
      266,
    );
    expect(mail.html).toContain(
      'A refund of <strong>€4.00</strong>, the part of the period you had not used, is on its way',
    );
    expect(mail.html).toContain(
      'The other <strong>€2.66</strong>, paid from your account balance, is returned to you by the CircleSfera team.',
    );

    const es266 = EmailTemplates.planWithdrawn(es, 'Pro', 'ana', 0, 'eur', 266);
    expect(es266.html).toMatch(
      /Los otros <strong>2,66\s€<\/strong>, pagados con el saldo de tu cuenta, te los devuelve el equipo de CircleSfera\./,
    );
    // Wholly from the balance: no card refund is named.
    expect(es266.html).not.toContain('Una devolución de');
    expect(es266.html).not.toContain('No quedaba nada por devolver');
  });

  it('a withdrawn plan with nothing left to refund says so and names no amount', () => {
    const mail = EmailTemplates.planWithdrawn(en, 'Pro', 'ana', 0, 'eur');

    expect(mail.html).toContain('Nothing was left to refund');
    expect(mail.html).not.toContain('A refund of');
  });

  it('links the receipt and the removed post to live app pages', () => {
    expect(
      EmailTemplates.subscriptionReceipt(en, 'Premium', '€9.99').html,
    ).toContain('href="https://circlesfera.com/accounts/billing"');
    expect(EmailTemplates.postRemoved(en, 'Ana', 'Spam').html).toContain(
      'href="https://circlesfera.com/guidelines"',
    );
  });

  it('a broadcast keeps staff HTML and has no button without both fields', () => {
    const withButton = EmailTemplates.broadcast(
      en,
      'S',
      'T',
      '<b>news</b>',
      'Go',
      'https://x',
    );
    const without = EmailTemplates.broadcast(en, 'S', 'T', '<b>news</b>', 'Go');

    expect(withButton.html).toContain('<b>news</b>');
    expect(withButton.html).toContain('>Go</a>');
    expect(without.html).not.toContain('>Go</a>');
  });

  it('a newsletter has an escaped unsubscribe link in its footer; other emails have none', () => {
    const news = EmailTemplates.broadcast(
      en,
      'S',
      'T',
      'B',
      undefined,
      undefined,
      'https://circlesfera.com/newsletter/unsubscribe?token=a"b',
    );

    expect(news.html).toContain(
      'href="https://circlesfera.com/newsletter/unsubscribe?token=a&quot;b"',
    );
    expect(news.html).toContain('Unsubscribe from the CircleSfera newsletter');
    expect(EmailTemplates.broadcast(en, 'S', 'T', 'B').html).not.toContain(
      'Unsubscribe',
    );
    expect(EmailTemplates.welcome(en, 'Ana').html).not.toContain('Unsubscribe');
  });

  it('the under-16 notice says the decision was automated and how to ask a person to review it', () => {
    const { subject, html } = EmailTemplates.underMinimumAge(en, 'Kid');

    expect(subject).toBe('Your CircleSfera account has been deactivated');
    expect(html).toContain('under 16');
    expect(html).toContain('taken automatically');
    expect(html).toContain('a person will review it');
    expect(html).toContain('mailto:support@circlesfera.com');
  });

  it('a notice receipt and decision carry the address, the reference and the reasons, escaped', () => {
    const receipt = EmailTemplates.noticeReceived(
      en,
      'https://circlesfera.com/p/<1>',
      'ABCD1234',
    );
    expect(receipt.html).toContain('https://circlesfera.com/p/&lt;1&gt;');
    expect(receipt.html).toContain('ABCD1234');

    const acted = EmailTemplates.noticeDecided(
      en,
      'https://circlesfera.com/p/1',
      true,
      'Removed.\n<b>Illegal</b> sale.',
    );
    expect(acted.html).toContain('acted on the content');
    expect(acted.html).toContain(
      'Removed.<br>&lt;b&gt;Illegal&lt;/b&gt; sale.',
    );
    expect(
      EmailTemplates.noticeDecided(en, 'https://x', false, 'No.').html,
    ).toContain('did not act on the content');
  });

  it('both languages define every text', () => {
    const keys = (o: object): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === 'object' ? keys(v).map((n) => `${k}.${n}`) : [k],
      );
    expect(keys(EMAIL_COPY.es).sort()).toEqual(keys(EMAIL_COPY.en).sort());
  });
});

describe('fill and escapeHtml', () => {
  it('fills known placeholders and leaves unknown ones', () => {
    expect(fill('{a} and {b}', { a: '1' })).toBe('1 and {b}');
  });

  it('escapes the five HTML-sensitive characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('links the support reply to the request when it is given one', () => {
    const withLink = EmailTemplates.supportReply(
      en,
      'Help',
      'Fixed.',
      'https://circlesfera.com/support/requests/t-1',
    ).html;
    const without = EmailTemplates.supportReply(en, 'Help', 'Fixed.').html;

    expect(withLink).toContain('https://circlesfera.com/support/requests/t-1');
    expect(withLink).toContain('See your request');
    expect(without).not.toContain('See your request');
  });

  it('the reminder of a request names it, says when it will be solved and links to it, in both languages', () => {
    const url = 'https://circlesfera.com/support/requests/t-1';
    const inEnglish = EmailTemplates.supportReminder(en, 'A <b>', 42, 7, url);
    const inSpanish = EmailTemplates.supportReminder(es, 'Ayuda', 42, 7, url);

    expect(inEnglish.subject).toBe(
      'Do you still need help? A <b> - CircleSfera Support',
    );
    expect(inEnglish.html).toContain('request #42, <strong>A &lt;b&gt;');
    expect(inEnglish.html).toContain('in 7 days');
    expect(inEnglish.html).toContain(url);
    expect(inSpanish.subject).toBe(
      '¿Sigues necesitando ayuda? Ayuda - Soporte de CircleSfera',
    );
    expect(inSpanish.html).toContain('solicitud n.º 42');
    expect(inSpanish.html).toContain('en 7 días');
  });

  it('says an email can be answered only when it has an address to answer to', () => {
    const url = 'https://circlesfera.com/support/requests/t-1';
    const closed = [
      EmailTemplates.supportReply(en, 'Help', 'Fixed.', url).html,
      EmailTemplates.supportReminder(en, 'Help', 42, 7, url).html,
    ];
    const open = [
      EmailTemplates.supportReply(en, 'Help', 'Fixed.', url, true).html,
      EmailTemplates.supportReminder(en, 'Help', 42, 7, url, true).html,
      EmailTemplates.supportReply(es, 'Ayuda', 'Hecho.', url, true).html,
    ];

    for (const html of closed) {
      expect(html).toContain(EMAIL_COPY.en.automated);
      expect(html).not.toContain(EMAIL_COPY.en.replyable);
    }
    expect(open[0]).toContain(EMAIL_COPY.en.replyable);
    expect(open[0]).not.toContain(EMAIL_COPY.en.automated);
    expect(open[1]).toContain(EMAIL_COPY.en.replyable);
    expect(open[2]).toContain(EMAIL_COPY.es.replyable);
    // Every other email still says it cannot be answered.
    expect(EmailTemplates.verification(en, 'https://x/verify').html).toContain(
      EMAIL_COPY.en.automated,
    );
  });

  it('tells an unmatched sender where requests are opened, in both languages, and cannot be answered', () => {
    const url = 'https://circlesfera.com/support';
    const inEnglish = EmailTemplates.supportUnmatched(en, url);
    const inSpanish = EmailTemplates.supportUnmatched(es, url);

    expect(inEnglish.subject).toBe(
      'We could not add your email to a request - CircleSfera Support',
    );
    expect(inEnglish.html).toContain(url);
    expect(inEnglish.html).toContain(EMAIL_COPY.en.automated);
    expect(inSpanish.subject).toContain('No hemos podido añadir tu correo');
    expect(inSpanish.html).toContain('Ir a soporte');
  });
});
