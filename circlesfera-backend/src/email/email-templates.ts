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
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
    
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
      padding: 40px;
      background-color: #050505;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 24px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.4);
    }
    
    .logo {
      font-size: 28px;
      font-weight: 900;
      color: #FFFFFF;
      letter-spacing: -1.5px;
      margin-bottom: 48px;
      text-transform: none;
    }
    
    .content-area {
      text-align: center;
    }
    
    h1 {
      font-size: 32px;
      font-weight: 900;
      margin: 0 0 24px 0;
      color: #FFFFFF;
      letter-spacing: -1px;
      line-height: 1.2;
    }
    
    p {
      font-size: 16px;
      line-height: 1.6;
      color: #A0A0A0;
      margin: 0 0 32px 0;
    }
    
    .button {
      display: inline-block;
      background-color: #FFFFFF;
      color: #000000 !important;
      text-decoration: none;
      padding: 18px 36px;
      border-radius: 50px;
      font-size: 14px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 1px;
      transition: transform 0.2s ease;
      margin-bottom: 32px;
    }
    
    .footer {
      margin-top: 48px;
      padding-top: 32px;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 12px;
      color: #404040;
      line-height: 1.5;
    }
    
    .footer a {
      color: #606060;
      text-decoration: underline;
    }

    @media (max-width: 600px) {
      .container {
        padding: 30px 20px;
      }
      h1 {
        font-size: 26px;
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
  welcome: (name: string) =>
    getBaseLayout({
      title: `¡Bienvenido, ${name}!`,
      content:
        'Tu acceso exclusivo a CircleSfera ha sido aprobado. Comienza a construir tus conexiones más significativas hoy mismo.',
      buttonText: 'Explorar Círculos',
      buttonUrl: 'https://circlesfera.com',
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
};
