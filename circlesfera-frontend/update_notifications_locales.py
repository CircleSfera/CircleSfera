import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

en_data['notifications'] = {
    "seo_title": "Notifications",
    "title": "Activity",
    "no_activity": "No activity yet",
    "unknown_user": "Unknown",
    "types": {
        "like": "liked your post.",
        "comment_like": "liked your comment.",
        "follow": "started following you.",
        "comment": "commented on your post.",
        "mention": "mentioned you in a comment.",
        "follow_request": "requested to follow you.",
        "follow_accepted": "accepted your follow request.",
        "moderation": "Moderation update: {{content}}",
        "promotion_success": "Promotion Approved! {{content}}",
        "promotion_rejected": "Promotion Rejected. {{content}}"
    }
}

es_data['notifications'] = {
    "seo_title": "Notificaciones",
    "title": "Actividad",
    "no_activity": "No hay actividad aún",
    "unknown_user": "Desconocido",
    "types": {
        "like": "le ha gustado tu publicación.",
        "comment_like": "le ha gustado tu comentario.",
        "follow": "ha comenzado a seguirte.",
        "comment": "ha comentado en tu publicación.",
        "mention": "te ha mencionado en un comentario.",
        "follow_request": "ha solicitado seguirte.",
        "follow_accepted": "ha aceptado tu solicitud de seguimiento.",
        "moderation": "Actualización de moderación: {{content}}",
        "promotion_success": "¡Promoción Aprobada! {{content}}",
        "promotion_rejected": "Promoción Rechazada. {{content}}"
    }
}

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated notifications locales.")
