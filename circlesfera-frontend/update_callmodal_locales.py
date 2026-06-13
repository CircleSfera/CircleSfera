import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

chat_en = en_data.get('chat', {})
chat_en.update({
    "incoming_video_call": "Incoming video call...",
    "incoming_audio_call": "Incoming audio call...",
    "decline": "Decline",
    "accept": "Accept"
})
en_data['chat'] = chat_en

chat_es = es_data.get('chat', {})
chat_es.update({
    "incoming_video_call": "Llamada de video entrante...",
    "incoming_audio_call": "Llamada de audio entrante...",
    "decline": "Rechazar",
    "accept": "Aceptar"
})
es_data['chat'] = chat_es

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated call modal locales.")
