import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

chat_en = en_data.get('chat', {})
chat_en.update({
    "replying_to_user": "Replying to {{username}}",
    "post": "Post",
    "replied_to_story": "Replied to your story",
    "watch_video_again": "Watch video again",
    "view_original_story": "View original story"
})
en_data['chat'] = chat_en

chat_es = es_data.get('chat', {})
chat_es.update({
    "replying_to_user": "Respondiendo a {{username}}",
    "post": "Publicación",
    "replied_to_story": "Respondió a tu historia",
    "watch_video_again": "Mira el video de nuevo",
    "view_original_story": "Ver historia original"
})
es_data['chat'] = chat_es

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated msg bubble locales.")
