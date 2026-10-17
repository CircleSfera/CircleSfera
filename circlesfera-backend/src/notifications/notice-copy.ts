import type { Locale, ReportReason, SuspensionCause } from '@prisma/client';

// In-app notices and push texts, written in the recipient account's
// language when the notice is created. Social notices hold only the action
// ("liked your post"): the app and the push title show who did it.

type ContentType = 'post' | 'comment' | 'story' | 'message' | 'account';

export type Notice =
  | { key: 'post_liked' }
  | { key: 'comment_liked' }
  | { key: 'post_commented' }
  | { key: 'comment_replied' }
  | { key: 'mentioned_in_comment' }
  | { key: 'mentioned_in_post' }
  | { key: 'mentioned_in_story' }
  | { key: 'countdown_ended'; title: string }
  | { key: 'followed' }
  | { key: 'follow_requested' }
  | { key: 'follow_accepted' }
  | { key: 'likes_aggregated'; name: string; target: 'post' | 'comment' }
  | {
      key: 'content_moderated';
      contentType: string;
      status: 'restored' | 'hidden' | 'removed' | 'flagged';
      note?: string;
      automated?: boolean;
    }
  | { key: 'report_updated'; reportType: string; status: string }
  | { key: 'appeal_decided'; outcome: string; notes?: string }
  | { key: 'account_suspended'; until: Date; reason?: string }
  | { key: 'account_warned'; reason?: string }
  | { key: 'live_host_warned'; reason: string }
  | { key: 'bot_labeled' }
  | { key: 'promotion_approved' }
  | { key: 'promotion_rejected'; note?: string; refunded?: boolean }
  | {
      key: 'profile_warning';
      rule: ReportReason;
      expires: Date;
    }
  | {
      key: 'profile_strike';
      rule: ReportReason;
      expires: Date;
      count: number;
      max: number;
      consequence: 'NONE' | 'SUSPENDED' | 'BANNED';
      suspendedUntil?: Date;
    }
  | { key: 'profile_banned' }
  | { key: 'profile_suspended_activity'; until: Date }
  | { key: 'profile_suspended_cause'; until: Date; cause: SuspensionCause }
  | {
      key: 'profile_restricted';
      by: 'automated' | 'staff';
      hours: number;
      days: number;
    }
  | { key: 'message_unlocked'; amountCents: number; currency: string }
  | { key: 'tip_received'; amountCents: number; currency: string }
  // The app shows it as coming from Support, like a sender.
  | { key: 'support_answered'; subject: string }
  | { key: 'live_started' };

export type NoticeKey = Notice['key'];

const DATE_LOCALE: Record<Locale, string> = { en: 'en-GB', es: 'es-ES' };

function day(locale: Locale, date: Date): string {
  return date.toLocaleDateString(DATE_LOCALE[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function money(locale: Locale, cents: number, currency: string): string {
  return new Intl.NumberFormat(DATE_LOCALE[locale], {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function contentType(value: string): ContentType {
  const v = value.toLowerCase();
  if (v === 'comment' || v === 'story' || v === 'message') return v;
  if (v === 'user' || v === 'account' || v === 'profile') return 'account';
  return 'post';
}

const CONTENT: Record<Locale, Record<ContentType, string>> = {
  en: {
    post: 'post',
    comment: 'comment',
    story: 'story',
    message: 'message',
    account: 'account',
  },
  es: {
    post: 'publicación',
    comment: 'comentario',
    story: 'historia',
    message: 'mensaje',
    account: 'cuenta',
  },
};

// Spanish article for "una publicación", "un comentario"...
const ES_ARTICLE: Record<ContentType, string> = {
  post: 'una',
  comment: 'un',
  story: 'una',
  message: 'un',
  account: 'una',
};

const REPORT_STATUS: Record<Locale, Record<string, string>> = {
  en: {
    PENDING: 'pending',
    REVIEWING: 'under review',
    RESOLVED: 'resolved',
    REJECTED: 'dismissed',
  },
  es: {
    PENDING: 'pendiente',
    REVIEWING: 'en revisión',
    RESOLVED: 'resuelta',
    REJECTED: 'desestimada',
  },
};

const RULES: Record<Locale, Record<ReportReason, string>> = {
  en: {
    SPAM: 'spam',
    HARASSMENT: 'harassment',
    ILLEGAL_CONTENT: 'illegal content',
    VIOLENCE: 'violence',
    HATE_SPEECH: 'hate speech',
    IMPERSONATION: 'impersonation',
    CSAM: 'child sexual abuse material',
    SCAM: 'scam',
    OTHER: 'a community guidelines violation',
  },
  es: {
    SPAM: 'spam',
    HARASSMENT: 'acoso',
    ILLEGAL_CONTENT: 'contenido ilegal',
    VIOLENCE: 'violencia',
    HATE_SPEECH: 'discurso de odio',
    IMPERSONATION: 'suplantación de identidad',
    CSAM: 'material de abuso sexual infantil',
    SCAM: 'estafa',
    OTHER: 'un incumplimiento de las normas de la comunidad',
  },
};

const rule = (locale: Locale, value: ReportReason) => RULES[locale][value];

// The serious causes of a direct suspension, as the Profile reads them after
// "for" / "por". A compromised Profile has its own sentence.
const SUSPENSION_CAUSES: Record<
  Locale,
  Record<Exclude<SuspensionCause, 'COMPROMISED'>, string>
> = {
  en: {
    CHILD_EXPLOITATION: 'content or conduct that sexually exploits minors',
    VIOLENCE: 'violence or threats',
    ILLEGAL: 'illegal content or activity',
    HATE_SPEECH: 'hate speech',
    HARASSMENT: 'serious harassment',
    SCAM: 'a scam or fraud',
  },
  es: {
    CHILD_EXPLOITATION: 'contenido o conducta de explotación sexual de menores',
    VIOLENCE: 'violencia o amenazas',
    ILLEGAL: 'contenido o actividad ilegal',
    HATE_SPEECH: 'discurso de odio',
    HARASSMENT: 'acoso grave',
    SCAM: 'estafa o fraude',
  },
};

// A note written by staff may end without a full stop; the next sentence
// needs one before it.
const endSentence = (text: string) =>
  /[.!?…]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;

const withNote = (text: string, label: string, note?: string) =>
  note?.trim() ? `${text} ${label}: ${note.trim()}` : text;

// The other ways to seek redress, named in every decision that can be
// appealed and in a rejected appeal.
const REDRESS: Record<Locale, string> = {
  en: 'You can also turn to a certified out-of-court dispute settlement body or to the courts.',
  es: 'También puedes acudir a un órgano certificado de resolución extrajudicial de litigios o a los tribunales.',
};

// How a decision can be appealed: once, within six months.
const APPEAL: Record<Locale, string> = {
  en: `You can appeal this decision once, within six months. ${REDRESS.en}`,
  es: `Puedes apelar esta decisión una vez, en los seis meses siguientes. ${REDRESS.es}`,
};

// The ways to seek redress when the decision itself cannot be appealed.
const REDRESS_ONLY: Record<Locale, string> = {
  en: 'You can turn to a certified out-of-court dispute settlement body or to the courts.',
  es: 'Puedes acudir a un órgano certificado de resolución extrajudicial de litigios o a los tribunales.',
};

// What a moderated item's notice says about redress. Only a post can be
// appealed today; a hidden or removed comment or story names the other
// ways to seek redress, and nothing is said when content is restored.
function noticeAppeal(
  locale: Locale,
  status: 'restored' | 'hidden' | 'removed' | 'flagged',
  type: string,
): string {
  if (status !== 'hidden' && status !== 'removed') return '';
  return contentType(type) === 'post'
    ? ` ${APPEAL[locale]}`
    : ` ${REDRESS_ONLY[locale]}`;
}

function renderEn(n: Notice): string {
  switch (n.key) {
    case 'post_liked':
      return 'liked your post';
    case 'comment_liked':
      return 'liked your comment';
    case 'post_commented':
      return 'commented on your post';
    case 'comment_replied':
      return 'replied to your comment';
    case 'mentioned_in_comment':
      return 'mentioned you in a comment';
    case 'mentioned_in_post':
      return 'mentioned you in a post';
    case 'mentioned_in_story':
      return 'mentioned you in their story';
    case 'countdown_ended':
      return `countdown “${n.title}” has ended`;
    case 'followed':
      return 'started following you';
    case 'follow_requested':
      return 'requested to follow you';
    case 'follow_accepted':
      return 'accepted your follow request';
    case 'likes_aggregated':
      // The sender may have no name (deleted Profile): no blank subject.
      return n.name
        ? `${n.name} and others liked your ${n.target}`
        : `Several people liked your ${n.target}`;
    case 'content_moderated': {
      const verb = {
        restored: 'restored',
        hidden: 'hid',
        removed: 'removed',
        flagged: 'flagged for review',
      }[n.status];
      const who = n.automated ? 'Automated moderation' : 'Moderation';
      return withNote(
        `${who} ${verb} your ${CONTENT.en[contentType(n.contentType)]}.`,
        'Note',
        n.note,
      ).concat(noticeAppeal('en', n.status, n.contentType));
    }
    case 'report_updated':
      return `Your report about a ${CONTENT.en[contentType(n.reportType)]} is now ${REPORT_STATUS.en[n.status] ?? n.status.toLowerCase()}.`;
    case 'appeal_decided': {
      const text = withNote(
        n.outcome === 'APPROVED'
          ? 'Your appeal was approved.'
          : n.outcome === 'REJECTED'
            ? 'Your appeal was reviewed and the decision stays in place.'
            : 'Your appeal is pending review again.',
        'Notes',
        n.notes,
      );
      return n.outcome === 'REJECTED'
        ? `${endSentence(text)} ${REDRESS.en}`
        : text;
    }
    case 'account_suspended':
      return `${endSentence(
        withNote(
          `Your account is suspended until ${day('en', n.until)}.`,
          'Reason',
          n.reason,
        ),
      )} ${APPEAL.en}`;
    case 'account_warned':
      return withNote(
        'You received a formal warning for breaking the CircleSfera rules.',
        'Reason',
        n.reason,
      );
    case 'live_host_warned':
      return withNote(
        'The CircleSfera team sent you a warning about your live broadcast.',
        'Reason',
        n.reason,
      );
    case 'bot_labeled':
      return `After a staff review, your account was labeled as possibly automated. ${APPEAL.en}`;
    case 'promotion_approved':
      return 'Your promotion was approved and is now running.';
    case 'promotion_rejected':
      return `${endSentence(withNote('Your promotion request was rejected.', 'Reason', n.note))}${n.refunded ? ' What was not spent is refunded.' : ''} ${APPEAL.en}`;
    case 'profile_warning':
      return `Warning: this profile broke the community guidelines (${rule('en', n.rule)}). There is no penalty this time. It expires on ${day('en', n.expires)}. ${APPEAL.en}`;
    case 'profile_strike': {
      const base = `Strike ${n.count} of ${n.max} on this profile for breaking the community guidelines (${rule('en', n.rule)}). It expires on ${day('en', n.expires)}.`;
      if (n.consequence === 'BANNED') {
        return `${base} This profile is banned. Your other profiles are not affected. ${APPEAL.en}`;
      }
      if (n.consequence === 'SUSPENDED' && n.suspendedUntil) {
        return `${base} This profile is suspended until ${day('en', n.suspendedUntil)}. ${APPEAL.en}`;
      }
      return `${base} ${APPEAL.en}`;
    }
    case 'profile_banned':
      return `This profile was banned after a report review. Your other profiles are not affected. ${APPEAL.en}`;
    case 'profile_suspended_activity':
      return `This profile is suspended until ${day('en', n.until)} after a review of unusual activity. Your other profiles are not affected. ${APPEAL.en}`;
    case 'profile_suspended_cause':
      return n.cause === 'COMPROMISED'
        ? `This profile is paused until ${day('en', n.until)} because someone else may have got into it. This protects you and is not a sanction. Your other profiles are not affected. Write to support to get it back.`
        : `After a review by our team, this profile is suspended until ${day('en', n.until)} for ${SUSPENSION_CAUSES.en[n.cause]}. Your other profiles are not affected. ${APPEAL.en}`;
    case 'profile_restricted':
      return n.by === 'automated'
        ? `An automated system detected unusual activity on this profile, such as many actions in a short time or repeated messages. Until a person on our team reviews it, for at most ${n.hours} hours, this profile can follow at most 20 accounts and send at most 5 message requests a day. Nothing is hidden or removed. ${APPEAL.en}`
        : `After a review by our team, this profile can follow at most 20 accounts and send at most 5 message requests a day for ${n.days} days, because of unusual activity such as many actions in a short time or repeated messages. Nothing is hidden or removed. ${APPEAL.en}`;
    case 'message_unlocked':
      return `unlocked your private message for ${money('en', n.amountCents, n.currency)}`;
    case 'tip_received':
      return `sent you a ${money('en', n.amountCents, n.currency)} tip`;
    case 'support_answered':
      return `answered your request "${n.subject}"`;
    case 'live_started':
      return 'started a live';
  }
}

function renderEs(n: Notice): string {
  switch (n.key) {
    case 'post_liked':
      return 'le ha gustado tu publicación';
    case 'comment_liked':
      return 'le ha gustado tu comentario';
    case 'post_commented':
      return 'ha comentado tu publicación';
    case 'comment_replied':
      return 'ha respondido a tu comentario';
    case 'mentioned_in_comment':
      return 'te ha mencionado en un comentario';
    case 'mentioned_in_post':
      return 'te ha mencionado en una publicación';
    case 'mentioned_in_story':
      return 'te ha mencionado en su historia';
    case 'countdown_ended':
      return `la cuenta atrás «${n.title}» ha terminado`;
    case 'followed':
      return 'ha empezado a seguirte';
    case 'follow_requested':
      return 'ha solicitado seguirte';
    case 'follow_accepted':
      return 'ha aceptado tu solicitud de seguimiento';
    case 'likes_aggregated': {
      const target = n.target === 'post' ? 'publicación' : 'comentario';
      return n.name
        ? `A ${n.name} y a otras personas les ha gustado tu ${target}`
        : `A varias personas les ha gustado tu ${target}`;
    }
    case 'content_moderated': {
      const verb = {
        restored: 'ha restaurado',
        hidden: 'ha ocultado',
        removed: 'ha retirado',
        flagged: 'ha marcado para revisión',
      }[n.status];
      const who = n.automated ? 'La moderación automática' : 'Moderación';
      return withNote(
        `${who} ${verb} tu ${CONTENT.es[contentType(n.contentType)]}.`,
        'Nota',
        n.note,
      ).concat(noticeAppeal('es', n.status, n.contentType));
    }
    case 'report_updated': {
      const type = contentType(n.reportType);
      return `Tu denuncia sobre ${ES_ARTICLE[type]} ${CONTENT.es[type]} ahora está ${REPORT_STATUS.es[n.status] ?? n.status.toLowerCase()}.`;
    }
    case 'appeal_decided': {
      const text = withNote(
        n.outcome === 'APPROVED'
          ? 'Tu apelación ha sido aprobada.'
          : n.outcome === 'REJECTED'
            ? 'Hemos revisado tu apelación y la decisión se mantiene.'
            : 'Tu apelación vuelve a estar pendiente de revisión.',
        'Notas',
        n.notes,
      );
      return n.outcome === 'REJECTED'
        ? `${endSentence(text)} ${REDRESS.es}`
        : text;
    }
    case 'account_suspended':
      return `${endSentence(
        withNote(
          `Tu cuenta está suspendida hasta el ${day('es', n.until)}.`,
          'Motivo',
          n.reason,
        ),
      )} ${APPEAL.es}`;
    case 'account_warned':
      return withNote(
        'Has recibido una advertencia formal por incumplir las normas de CircleSfera.',
        'Motivo',
        n.reason,
      );
    case 'live_host_warned':
      return withNote(
        'El equipo de CircleSfera te ha enviado un aviso sobre tu directo.',
        'Motivo',
        n.reason,
      );
    case 'bot_labeled':
      return `Tras una revisión del equipo, tu cuenta se ha marcado como posiblemente automatizada. ${APPEAL.es}`;
    case 'promotion_approved':
      return 'Tu promoción ha sido aprobada y ya está en marcha.';
    case 'promotion_rejected':
      return `${endSentence(
        withNote(
          'Tu solicitud de promoción ha sido rechazada.',
          'Motivo',
          n.note,
        ),
      )}${n.refunded ? ' Te devolvemos lo que no se haya gastado.' : ''} ${APPEAL.es}`;
    case 'profile_warning':
      return `Advertencia: este perfil ha incumplido las normas de la comunidad (${rule('es', n.rule)}). Esta vez no hay sanción. Caduca el ${day('es', n.expires)}. ${APPEAL.es}`;
    case 'profile_strike': {
      const base = `Strike ${n.count} de ${n.max} en este perfil por incumplir las normas de la comunidad (${rule('es', n.rule)}). Caduca el ${day('es', n.expires)}.`;
      if (n.consequence === 'BANNED') {
        return `${base} Este perfil queda bloqueado. Tus otros perfiles no se ven afectados. ${APPEAL.es}`;
      }
      if (n.consequence === 'SUSPENDED' && n.suspendedUntil) {
        return `${base} Este perfil queda suspendido hasta el ${day('es', n.suspendedUntil)}. ${APPEAL.es}`;
      }
      return `${base} ${APPEAL.es}`;
    }
    case 'profile_banned':
      return `Este perfil ha sido bloqueado tras revisar una denuncia. Tus otros perfiles no se ven afectados. ${APPEAL.es}`;
    case 'profile_suspended_activity':
      return `Este perfil está suspendido hasta el ${day('es', n.until)} tras revisar una actividad inusual. Tus otros perfiles no se ven afectados. ${APPEAL.es}`;
    case 'profile_suspended_cause':
      return n.cause === 'COMPROMISED'
        ? `Este perfil está en pausa hasta el ${day('es', n.until)} porque otra persona puede haber entrado en él. Es una protección para ti, no una sanción. Tus otros perfiles no se ven afectados. Escribe a soporte para recuperarlo.`
        : `Tras una revisión de nuestro equipo, este perfil está suspendido hasta el ${day('es', n.until)} por ${SUSPENSION_CAUSES.es[n.cause]}. Tus otros perfiles no se ven afectados. ${APPEAL.es}`;
    case 'profile_restricted':
      return n.by === 'automated'
        ? `Un sistema automático ha detectado actividad inusual en este perfil, como muchas acciones en poco tiempo o mensajes repetidos. Hasta que una persona de nuestro equipo lo revise, durante un máximo de ${n.hours} horas, este perfil puede seguir como mucho a 20 cuentas y enviar como mucho 5 solicitudes de mensaje al día. No se oculta ni se elimina nada. ${APPEAL.es}`
        : `Tras una revisión de nuestro equipo, durante ${n.days} días este perfil puede seguir como mucho a 20 cuentas y enviar como mucho 5 solicitudes de mensaje al día, por actividad inusual como muchas acciones en poco tiempo o mensajes repetidos. No se oculta ni se elimina nada. ${APPEAL.es}`;
    case 'message_unlocked':
      return `ha desbloqueado tu mensaje privado por ${money('es', n.amountCents, n.currency)}`;
    case 'tip_received':
      return `te ha enviado una propina de ${money('es', n.amountCents, n.currency)}`;
    case 'support_answered':
      return `ha respondido a tu solicitud «${n.subject}»`;
    case 'live_started':
      return 'ha empezado un directo';
  }
}

export function renderNotice(locale: Locale, notice: Notice): string {
  return locale === 'en' ? renderEn(notice) : renderEs(notice);
}

// Push summarising batched likes.
export function renderDigest(
  locale: Locale,
  count: number,
): { title: string; body: string } {
  if (locale === 'en') {
    return {
      title: 'New activity',
      body:
        count === 1
          ? 'You have 1 new interaction on your posts.'
          : `You have ${count} new interactions on your posts.`,
    };
  }
  return {
    title: 'Nueva actividad',
    body:
      count === 1
        ? 'Tienes 1 interacción nueva en tus publicaciones.'
        : `Tienes ${count} interacciones nuevas en tus publicaciones.`,
  };
}
