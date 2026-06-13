import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

en_data['createPost']['upload'] = {
    "post": "Post",
    "post_desc": "Share photos & carousels",
    "post_hint": "JPG, PNG, MP4 · Max 100MB",
    "story": "Story",
    "story_desc": "Disappears in 24h",
    "story_hint": "Photo or video · Up to 60s",
    "frame": "Frame",
    "frame_desc": "Short-form video",
    "frame_hint": "MP4, MOV · 15-90 seconds",
    "drop_files": "Drop files here",
    "drag_files": "Drag photos and videos here",
    "select_device": "Select from device",
    "take_photo": "Take a photo",
    "create_text_story": "Create Text Story",
    "create_text_story_desc": "Backgrounds, text & stickers"
}

es_data['createPost']['upload'] = {
    "post": "Post",
    "post_desc": "Comparte fotos y carruseles",
    "post_hint": "JPG, PNG, MP4 · Máx 100MB",
    "story": "Historia",
    "story_desc": "Desaparece en 24h",
    "story_hint": "Foto o video · Hasta 60s",
    "frame": "Frame",
    "frame_desc": "Video corto",
    "frame_hint": "MP4, MOV · 15-90 segundos",
    "drop_files": "Suelta los archivos aquí",
    "drag_files": "Arrastra fotos y videos aquí",
    "select_device": "Seleccionar del dispositivo",
    "take_photo": "Tomar una foto",
    "create_text_story": "Crear Historia de Texto",
    "create_text_story_desc": "Fondos, texto y stickers"
}

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated upload locales.")
