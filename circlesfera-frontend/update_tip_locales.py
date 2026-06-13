import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

wallet_en = en_data.get('wallet', {})
wallet_en.update({
    "sent_tip": "Sent {{amount}} tokens to {{name}}!",
    "error_send_tip": "Error sending tip",
    "send_gift": "Send Gift",
    "support_with_tokens": "Support {{name}} with tokens",
    "send_tip": "Send Tip",
    "processing": "Processing..."
})
en_data['wallet'] = wallet_en

wallet_es = es_data.get('wallet', {})
wallet_es.update({
    "sent_tip": "Enviado {{amount}} tokens a {{name}}!",
    "error_send_tip": "Error al enviar propina",
    "send_gift": "Enviar Regalo",
    "support_with_tokens": "Apoya a {{name}} con tokens",
    "send_tip": "Enviar Propina",
    "processing": "Procesando..."
})
es_data['wallet'] = wallet_es

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated tip locales.")
