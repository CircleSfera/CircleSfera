import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

en_data['report'] = {
    "title": "Report",
    "success": "Thanks for reporting. We'll review your report shortly.",
    "why_report": "Why are you reporting this {{targetType}}?",
    "additional_details": "Additional Details (Optional)",
    "placeholder": "Tell us more...",
    "submitting": "Submitting...",
    "submit": "Submit Report",
    "reasons": {
        "spam": "It's spam",
        "harassment": "Harassment or bullying",
        "inappropriate": "Inappropriate content",
        "other": "Something else"
    }
}

es_data['report'] = {
    "title": "Reportar",
    "success": "Gracias por reportar. Revisaremos tu reporte en breve.",
    "why_report": "¿Por qué estás reportando este {{targetType}}?",
    "additional_details": "Detalles adicionales (Opcional)",
    "placeholder": "Cuéntanos más...",
    "submitting": "Enviando...",
    "submit": "Enviar Reporte",
    "reasons": {
        "spam": "Es spam",
        "harassment": "Acoso o intimidación",
        "inappropriate": "Contenido inapropiado",
        "other": "Otra cosa"
    }
}

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated report locales.")
