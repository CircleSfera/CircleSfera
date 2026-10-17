import type { Locale } from '@prisma/client';

// Every text of the transactional emails, in each supported language.
// Placeholders are filled by the templates; values from people (names, staff
// notes, support replies) are HTML-escaped before they are inserted.

export interface EmailCopy {
  htmlLang: string;
  footer: string;
  automated: string;
  // In place of the line above, on an email that can be answered.
  replyable: string;
  buttonFallback: string;
  privacy: string;
  // The footer link of a newsletter that leaves it in one step.
  unsubscribe: string;
  welcome: { subject: string; title: string; body: string; button: string };
  verification: {
    subject: string;
    title: string;
    body: string;
    button: string;
    footer: string;
  };
  passwordReset: {
    subject: string;
    title: string;
    body: string;
    button: string;
    footer: string;
  };
  accountBanned: { subject: string; title: string; body: string };
  // A notice of illegal content: its receipt, and the decision on it.
  noticeReceived: { subject: string; title: string; body: string };
  noticeDecided: {
    subject: string;
    title: string;
    actioned: string;
    noAction: string;
    reasons: string;
  };
  // Closed automatically: the identity check showed an age under 16.
  underMinimumAge: { subject: string; title: string; body: string };
  postRemoved: { subject: string; title: string; body: string; button: string };
  postsRemoved: { subject: string; title: string; body: string };
  appealApproved: { subject: string; title: string; body: string };
  appealRejected: { subject: string; title: string; body: string };
  appealDefaultNotes: string;
  moderationReason: string;
  contactSupport: string;
  dataExportReady: {
    subject: string;
    title: string;
    body: string;
    button: string;
  };
  supportReply: { subject: string; title: string; button: string };
  supportReminder: {
    subject: string;
    title: string;
    body: string;
    button: string;
  };
  supportUnmatched: {
    subject: string;
    title: string;
    body: string;
    button: string;
  };
  subscriptionReceipt: {
    subject: string;
    title: string;
    body: string;
    button: string;
  };
  planCancelled: {
    subject: string;
    title: string;
    body: string;
    button: string;
  };
  greeting: string;
  fallbackName: string;
}

const en: EmailCopy = {
  htmlLang: 'en',
  footer: '© {year} CircleSfera. All rights reserved.',
  automated: 'This is an automated email, please do not reply to it.',
  replyable: 'You can answer this email: your answer is added to your request.',
  buttonFallback:
    'If the button does not work, copy and paste this link into your browser:',
  privacy: 'Privacy policy',
  unsubscribe: 'Unsubscribe from the CircleSfera newsletter',
  welcome: {
    subject: 'Welcome to CircleSfera!',
    title: 'Welcome, {name}!',
    body: 'Your access to CircleSfera has been approved. Start building your most meaningful connections today.',
    button: 'Explore CircleSfera',
  },
  verification: {
    subject: 'Verify your CircleSfera account',
    title: 'Verify your email',
    body: 'To keep your account secure and join the community, please verify your email address.',
    button: 'Verify email',
    footer:
      'If you did not create this account, you can safely ignore this email.',
  },
  passwordReset: {
    subject: 'Reset your CircleSfera password',
    title: 'Reset your password',
    body: 'We received a request to reset the password of your account. If it was you, use the button below.',
    button: 'Reset password',
    footer:
      'This link expires in 1 hour for security reasons. If you did not ask for this change, ignore this email.',
  },
  noticeReceived: {
    subject: 'We received your notice of illegal content',
    title: 'Notice received',
    body: 'We received your notice about {url}. Our team will review it and email you the decision. Reference: {ref}.',
  },
  noticeDecided: {
    subject: 'Decision on your notice of illegal content',
    title: 'Decision on your notice',
    actioned: 'We reviewed your notice about {url} and acted on the content.',
    noAction:
      'We reviewed your notice about {url} and did not act on the content.',
    reasons: 'Reasons:',
  },
  underMinimumAge: {
    subject: 'Your CircleSfera account has been deactivated',
    title: 'Account deactivated',
    body: 'Hello {name},<br><br>The identity check you completed shows a date of birth under 16. CircleSfera is for people aged 16 and over, so your account has been deactivated.<br><br>This decision was taken automatically, from the date of birth in your identity document. If you think it is a mistake, write to support@circlesfera.com and a person will review it.',
  },
  accountBanned: {
    subject: 'Your CircleSfera account was suspended',
    title: 'Account suspended',
    body: 'Hello {name},<br><br>Your account was suspended by our moderation team for violating the Terms of Service.<br><br>If you think this is a mistake, you can appeal from the sign-in screen once, within six months. You can also turn to a certified out-of-court dispute settlement body or to the courts.',
  },
  postRemoved: {
    subject: 'Your post was removed',
    title: 'Your post was removed',
    body: 'Hello {name},<br><br>One of your posts was removed by our moderation team for breaking the community guidelines.<br><br><strong>Reason:</strong> {reason}<br><br>You can appeal this decision once, within six months, from Settings → Appeals. You can also turn to a certified out-of-court dispute settlement body or to the courts.',
    button: 'Read the guidelines',
  },
  postsRemoved: {
    subject: '{count} of your posts were removed',
    title: 'Your posts were removed',
    body: 'Hello {name},<br><br>{count} of your posts were removed by our moderation team for breaking the community guidelines.<br><br><strong>Reason:</strong> {reason}<br><br>You can appeal each removal once, within six months, from Settings → Appeals. You can also turn to a certified out-of-court dispute settlement body or to the courts.',
  },
  appealApproved: {
    subject: 'Your appeal was approved',
    title: 'Appeal approved',
    body: 'Hello {name},<br><br>We reviewed your appeal and reversed the decision.<br><br><strong>Notes:</strong> {notes}',
  },
  appealRejected: {
    subject: 'Your appeal was reviewed',
    title: 'Decision upheld',
    body: 'Hello {name},<br><br>We reviewed your appeal and the decision stays in place.<br><br><strong>Notes:</strong> {notes}<br><br>Each decision can be appealed once, so this one cannot be appealed again. You can still turn to a certified out-of-court dispute settlement body or to the courts.',
  },
  appealDefaultNotes: 'Your appeal was reviewed under our Terms of Service.',
  moderationReason: 'Violation of the community guidelines',
  contactSupport: 'Contact support',
  dataExportReady: {
    subject: 'Your data export is ready',
    title: 'Hello {name}',
    body: 'The export of your data you requested is ready to download. For security reasons, the link expires in 7 days.',
    button: 'Download my data',
  },
  supportReply: {
    subject: 'Re: {subject} - CircleSfera Support',
    title: 'Reply to your request',
    button: 'See your request',
  },
  supportReminder: {
    subject: 'Do you still need help? {subject} - CircleSfera Support',
    title: 'Do you still need help?',
    body: 'We answered your request #{reference}, <strong>{subject}</strong>, and have not heard back from you.<br><br>If you still need help, answer in the request. If we do not hear from you in {days} days, we will mark it as solved.',
    button: 'See your request',
  },
  supportUnmatched: {
    subject: 'We could not add your email to a request - CircleSfera Support',
    title: 'Your email did not reach a request',
    body: 'This address only receives answers to support requests, sent from the address that opened the request.<br><br>If you need help, open a request from the support page. If you were answering one, answer from the email address of your account, or write in the request itself.',
    button: 'Go to support',
  },
  subscriptionReceipt: {
    subject: 'Subscription receipt - {plan}',
    title: 'Subscription receipt',
    body: 'Thank you for subscribing to CircleSfera.<br><br>You now have the <strong>{plan}</strong> plan.<br>The charge of <strong>{amount}</strong> was processed and your plan features are active.',
    button: 'Manage my plan',
  },
  planCancelled: {
    subject: 'Your {plan} plan is cancelled',
    title: 'Plan cancelled',
    body: 'You cancelled the <strong>{plan}</strong> plan of @{username}.<br><br>You keep every feature of the plan until <strong>{date}</strong>, the end of the period you already paid. Nothing more will be charged.<br><br>If you did not cancel it, write to support@circlesfera.com.',
    button: 'See my plan',
  },
  greeting: 'Hello',
  fallbackName: 'there',
};

const es: EmailCopy = {
  htmlLang: 'es',
  footer: '© {year} CircleSfera. Todos los derechos reservados.',
  automated:
    'Este es un correo automático, por favor no respondas directamente.',
  replyable:
    'Puedes responder a este correo: tu respuesta se añade a tu solicitud.',
  buttonFallback:
    'Si el botón no funciona, copia y pega este enlace en tu navegador:',
  privacy: 'Política de privacidad',
  unsubscribe: 'Darse de baja de la newsletter de CircleSfera',
  welcome: {
    subject: '¡Bienvenido a CircleSfera!',
    title: '¡Bienvenido, {name}!',
    body: 'Tu acceso a CircleSfera ha sido aprobado. Empieza hoy mismo a construir tus conexiones más significativas.',
    button: 'Explorar CircleSfera',
  },
  verification: {
    subject: 'Verifica tu cuenta en CircleSfera',
    title: 'Verifica tu email',
    body: 'Para garantizar la seguridad de tu cuenta y unirte a la comunidad, necesitamos que verifiques tu dirección de correo electrónico.',
    button: 'Verificar email',
    footer:
      'Si no has creado esta cuenta, puedes ignorar este correo de forma segura.',
  },
  passwordReset: {
    subject: 'Recupera tu contraseña en CircleSfera',
    title: 'Restablecer contraseña',
    body: 'Hemos recibido una solicitud para restablecer la contraseña de tu cuenta. Si has sido tú, usa el botón de abajo.',
    button: 'Restablecer contraseña',
    footer:
      'Este enlace caduca en 1 hora por motivos de seguridad. Si no has solicitado este cambio, ignora este mensaje.',
  },
  noticeReceived: {
    subject: 'Hemos recibido tu aviso de contenido ilegal',
    title: 'Aviso recibido',
    body: 'Hemos recibido tu aviso sobre {url}. Nuestro equipo lo revisará y te enviará la decisión por correo. Referencia: {ref}.',
  },
  noticeDecided: {
    subject: 'Decisión sobre tu aviso de contenido ilegal',
    title: 'Decisión sobre tu aviso',
    actioned:
      'Hemos revisado tu aviso sobre {url} y hemos actuado sobre el contenido.',
    noAction:
      'Hemos revisado tu aviso sobre {url} y no hemos actuado sobre el contenido.',
    reasons: 'Motivos:',
  },
  underMinimumAge: {
    subject: 'Tu cuenta de CircleSfera se ha desactivado',
    title: 'Cuenta desactivada',
    body: 'Hola {name},<br><br>La verificación de identidad que has hecho muestra una fecha de nacimiento de menos de 16 años. CircleSfera es para personas de 16 años o más, así que tu cuenta se ha desactivado.<br><br>Esta decisión se ha tomado de forma automática, a partir de la fecha de nacimiento de tu documento de identidad. Si crees que es un error, escribe a support@circlesfera.com y una persona la revisará.',
  },
  accountBanned: {
    subject: 'Tu cuenta de CircleSfera ha sido suspendida',
    title: 'Cuenta suspendida',
    body: 'Hola {name},<br><br>Nuestro equipo de moderación ha suspendido tu cuenta por incumplir los Términos de Servicio.<br><br>Si crees que es un error, puedes apelar desde la pantalla de inicio de sesión una vez, en los seis meses siguientes. También puedes acudir a un órgano certificado de resolución extrajudicial de litigios o a los tribunales.',
  },
  postRemoved: {
    subject: 'Hemos retirado una publicación tuya',
    title: 'Publicación retirada',
    body: 'Hola {name},<br><br>Nuestro equipo de moderación ha retirado una de tus publicaciones por incumplir las normas de la comunidad.<br><br><strong>Motivo:</strong> {reason}<br><br>Puedes apelar esta decisión una vez, en los seis meses siguientes, desde Ajustes → Apelaciones. También puedes acudir a un órgano certificado de resolución extrajudicial de litigios o a los tribunales.',
    button: 'Leer las normas',
  },
  postsRemoved: {
    subject: 'Hemos retirado {count} publicaciones tuyas',
    title: 'Publicaciones retiradas',
    body: 'Hola {name},<br><br>Nuestro equipo de moderación ha retirado {count} de tus publicaciones por incumplir las normas de la comunidad.<br><br><strong>Motivo:</strong> {reason}<br><br>Puedes apelar cada retirada una vez, en los seis meses siguientes, desde Ajustes → Apelaciones. También puedes acudir a un órgano certificado de resolución extrajudicial de litigios o a los tribunales.',
  },
  appealApproved: {
    subject: 'Tu apelación ha sido aprobada',
    title: 'Apelación aprobada',
    body: 'Hola {name},<br><br>Hemos revisado tu apelación y hemos revertido la decisión.<br><br><strong>Notas:</strong> {notes}',
  },
  appealRejected: {
    subject: 'Hemos revisado tu apelación',
    title: 'Decisión mantenida',
    body: 'Hola {name},<br><br>Hemos revisado tu apelación y la decisión se mantiene.<br><br><strong>Notas:</strong> {notes}<br><br>Cada decisión se puede apelar una vez, así que esta no se puede volver a apelar. Aún puedes acudir a un órgano certificado de resolución extrajudicial de litigios o a los tribunales.',
  },
  appealDefaultNotes:
    'Se ha revisado tu apelación según nuestros Términos de Servicio.',
  moderationReason: 'Incumplimiento de las normas de la comunidad',
  contactSupport: 'Contactar con soporte',
  dataExportReady: {
    subject: 'Tu exportación de datos está lista',
    title: 'Hola {name}',
    body: 'La exportación de tus datos que solicitaste ya se puede descargar. Por seguridad, el enlace caduca en 7 días.',
    button: 'Descargar mis datos',
  },
  supportReply: {
    subject: 'Re: {subject} - Soporte de CircleSfera',
    title: 'Respuesta a tu consulta',
    button: 'Ver tu solicitud',
  },
  supportReminder: {
    subject: '¿Sigues necesitando ayuda? {subject} - Soporte de CircleSfera',
    title: '¿Sigues necesitando ayuda?',
    body: 'Respondimos a tu solicitud n.º {reference}, <strong>{subject}</strong>, y no hemos vuelto a saber de ti.<br><br>Si sigues necesitando ayuda, responde en la solicitud. Si no recibimos respuesta en {days} días, la marcaremos como resuelta.',
    button: 'Ver tu solicitud',
  },
  supportUnmatched: {
    subject:
      'No hemos podido añadir tu correo a una solicitud - Soporte de CircleSfera',
    title: 'Tu correo no ha llegado a ninguna solicitud',
    body: 'Esta dirección solo recibe respuestas a solicitudes de soporte, enviadas desde la dirección que abrió la solicitud.<br><br>Si necesitas ayuda, abre una solicitud desde la página de soporte. Si estabas respondiendo a una, responde desde el correo de tu cuenta o escribe en la propia solicitud.',
    button: 'Ir a soporte',
  },
  subscriptionReceipt: {
    subject: 'Recibo de suscripción - {plan}',
    title: 'Recibo de suscripción',
    body: 'Gracias por suscribirte a CircleSfera.<br><br>Ya tienes el plan <strong>{plan}</strong>.<br>El cargo de <strong>{amount}</strong> se ha procesado y las funciones de tu plan ya están activas.',
    button: 'Gestionar mi plan',
  },
  planCancelled: {
    subject: 'Has cancelado tu plan {plan}',
    title: 'Plan cancelado',
    body: 'Has cancelado el plan <strong>{plan}</strong> de @{username}.<br><br>Mantienes todas las funciones del plan hasta el <strong>{date}</strong>, el final del periodo que ya pagaste. No se te cobrará nada más.<br><br>Si no lo has cancelado tú, escribe a support@circlesfera.com.',
    button: 'Ver mi plan',
  },
  greeting: 'Hola',
  fallbackName: 'Usuario',
};

export const EMAIL_COPY: Record<Locale, EmailCopy> = { en, es };

// Escapes a value from a person before it goes into email HTML.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Fills {placeholders}. Values must already be safe for HTML.
export function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? values[key] : match,
  );
}
