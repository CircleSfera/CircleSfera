import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

chat_en = en_data.get('chat', {})
chat_en.update({
    "chat": "Chat",
    "group_chat": "Group Chat",
    "user": "User",
    "members": "{{count}} members",
    "typing": "Typing",
    "is_typing": "{{username}} is typing...",
    "people_typing": "{{count}} people are typing...",
    "active_now": "Active now",
    "active_mins_ago": "Active {{mins}}m ago",
    "active_hours_ago": "Active {{hours}}h ago",
    "active_recently": "Active recently",
    "loading_history": "Loading history...",
    "say_hello": "Say hello!",
    "uploading_attachment": "Uploading attachment...",
    "replying_to": "Replying to {{username}}",
    "attachment": "Attachment",
    "type_message": "Type a message...",
    "delete_chat_title": "Delete Conversation?",
    "delete_chat_desc": "Are you sure you want to delete this chat? This action cannot be undone and the conversation will be removed for everyone.",
    "cancel": "Cancel",
    "delete": "Delete"
})
en_data['chat'] = chat_en

chat_es = es_data.get('chat', {})
chat_es.update({
    "chat": "Chat",
    "group_chat": "Chat de Grupo",
    "user": "Usuario",
    "members": "{{count}} miembros",
    "typing": "Escribiendo",
    "is_typing": "{{username}} está escribiendo...",
    "people_typing": "{{count}} personas están escribiendo...",
    "active_now": "Activo ahora",
    "active_mins_ago": "Activo hace {{mins}}m",
    "active_hours_ago": "Activo hace {{hours}}h",
    "active_recently": "Activo recientemente",
    "loading_history": "Cargando historial...",
    "say_hello": "¡Di hola!",
    "uploading_attachment": "Subiendo archivo adjunto...",
    "replying_to": "Respondiendo a {{username}}",
    "attachment": "Archivo adjunto",
    "type_message": "Mensaje...",
    "delete_chat_title": "¿Eliminar Conversación?",
    "delete_chat_desc": "¿Estás seguro de que quieres eliminar este chat? Esta acción no se puede deshacer y la conversación se eliminará para todos.",
    "cancel": "Cancelar",
    "delete": "Eliminar"
})
es_data['chat'] = chat_es

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated chat window locales.")
