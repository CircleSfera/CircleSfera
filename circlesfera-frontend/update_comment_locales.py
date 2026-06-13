import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

en_data['comments'] = {
    "unlike": "Unlike",
    "like": "Like",
    "reply": "Reply",
    "delete": "Delete",
    "likes_count": "{{count}} like",
    "likes_count_plural": "{{count}} likes",
    "no_comments": "No comments yet. Be the first to comment!",
    "replying_to": "Replying to",
    "add_comment": "Add a comment...",
    "reply_to_user": "Reply to @{{username}}...",
    "post": "Post",
    "delete_title": "Delete Comment",
    "delete_warning": "Are you sure you want to delete this comment? This action cannot be undone."
}

es_data['comments'] = {
    "unlike": "Ya no me gusta",
    "like": "Me gusta",
    "reply": "Responder",
    "delete": "Eliminar",
    "likes_count": "{{count}} me gusta",
    "likes_count_plural": "{{count}} me gusta",
    "no_comments": "Aún no hay comentarios. ¡Sé el primero en comentar!",
    "replying_to": "Respondiendo a",
    "add_comment": "Añadir un comentario...",
    "reply_to_user": "Responder a @{{username}}...",
    "post": "Publicar",
    "delete_title": "Eliminar Comentario",
    "delete_warning": "¿Estás seguro de que quieres eliminar este comentario? Esta acción no se puede deshacer."
}

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated comment locales.")
