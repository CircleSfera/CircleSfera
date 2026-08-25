/**
 * Email Template System for CircleSfera.
 * Implements a "Zero-UI" premium aesthetic: Pure black backgrounds,
 * subtle borders, and high-contrast typography.
 */

interface EmailLayoutOptions {
  title: string;
  content: string;
  buttonText?: string;
  buttonUrl?: string;
  footerText?: string;
}

function getBaseLayout({
  title,
  content,
  buttonText,
  buttonUrl,
  footerText,
}: EmailLayoutOptions) {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800;900&display=swap');
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #000000;
      color: #FFFFFF;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    
    .wrapper {
      background-color: #000000;
      padding: 60px 20px;
      text-align: center;
    }
    
    .container {
      max-width: 520px;
      margin: 0 auto;
      padding: 48px 40px;
      background-color: #0F0F13;
      border: 1px solid rgba(140, 82, 255, 0.15);
      border-radius: 24px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.6), 0 0 40px rgba(140, 82, 255, 0.08);
    }
    
    .logo {
      font-size: 28px;
      font-weight: 900;
      letter-spacing: -1px;
      margin-bottom: 40px;
      /* Silver metallic gradient with solid fallback */
      color: #E5E5E5;
      background: linear-gradient(180deg, #ffffff 0%, rgba(255, 255, 255, 0.72) 55%, rgba(255, 255, 255, 0.42) 100%);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    
    .content-area {
      text-align: center;
    }
    
    h1 {
      font-size: 28px;
      font-weight: 800;
      margin: 0 0 16px 0;
      color: #FFFFFF;
      letter-spacing: -0.5px;
      line-height: 1.3;
    }
    
    p {
      font-size: 16px;
      line-height: 1.6;
      color: #A0A0AA;
      margin: 0 0 32px 0;
    }
    
    .button {
      display: inline-block;
      background: linear-gradient(90deg, #ff5757 0%, #8c52ff 100%);
      background-color: #8c52ff;
      color: #FFFFFF !important;
      text-decoration: none;
      padding: 16px 36px;
      border-radius: 50px;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.5px;
      margin-bottom: 32px;
      border: none;
    }
    
    .footer {
      margin-top: 48px;
      padding-top: 32px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 13px;
      color: #707070;
      line-height: 1.6;
    }
    
    .footer a {
      color: #8c52ff;
      text-decoration: none;
      font-weight: 600;
    }

    @media (max-width: 600px) {
      .container {
        padding: 40px 24px;
        border-radius: 20px;
      }
      h1 {
        font-size: 24px;
      }
      p {
        font-size: 15px;
      }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="logo">CircleSfera</div>
      <div class="content-area">
        <h1>${title}</h1>
        <p>${content}</p>
        ${buttonText && buttonUrl ? `<a href="${buttonUrl}" class="button">${buttonText}</a>` : ''}
      </div>
      <div class="footer">
        ${footerText || `<p>&copy; ${new Date().getFullYear()} CircleSfera. Todos los derechos reservados.</p><p>Este es un correo automático, por favor no respondas directamente.</p>`}
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

export const EmailTemplates = {
  welcome: (name: string, frontendUrl: string) =>
    getBaseLayout({
      title: `¡Bienvenido, ${name}!`,
      content:
        'Tu acceso exclusivo a CircleSfera ha sido aprobado. Comienza a construir tus conexiones más significativas hoy mismo.',
      buttonText: 'Explorar Círculos',
      buttonUrl: frontendUrl,
    }),

  verification: (url: string) =>
    getBaseLayout({
      title: 'Verifica tu identidad',
      content:
        'Para garantizar la seguridad de tu cuenta y unirte a la comunidad, necesitamos que verifiques tu dirección de correo electrónico.',
      buttonText: 'Verificar Email',
      buttonUrl: url,
      footerText:
        '<p>Si no has solicitado esta cuenta, puedes ignorar este correo de forma segura.</p>',
    }),

  passwordReset: (url: string) =>
    getBaseLayout({
      title: 'Restablecer contraseña',
      content:
        'Hemos recibido una solicitud para restablecer la contraseña de tu cuenta. Si has sido tú, haz clic en el botón de abajo.',
      buttonText: 'Restablecer Ahora',
      buttonUrl: url,
      footerText:
        '<p>Este enlace expirará en 1 hora por motivos de seguridad. Si no has solicitado este cambio, ignora este mensaje.</p>',
    }),

  broadcast: (
    title: string,
    content: string,
    buttonText?: string,
    buttonUrl?: string,
  ) =>
    getBaseLayout({
      title,
      content,
      buttonText,
      buttonUrl,
    }),

  moderationAction: (
    userName: string,
    action: string,
    targetType: string,
    reason: string,
  ) =>
    getBaseLayout({
      title: 'Aviso de Moderación',
      content: `Hola ${userName},<br><br>Tu ${targetType.toLowerCase()} ha sido ${action.toLowerCase()} por nuestro equipo de moderación.<br><br><strong>Motivo:</strong> ${reason}<br><br>Por favor, respeta nuestras normas de la comunidad para evitar la suspensión de tu cuenta.`,
      buttonText: 'Contactar Soporte',
      buttonUrl: 'mailto:support@circlesfera.com',
    }),

  subscriptionReceipt: (
    planName: string,
    amount: string,
    frontendUrl: string,
  ) =>
    getBaseLayout({
      title: 'Recibo de Suscripción',
      content: `Gracias por suscribirte a CircleSfera.<br><br>Has adquirido el plan <strong>${planName}</strong>.<br>El cargo de <strong>${amount}</strong> ha sido procesado con éxito y las funciones de tu plan ya están activas en tu cuenta.`,
      buttonText: 'Ir a mi Panel',
      buttonUrl: `${frontendUrl}/settings/monetization`,
    }),
};
