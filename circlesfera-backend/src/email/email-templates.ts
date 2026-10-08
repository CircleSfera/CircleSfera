import type { Locale } from '@prisma/client';
import { EMAIL_COPY, type EmailCopy, escapeHtml, fill } from './email-copy.js';

// Transactional emails in the CircleSfera identity: dark surfaces, the coral
// to purple brand gradient, the logo mark and the app's type scale. Built for
// email clients: tables, inline styles, no web fonts or external CSS, and a
// solid colour behind every gradient for clients that drop gradients.

const BRAND = {
  primary: '#884cff',
  gradient: 'linear-gradient(90deg, #ff5757 0%, #884cff 100%)',
  surfaceBase: '#030303',
  surfaceElevated: '#0a0a0a',
  surfaceRaised: '#1c1c1c',
  border: '#262626',
  text: '#ffffff',
  textBody: '#d4d4d8',
  textMuted: '#a1a1aa',
  textSubtle: '#71717a',
  font: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
} as const;

export interface EmailContext {
  locale: Locale;
  // Public web origin, for links and the hosted logo.
  frontendUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

interface LayoutOptions {
  title: string;
  // Body HTML. Values from people must already be escaped.
  content: string;
  button?: { text: string; url: string };
  // A secondary note under the body (expiry, "ignore if not you").
  note?: string;
}

function layout(
  ctx: EmailContext,
  copy: EmailCopy,
  { title, content, button, note }: LayoutOptions,
): string {
  const year = String(new Date().getFullYear());
  const logoUrl = `${ctx.frontendUrl}/email/logo.png`;
  const safeButtonUrl = button ? escapeHtml(button.url) : '';

  const buttonBlock = button
    ? `
          <tr>
            <td style="padding: 8px 0 0 0;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" bgcolor="${BRAND.primary}" style="border-radius: 12px; background-color: ${BRAND.primary}; background-image: ${BRAND.gradient};">
                    <a href="${safeButtonUrl}" target="_blank" style="display: inline-block; padding: 14px 28px; font-family: ${BRAND.font}; font-size: 16px; line-height: 20px; font-weight: 600; color: ${BRAND.text}; text-decoration: none; border-radius: 12px;">${button.text}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 0 0 0; font-family: ${BRAND.font}; font-size: 12px; line-height: 17px; color: ${BRAND.textSubtle};">
              ${copy.buttonFallback}<br>
              <a href="${safeButtonUrl}" target="_blank" style="color: ${BRAND.primary}; text-decoration: underline; word-break: break-all;">${safeButtonUrl}</a>
            </td>
          </tr>`
    : '';

  const noteBlock = note
    ? `
          <tr>
            <td style="padding: 24px 0 0 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding: 16px; background-color: ${BRAND.surfaceRaised}; border-radius: 12px; font-family: ${BRAND.font}; font-size: 14px; line-height: 21px; color: ${BRAND.textMuted};">${note}</td>
                </tr>
              </table>
            </td>
          </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="${copy.htmlLang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${BRAND.surfaceBase}; -webkit-font-smoothing: antialiased;">
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${title}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${BRAND.surfaceBase}" style="background-color: ${BRAND.surfaceBase};">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 560px;">
          <tr>
            <td style="padding: 0 4px 24px 4px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="vertical-align: middle;"><img src="${logoUrl}" width="40" height="40" alt="" style="display: block; border: 0;"></td>
                  <td style="vertical-align: middle; padding-left: 12px; font-family: ${BRAND.font}; font-size: 20px; line-height: 24px; font-weight: 800; color: ${BRAND.text}; letter-spacing: -0.2px;">CircleSfera</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td bgcolor="${BRAND.surfaceElevated}" style="background-color: ${BRAND.surfaceElevated}; border: 1px solid ${BRAND.border}; border-radius: 16px; overflow: hidden;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td height="4" bgcolor="${BRAND.primary}" style="height: 4px; line-height: 4px; font-size: 0; background-color: ${BRAND.primary}; background-image: ${BRAND.gradient};">&nbsp;</td>
                </tr>
                <tr>
                  <td style="padding: 32px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="padding: 0 0 16px 0; font-family: ${BRAND.font}; font-size: 24px; line-height: 29px; font-weight: 700; color: ${BRAND.text};">${title}</td>
                      </tr>
                      <tr>
                        <td style="padding: 0 0 24px 0; font-family: ${BRAND.font}; font-size: 16px; line-height: 24px; color: ${BRAND.textBody};">${content}</td>
                      </tr>${buttonBlock}${noteBlock}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 24px 16px 0 16px; font-family: ${BRAND.font}; font-size: 12px; line-height: 18px; color: ${BRAND.textSubtle};">
              ${fill(copy.footer, { year })}<br>
              ${copy.automated}<br>
              <a href="${ctx.frontendUrl}/privacy" target="_blank" style="color: ${BRAND.textMuted}; text-decoration: underline;">${copy.privacy}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Each builder returns the subject and HTML in the recipient's language.
// Values from people (names, staff notes, replies) are escaped here.
export const EmailTemplates = {
  welcome: (ctx: EmailContext, name: string): RenderedEmail => {
    const copy = EMAIL_COPY[ctx.locale];
    return {
      subject: copy.welcome.subject,
      html: layout(ctx, copy, {
        title: fill(copy.welcome.title, { name: escapeHtml(name) }),
        content: copy.welcome.body,
        button: { text: copy.welcome.button, url: ctx.frontendUrl },
      }),
    };
  },

  verification: (ctx: EmailContext, url: string): RenderedEmail => {
    const copy = EMAIL_COPY[ctx.locale];
    return {
      subject: copy.verification.subject,
      html: layout(ctx, copy, {
        title: copy.verification.title,
        content: copy.verification.body,
        button: { text: copy.verification.button, url },
        note: copy.verification.footer,
      }),
    };
  },

  passwordReset: (ctx: EmailContext, url: string): RenderedEmail => {
    const copy = EMAIL_COPY[ctx.locale];
    return {
      subject: copy.passwordReset.subject,
      html: layout(ctx, copy, {
        title: copy.passwordReset.title,
        content: copy.passwordReset.body,
        button: { text: copy.passwordReset.button, url },
        note: copy.passwordReset.footer,
      }),
    };
  },

  // Staff-written broadcast: subject, title and content are used as written
  // (the content may contain basic HTML by design).
  broadcast: (
    ctx: EmailContext,
    subject: string,
    title: string,
    content: string,
    buttonText?: string,
    buttonUrl?: string,
  ): RenderedEmail => ({
    subject,
    html: layout(ctx, EMAIL_COPY[ctx.locale], {
      title,
      content,
      button:
        buttonText && buttonUrl
          ? { text: buttonText, url: buttonUrl }
          : undefined,
    }),
  }),

  accountBanned: (ctx: EmailContext, name: string): RenderedEmail => {
    const copy = EMAIL_COPY[ctx.locale];
    return {
      subject: copy.accountBanned.subject,
      html: layout(ctx, copy, {
        title: copy.accountBanned.title,
        content: fill(copy.accountBanned.body, { name: escapeHtml(name) }),
        button: {
          text: copy.contactSupport,
          url: 'mailto:support@circlesfera.com',
        },
      }),
    };
  },

  postRemoved: (
    ctx: EmailContext,
    name: string,
    reason: string | undefined,
  ): RenderedEmail => {
    const copy = EMAIL_COPY[ctx.locale];
    return {
      subject: copy.postRemoved.subject,
      html: layout(ctx, copy, {
        title: copy.postRemoved.title,
        content: fill(copy.postRemoved.body, {
          name: escapeHtml(name),
          reason: escapeHtml(reason?.trim() || copy.moderationReason),
        }),
        button: {
          text: copy.postRemoved.button,
          url: `${ctx.frontendUrl}/guidelines`,
        },
      }),
    };
  },

  appealDecision: (
    ctx: EmailContext,
    name: string,
    approved: boolean,
    notes: string | undefined,
  ): RenderedEmail => {
    const copy = EMAIL_COPY[ctx.locale];
    const text = approved ? copy.appealApproved : copy.appealRejected;
    return {
      subject: text.subject,
      html: layout(ctx, copy, {
        title: text.title,
        content: fill(text.body, {
          name: escapeHtml(name),
          notes: escapeHtml(notes?.trim() || copy.appealDefaultNotes),
        }),
      }),
    };
  },

  dataExportReady: (
    ctx: EmailContext,
    name: string,
    url: string,
  ): RenderedEmail => {
    const copy = EMAIL_COPY[ctx.locale];
    return {
      subject: copy.dataExportReady.subject,
      html: layout(ctx, copy, {
        title: fill(copy.dataExportReady.title, { name: escapeHtml(name) }),
        content: copy.dataExportReady.body,
        button: { text: copy.dataExportReady.button, url },
      }),
    };
  },

  supportReply: (
    ctx: EmailContext,
    originalSubject: string,
    reply: string,
    // Where the requester reads the conversation and answers.
    requestUrl?: string,
  ): RenderedEmail => {
    const copy = EMAIL_COPY[ctx.locale];
    return {
      subject: fill(copy.supportReply.subject, { subject: originalSubject }),
      html: layout(ctx, copy, {
        title: copy.supportReply.title,
        content: escapeHtml(reply).replace(/\n/g, '<br>'),
        ...(requestUrl && {
          button: { text: copy.supportReply.button, url: requestUrl },
        }),
      }),
    };
  },

  subscriptionReceipt: (
    ctx: EmailContext,
    planName: string,
    amount: string,
  ): RenderedEmail => {
    const copy = EMAIL_COPY[ctx.locale];
    return {
      subject: fill(copy.subscriptionReceipt.subject, { plan: planName }),
      html: layout(ctx, copy, {
        title: copy.subscriptionReceipt.title,
        content: fill(copy.subscriptionReceipt.body, {
          plan: escapeHtml(planName),
          amount: escapeHtml(amount),
        }),
        button: {
          text: copy.subscriptionReceipt.button,
          url: `${ctx.frontendUrl}/accounts/billing`,
        },
      }),
    };
  },
};
