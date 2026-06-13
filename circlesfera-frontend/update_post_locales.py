import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

en_data['post'] = {
    "detail": {
        "back_to_feed": "Back to feed",
        "comments": "Comments"
    },
    "tag_feed": {
        "discover": "Discover posts related to this tag",
        "no_posts": "No posts found for"
    },
    "actions": {
        "comments": "Comments",
        "share": "Share post",
        "tip": "Give tip",
        "remove_bookmark": "Remove from saved",
        "add_bookmark": "Save post"
    },
    "content": {
        "likes": "likes",
        "view_all_comments": "View all {{count}} comments"
    },
    "header": {
        "promoted": "Promoted"
    },
    "media": {
        "unlock_success": "Post successfully unlocked!",
        "unlock_error": "Error unlocking post"
    },
    "menu": {
        "edit": "Edit",
        "delete": "Delete",
        "report": "Report",
        "save": "Save to Collection"
    },
    "modals": {
        "delete_title": "Delete Post?",
        "delete_warning": "This action cannot be undone.",
        "cancel": "Cancel",
        "delete": "Delete",
        "deleting": "Deleting...",
        "edit_title": "Edit Caption",
        "write_caption": "Write a caption...",
        "save": "Save",
        "saving": "Saving..."
    }
}

es_data['post'] = {
    "detail": {
        "back_to_feed": "Volver al inicio",
        "comments": "Comentarios"
    },
    "tag_feed": {
        "discover": "Descubre publicaciones relacionadas con esta etiqueta",
        "no_posts": "No se encontraron publicaciones para"
    },
    "actions": {
        "comments": "Comentarios",
        "share": "Compartir publicación",
        "tip": "Dar propina",
        "remove_bookmark": "Quitar de guardados",
        "add_bookmark": "Guardar publicación"
    },
    "content": {
        "likes": "Me gusta",
        "view_all_comments": "Ver los {{count}} comentarios"
    },
    "header": {
        "promoted": "Publicidad"
    },
    "media": {
        "unlock_success": "¡Publicación desbloqueada con éxito!",
        "unlock_error": "Error al desbloquear la publicación"
    },
    "menu": {
        "edit": "Editar",
        "delete": "Eliminar",
        "report": "Reportar",
        "save": "Guardar en la Colección"
    },
    "modals": {
        "delete_title": "¿Eliminar publicación?",
        "delete_warning": "Esta acción no se puede deshacer.",
        "cancel": "Cancelar",
        "delete": "Eliminar",
        "deleting": "Eliminando...",
        "edit_title": "Editar Descripción",
        "write_caption": "Escribe una descripción...",
        "save": "Guardar",
        "saving": "Guardando..."
    }
}

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated post locales.")
