import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

en_data['auth'] = {
    "login": {
        "title": "CircleSfera",
        "welcome": "Welcome back, creator.",
        "identifier_label": "Email or username",
        "identifier_placeholder": "you@example.com",
        "password_label": "Password",
        "password_placeholder": "••••••••",
        "forgot_password": "Forgot password?",
        "default_error": "Invalid email, username or password",
        "no_identifier": "Please enter your email or username first.",
        "passkey_error": "Authentication failed",
        "sign_in_loading": "Signing in...",
        "sign_in": "Sign In",
        "or": "or",
        "passkey_loading": "Verifying Identity...",
        "passkey_btn": "Sign in with Passkey",
        "no_account": "Don't have an account?",
        "sign_up_link": "Sign up"
    },
    "register": {
        "title": "CircleSfera",
        "subtitle": "Join the inner circle.",
        "email_label": "Email",
        "email_placeholder": "you@example.com",
        "username_label": "Username",
        "username_placeholder": "johndoe",
        "fullname_label": "Full Name",
        "fullname_placeholder": "John Doe",
        "password_label": "Password",
        "password_placeholder": "••••••••",
        "invite_label": "Invite Code",
        "optional": "(optional)",
        "invite_placeholder": "XXXX-XXXX",
        "default_error": "Registration failed. Please try again.",
        "sign_up_loading": "Creating account...",
        "sign_up": "Sign Up",
        "has_account": "Already have an account?",
        "sign_in_link": "Sign in",
        "success": "Account created successfully! Please check your email to verify your account."
    }
}

es_data['auth'] = {
    "login": {
        "title": "CircleSfera",
        "welcome": "Bienvenido de nuevo, creador.",
        "identifier_label": "Email o nombre de usuario",
        "identifier_placeholder": "tu@ejemplo.com",
        "password_label": "Contraseña",
        "password_placeholder": "••••••••",
        "forgot_password": "¿Olvidaste tu contraseña?",
        "default_error": "Email, usuario o contraseña no válidos",
        "no_identifier": "Por favor, introduce tu email o usuario primero.",
        "passkey_error": "Fallo en la autenticación",
        "sign_in_loading": "Iniciando sesión...",
        "sign_in": "Iniciar Sesión",
        "or": "o",
        "passkey_loading": "Verificando Identidad...",
        "passkey_btn": "Iniciar sesión con Passkey",
        "no_account": "¿No tienes una cuenta?",
        "sign_up_link": "Regístrate"
    },
    "register": {
        "title": "CircleSfera",
        "subtitle": "Únete al círculo íntimo.",
        "email_label": "Email",
        "email_placeholder": "tu@ejemplo.com",
        "username_label": "Nombre de usuario",
        "username_placeholder": "johndoe",
        "fullname_label": "Nombre Completo",
        "fullname_placeholder": "John Doe",
        "password_label": "Contraseña",
        "password_placeholder": "••••••••",
        "invite_label": "Código de Invitación",
        "optional": "(opcional)",
        "invite_placeholder": "XXXX-XXXX",
        "default_error": "El registro falló. Por favor, inténtalo de nuevo.",
        "sign_up_loading": "Creando cuenta...",
        "sign_up": "Regístrate",
        "has_account": "¿Ya tienes una cuenta?",
        "sign_in_link": "Iniciar sesión",
        "success": "¡Cuenta creada exitosamente! Por favor, revisa tu email para verificar tu cuenta."
    }
}

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated auth translations.")
