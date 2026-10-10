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

  it('approved and rejected appeals read differently', () => {
    expect(EmailTemplates.appealDecision(es, 'Ana', true, 'ok').subject).toBe(
      'Tu apelación ha sido aprobada',
    );
    expect(EmailTemplates.appealDecision(es, 'Ana', false, 'no').subject).toBe(
      'Hemos revisado tu apelación',
    );
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
