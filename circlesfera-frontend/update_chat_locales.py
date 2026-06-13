import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

en_data['chat'] = {
    "loading": "Loading chats...",
    "messages": "Messages",
    "search": "Search messages...",
    "no_messages": "No messages yet",
    "start_connecting": "Start connecting with your friends.",
    "send_message": "Send Message",
    "you": "You:",
    "draft": "Draft",
    "media_attachment": "Media Attachment",
    "started_chat": "Started a chat",
    "sent_voice": "Sent a voice message",
    "sent_image": "Sent an image",
    "sent_attachment": "Sent an attachment"
}

es_data['chat'] = {
    "loading": "Cargando chats...",
    "messages": "Mensajes",
    "search": "Buscar mensajes...",
    "no_messages": "Aún no hay mensajes",
    "start_connecting": "Empieza a conectar con tus amigos.",
    "send_message": "Enviar Mensaje",
    "you": "Tú:",
    "draft": "Borrador",
    "media_attachment": "Archivo adjunto",
    "started_chat": "Inició una conversación",
    "sent_voice": "Envió un mensaje de voz",
    "sent_image": "Envió una imagen",
    "sent_attachment": "Envió un archivo adjunto"
}

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated chat locales.")
