import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

en_data['profile'] = {
    "tabs": {
        "posts": "POSTS",
        "frames": "FRAMES",
        "saved": "SAVED",
        "tagged": "TAGGED"
    },
    "stats": {
        "posts": "Posts",
        "followers": "Followers",
        "following": "Following"
    },
    "actions": {
        "edit_profile": "Edit Profile",
        "message": "Message",
        "opening": "Opening...",
        "subscribe": "Subscribe",
        "report_profile": "Report Profile",
        "block_user": "Block User",
        "send_tip": "Send Tip",
        "copy_link": "Copy Link",
        "new_collection": "New Collection"
    },
    "blocked": {
        "title": "You have blocked this user.",
        "subtitle": "Unblock them in Settings to see their profile."
    },
    "invite": {
        "title": "Your Invite Code",
        "copied": "Invite link copied!"
    },
    "private": {
        "title": "This Account is Private",
        "subtitle": "Follow this account to see their photos and videos."
    },
    "saved": {
        "all_posts": "All Posts",
        "collections": "Collections",
        "no_posts_yet": "No posts yet",
        "save_to_see": "Save posts to this collection to see them here.",
        "save": "Save",
        "save_desc": "Save photos and videos that you want to see again."
    },
    "empty": {
        "share_photos": "Share Photos",
        "share_desc": "When you share photos, they will appear on your profile.",
        "no_posts_yet": "No Posts Yet",
        "frames": "Frames",
        "frames_desc": "Share short looping videos.",
        "tagged_you": "Photos of you",
        "tagged_them": "Photos of {{username}}",
        "tagged_desc_you": "When people tag you in photos, they'll appear here.",
        "tagged_desc_them": "When people tag them in photos, they'll appear here."
    },
    "messages": {
        "subscribed_success": "Successfully subscribed!",
        "subscribe_error": "Error subscribing",
        "chat_error": "Could not open chat"
    }
}

es_data['profile'] = {
    "tabs": {
        "posts": "PUBLICACIONES",
        "frames": "FRAMES",
        "saved": "GUARDADO",
        "tagged": "ETIQUETADO"
    },
    "stats": {
        "posts": "Publicaciones",
        "followers": "Seguidores",
        "following": "Siguiendo"
    },
    "actions": {
        "edit_profile": "Editar Perfil",
        "message": "Mensaje",
        "opening": "Abriendo...",
        "subscribe": "Suscribirse",
        "report_profile": "Reportar Perfil",
        "block_user": "Bloquear Usuario",
        "send_tip": "Enviar Propina",
        "copy_link": "Copiar Enlace",
        "new_collection": "Nueva Colección"
    },
    "blocked": {
        "title": "Has bloqueado a este usuario.",
        "subtitle": "Desbloquéalo en Configuración para ver su perfil."
    },
    "invite": {
        "title": "Tu Código de Invitación",
        "copied": "¡Enlace de invitación copiado!"
    },
    "private": {
        "title": "Esta cuenta es privada",
        "subtitle": "Sigue esta cuenta para ver sus fotos y videos."
    },
    "saved": {
        "all_posts": "Todas",
        "collections": "Colecciones",
        "no_posts_yet": "Aún no hay publicaciones",
        "save_to_see": "Guarda publicaciones en esta colección para verlas aquí.",
        "save": "Guardar",
        "save_desc": "Guarda fotos y videos que quieras volver a ver."
    },
    "empty": {
        "share_photos": "Comparte Fotos",
        "share_desc": "Cuando compartas fotos, aparecerán en tu perfil.",
        "no_posts_yet": "Aún no hay publicaciones",
        "frames": "Frames",
        "frames_desc": "Comparte videos cortos en bucle.",
        "tagged_you": "Fotos tuyas",
        "tagged_them": "Fotos de {{username}}",
        "tagged_desc_you": "Cuando la gente te etiquete en fotos, aparecerán aquí.",
        "tagged_desc_them": "Cuando la gente los etiquete en fotos, aparecerán aquí."
    },
    "messages": {
        "subscribed_success": "¡Suscrito con éxito!",
        "subscribe_error": "Error al suscribirse",
        "chat_error": "No se pudo abrir el chat"
    }
}

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated profile locales.")
