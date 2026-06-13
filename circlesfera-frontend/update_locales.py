import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

en_data['settings']['notifications_tab'] = {
    "title": "Push Notifications",
    "subtitle": "Stay Connected",
    "native_alerts": "Native Alerts",
    "native_alerts_desc": "Get real-time updates for likes, comments, and messages even when you're not on the site.",
    "blocked": "Notifications are blocked in your browser settings.",
    "browser_capability": "Browser Capability",
    "status": "Status",
    "pwa_support": "PWA Support",
    "enabled": "ENABLED",
    "not_supported": "NOT SUPPORTED"
}

es_data['settings']['notifications_tab'] = {
    "title": "Notificaciones Push",
    "subtitle": "Mantente conectado",
    "native_alerts": "Alertas Nativas",
    "native_alerts_desc": "Recibe actualizaciones en tiempo real de likes, comentarios y mensajes incluso cuando no estás en la web.",
    "blocked": "Las notificaciones están bloqueadas en tu navegador.",
    "browser_capability": "Capacidad del Navegador",
    "status": "Estado",
    "pwa_support": "Soporte PWA",
    "enabled": "ACTIVADO",
    "not_supported": "NO SOPORTADO"
}

en_data['settings']['close_friends_modal'] = {
    "title": "Close Friends",
    "search": "Search...",
    "loading": "Loading...",
    "searching": "Searching...",
    "no_users": "No users found",
    "list_title": "Close Friends List",
    "list_desc": "We don't send notifications when you edit your close friends list.",
    "done": "Done"
}

es_data['settings']['close_friends_modal'] = {
    "title": "Mejores Amigos",
    "search": "Buscar...",
    "loading": "Cargando...",
    "searching": "Buscando...",
    "no_users": "No se encontraron usuarios",
    "list_title": "Lista de Mejores Amigos",
    "list_desc": "No enviamos notificaciones cuando editas tu lista de mejores amigos.",
    "done": "Hecho"
}

en_data['settings']['passkey_settings'] = {
    "title": "Security Keys (Passkeys)",
    "subtitle": "Passwordless, ultra-secure login",
    "desc": "Passkeys allow you to log in securely using your device's biometric sensors (like Touch ID or Face ID) or hardware security keys.",
    "registered": "Registered Keys",
    "passkey": "Passkey",
    "added": "Added",
    "remove": "Remove passkey",
    "success": "Passkey registered successfully!",
    "initializing": "Initializing Secure Handshake...",
    "add_new": "Add New Security Key",
    "fido": "FIDO2 / WebAuthn Certified Protection"
}

es_data['settings']['passkey_settings'] = {
    "title": "Llaves de Seguridad (Passkeys)",
    "subtitle": "Inicio de sesión sin contraseñas y ultra-seguro",
    "desc": "Las Passkeys te permiten iniciar sesión de forma segura utilizando los sensores biométricos de tu dispositivo (como Touch ID o Face ID) o llaves de seguridad físicas.",
    "registered": "Llaves Registradas",
    "passkey": "Passkey",
    "added": "Añadido",
    "remove": "Eliminar passkey",
    "success": "¡Passkey registrada con éxito!",
    "initializing": "Inicializando conexión segura...",
    "add_new": "Añadir Nueva Llave de Seguridad",
    "fido": "Protección Certificada FIDO2 / WebAuthn"
}

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated settings translations.")
