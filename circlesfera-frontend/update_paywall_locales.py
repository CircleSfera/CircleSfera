import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

wallet_en = en_data.get('wallet', {})
wallet_en.update({
    "exclusive_content": "Exclusive Content",
    "premium_description": "This post is premium. Unlock it with tokens or subscribe to the creator to view their content.",
    "unlocking": "Unlocking...",
    "unlock_for": "Unlock for {{price}} Tokens"
})
en_data['wallet'] = wallet_en

wallet_es = es_data.get('wallet', {})
wallet_es.update({
    "exclusive_content": "Contenido Exclusivo",
    "premium_description": "Este post es premium. Desbloquéalo con tokens o suscríbete al creador para ver su contenido.",
    "unlocking": "Desbloqueando...",
    "unlock_for": "Desbloquear por {{price}} Tokens"
})
es_data['wallet'] = wallet_es

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated paywall locales.")
