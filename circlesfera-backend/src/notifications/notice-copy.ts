import type { Locale, ReportReason } from '@prisma/client';

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
  | { key: 'bot_labeled' }
  | { key: 'promotion_approved' }
  | { key: 'promotion_rejected'; note?: string }
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
  | {
      key: 'profile_restricted';
      by: 'automated' | 'staff';
      hours: number;
      days: number;
    }
  | { key: 'message_unlocked'; amountCents: number; currency: string }
  | { key: 'tip_received'; amountCents: number; currency: string }
  // The app shows it as coming from Support, like a sender.
  | { key: 'support_answered'; subject: string };

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

const withNote = (text: string, label: string, note?: string) =>
  note?.trim() ? `${text} ${label}: ${note.trim()}` : text;

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
      ).concat(' You can appeal from Settings → Appeals.');
    }
    case 'report_updated':
      return `Your report about a ${CONTENT.en[contentType(n.reportType)]} is now ${REPORT_STATUS.en[n.status] ?? n.status.toLowerCase()}.`;
    case 'appeal_decided':
      return withNote(
        n.outcome === 'APPROVED'
          ? 'Your appeal was approved.'
          : n.outcome === 'REJECTED'
            ? 'Your appeal was reviewed and the decision stays in place.'
            : 'Your appeal is pending review again.',
        'Notes',
        n.notes,
      );
    case 'account_suspended':
      return withNote(
        `Your account is suspended until ${day('en', n.until)}.`,
        'Reason',
        n.reason,
      );
    case 'account_warned':
      return withNote(
        'You received a formal warning for breaking the CircleSfera rules.',
        'Reason',
        n.reason,
      );
    case 'bot_labeled':
      return 'After a staff review, your account was labeled as possibly automated. You can appeal from Settings → Appeals.';
    case 'promotion_approved':
      return 'Your promotion was approved. Your content will now reach more people.';
    case 'promotion_rejected':
      return withNote('Your promotion request was rejected.', 'Reason', n.note);
    case 'profile_warning':
      return `Warning: this profile broke the community guidelines (${rule('en', n.rule)}). There is no penalty this time. It expires on ${day('en', n.expires)}. You can appeal it.`;
    case 'profile_strike': {
      const base = `Strike ${n.count} of ${n.max} on this profile for breaking the community guidelines (${rule('en', n.rule)}). It expires on ${day('en', n.expires)}.`;
      if (n.consequence === 'BANNED') {
        return `${base} This profile is banned. Your other profiles are not affected. You can appeal this decision.`;
      }
      if (n.consequence === 'SUSPENDED' && n.suspendedUntil) {
        return `${base} This profile is suspended until ${day('en', n.suspendedUntil)}. You can appeal this decision.`;
      }
      return `${base} You can appeal it.`;
    }
    case 'profile_banned':
      return 'This profile was banned after a report review. Your other profiles are not affected. You can appeal this decision.';
    case 'profile_suspended_activity':
      return `This profile is suspended until ${day('en', n.until)} after a review of unusual activity. Your other profiles are not affected. You can appeal this decision.`;
    case 'profile_restricted':
      return n.by === 'automated'
        ? `An automated system detected unusual activity on this profile, such as many actions in a short time or repeated messages. Until a person on our team reviews it, for at most ${n.hours} hours, this profile can follow at most 20 accounts and send at most 5 message requests a day. Nothing is hidden or removed. You can appeal this decision.`
        : `After a review by our team, this profile can follow at most 20 accounts and send at most 5 message requests a day for ${n.days} days, because of unusual activity such as many actions in a short time or repeated messages. Nothing is hidden or removed. You can appeal this decision.`;
    case 'message_unlocked':
      return `unlocked your private message for ${money('en', n.amountCents, n.currency)}`;
    case 'tip_received':
      return `sent you a ${money('en', n.amountCents, n.currency)} tip`;
    case 'support_answered':
      return `answered your request "${n.subject}"`;
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
      ).concat(' Puedes apelar desde Ajustes → Apelaciones.');
    }
    case 'report_updated': {
      const type = contentType(n.reportType);
      return `Tu denuncia sobre ${ES_ARTICLE[type]} ${CONTENT.es[type]} ahora está ${REPORT_STATUS.es[n.status] ?? n.status.toLowerCase()}.`;
    }
    case 'appeal_decided':
      return withNote(
        n.outcome === 'APPROVED'
          ? 'Tu apelación ha sido aprobada.'
          : n.outcome === 'REJECTED'
            ? 'Hemos revisado tu apelación y la decisión se mantiene.'
            : 'Tu apelación vuelve a estar pendiente de revisión.',
        'Notas',
        n.notes,
      );
    case 'account_suspended':
      return withNote(
        `Tu cuenta está suspendida hasta el ${day('es', n.until)}.`,
        'Motivo',
        n.reason,
      );
    case 'account_warned':
      return withNote(
        'Has recibido una advertencia formal por incumplir las normas de CircleSfera.',
        'Motivo',
        n.reason,
      );
    case 'bot_labeled':
      return 'Tras una revisión del equipo, tu cuenta se ha marcado como posiblemente automatizada. Puedes apelar desde Ajustes → Apelaciones.';
    case 'promotion_approved':
      return 'Tu promoción ha sido aprobada. Tu contenido llegará ahora a más personas.';
    case 'promotion_rejected':
      return withNote(
        'Tu solicitud de promoción ha sido rechazada.',
        'Motivo',
        n.note,
      );
    case 'profile_warning':
      return `Advertencia: este perfil ha incumplido las normas de la comunidad (${rule('es', n.rule)}). Esta vez no hay sanción. Caduca el ${day('es', n.expires)}. Puedes apelarla.`;
    case 'profile_strike': {
      const base = `Strike ${n.count} de ${n.max} en este perfil por incumplir las normas de la comunidad (${rule('es', n.rule)}). Caduca el ${day('es', n.expires)}.`;
      if (n.consequence === 'BANNED') {
        return `${base} Este perfil queda bloqueado. Tus otros perfiles no se ven afectados. Puedes apelar esta decisión.`;
      }
      if (n.consequence === 'SUSPENDED' && n.suspendedUntil) {
        return `${base} Este perfil queda suspendido hasta el ${day('es', n.suspendedUntil)}. Puedes apelar esta decisión.`;
      }
      return `${base} Puedes apelarlo.`;
    }
    case 'profile_banned':
      return 'Este perfil ha sido bloqueado tras revisar una denuncia. Tus otros perfiles no se ven afectados. Puedes apelar esta decisión.';
    case 'profile_suspended_activity':
      return `Este perfil está suspendido hasta el ${day('es', n.until)} tras revisar una actividad inusual. Tus otros perfiles no se ven afectados. Puedes apelar esta decisión.`;
    case 'profile_restricted':
      return n.by === 'automated'
        ? `Un sistema automático ha detectado actividad inusual en este perfil, como muchas acciones en poco tiempo o mensajes repetidos. Hasta que una persona de nuestro equipo lo revise, durante un máximo de ${n.hours} horas, este perfil puede seguir como mucho a 20 cuentas y enviar como mucho 5 solicitudes de mensaje al día. No se oculta ni se elimina nada. Puedes apelar esta decisión.`
        : `Tras una revisión de nuestro equipo, durante ${n.days} días este perfil puede seguir como mucho a 20 cuentas y enviar como mucho 5 solicitudes de mensaje al día, por actividad inusual como muchas acciones en poco tiempo o mensajes repetidos. No se oculta ni se elimina nada. Puedes apelar esta decisión.`;
    case 'message_unlocked':
      return `ha desbloqueado tu mensaje privado por ${money('es', n.amountCents, n.currency)}`;
    case 'tip_received':
      return `te ha enviado una propina de ${money('es', n.amountCents, n.currency)}`;
    case 'support_answered':
      return `ha respondido a tu solicitud «${n.subject}»`;
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
