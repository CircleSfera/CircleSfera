import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

nav_en = en_data.get('nav', {})
nav_en.update({
    "home": "Home",
    "search": "Search",
    "explore": "Explore",
    "frames": "Frames",
    "create": "Create",
    "messages": "Messages",
    "notifications": "Notifications",
    "saved": "Saved",
    "creator_studio": "Creator Studio",
    "profile": "Profile",
    "premium": "Premium",
    "settings": "Settings",
    "log_out": "Log out"
})
en_data['nav'] = nav_en

nav_es = es_data.get('nav', {})
nav_es.update({
    "home": "Inicio",
    "search": "Buscar",
    "explore": "Explorar",
    "frames": "Frames",
    "create": "Crear",
    "messages": "Mensajes",
    "notifications": "Notificaciones",
    "saved": "Guardados",
    "creator_studio": "Panel de Creador",
    "profile": "Perfil",
    "premium": "Premium",
    "settings": "Configuración",
    "log_out": "Cerrar sesión"
})
es_data['nav'] = nav_es

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated nav locales.")
