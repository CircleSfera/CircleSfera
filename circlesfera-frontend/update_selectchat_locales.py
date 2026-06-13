import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

chat_en = en_data.get('chat', {})
chat_en.update({
    "your_messages": "Your Messages",
    "select_chat_desc": "Select a chat from the list on the left or start a new conversation to send messages and photos."
})
en_data['chat'] = chat_en

chat_es = es_data.get('chat', {})
chat_es.update({
    "your_messages": "Tus Mensajes",
    "select_chat_desc": "Selecciona un chat en la lista de la izquierda o empieza una nueva conversación para enviar mensajes y fotos."
})
es_data['chat'] = chat_es

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated select chat locales.")
