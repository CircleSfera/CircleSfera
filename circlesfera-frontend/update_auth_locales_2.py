import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

en_data['auth']['verify'] = {
    "no_token": "Verification token not found.",
    "success": "Your email has been successfully verified.",
    "error": "Failed to verify email.",
    "loading_title": "Verifying Identity",
    "loading_desc": "Please wait while we validate your secure token...",
    "success_title": "Access Granted",
    "success_desc": "You will be redirected to the login page momentarily...",
    "error_title": "Verification Failed",
    "error_desc": "Please request a new verification link."
}

en_data['auth']['forgot_password'] = {
    "default_error": "Something went wrong. Please try again.",
    "success_title": "Email Sent",
    "success_desc1": "If there is an account associated with",
    "success_desc2": ", you will receive a password reset link shortly.",
    "back_to_login": "Back to Login",
    "back": "Back",
    "title": "Forgot your password?",
    "subtitle": "Enter your email address and we will send you a link to get back into your account.",
    "email_label": "Email",
    "email_placeholder": "you@email.com",
    "submit_loading": "Sending...",
    "submit": "Send Access Link"
}

en_data['auth']['reset_password'] = {
    "error_mismatch": "Passwords do not match",
    "error_token": "Invalid or expired token",
    "default_error": "Failed to reset password.",
    "success_title": "Password Updated",
    "success_desc": "Your password has been changed successfully. You can now log in with your new credentials.",
    "redirecting": "Redirecting...",
    "title": "New Password",
    "subtitle": "Create a new password for your CircleSfera account.",
    "new_password": "New Password",
    "confirm_password": "Confirm Password",
    "submit_loading": "Updating...",
    "submit": "Change Password",
    "cancel": "Cancel and back to login"
}

es_data['auth']['verify'] = {
    "no_token": "Token de verificación no encontrado.",
    "success": "Tu email ha sido verificado con éxito.",
    "error": "Fallo al verificar el email.",
    "loading_title": "Verificando Identidad",
    "loading_desc": "Por favor, espera mientras validamos tu token seguro...",
    "success_title": "Acceso Concedido",
    "success_desc": "Serás redirigido a la página de inicio de sesión en un momento...",
    "error_title": "Verificación Fallida",
    "error_desc": "Por favor, solicita un nuevo enlace de verificación."
}

es_data['auth']['forgot_password'] = {
    "default_error": "Algo salió mal. Inténtalo de nuevo.",
    "success_title": "Email Enviado",
    "success_desc1": "Si existe una cuenta asociada a",
    "success_desc2": ", recibirás un enlace para restablecer tu contraseña en unos minutos.",
    "back_to_login": "Volver al Login",
    "back": "Volver",
    "title": "¿Olvidaste tu contraseña?",
    "subtitle": "Introduce tu correo electrónico y te enviaremos un enlace para que vuelvas a entrar en tu cuenta.",
    "email_label": "Email",
    "email_placeholder": "tu@email.com",
    "submit_loading": "Enviando...",
    "submit": "Enviar enlace de acceso"
}

es_data['auth']['reset_password'] = {
    "error_mismatch": "Las contraseñas no coinciden",
    "error_token": "Token inválido o expirado",
    "default_error": "Error al restablecer la contraseña.",
    "success_title": "Contraseña Actualizada",
    "success_desc": "Tu contraseña ha sido cambiada con éxito. Ya puedes iniciar sesión con tus nuevas credenciales.",
    "redirecting": "Redirigiendo...",
    "title": "Nueva Contraseña",
    "subtitle": "Crea una nueva contraseña para tu cuenta de CircleSfera.",
    "new_password": "Nueva Contraseña",
    "confirm_password": "Confirmar Contraseña",
    "submit_loading": "Actualizando...",
    "submit": "Cambiar Contraseña",
    "cancel": "Cancelar y volver al login"
}

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated auth translations 2.")
