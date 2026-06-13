import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

wallet_en = en_data.get('wallet', {})
wallet_en.update({
    "bought_tokens": "Bought {{amount}} tokens!",
    "error_buy_tokens": "Error buying tokens",
    "available_balance": "Available Balance",
    "tokens": "Tokens",
    "amount_placeholder": "Amount...",
    "buy": "Buy",
    "earnings_withdrawable": "Earnings (Withdrawable)",
    "request_withdrawal": "Request Withdrawal",
    "transaction_history": "Transaction History",
    "no_transactions": "No recent transactions"
})
en_data['wallet'] = wallet_en

wallet_es = es_data.get('wallet', {})
wallet_es.update({
    "bought_tokens": "¡Compraste {{amount}} tokens!",
    "error_buy_tokens": "Error al comprar tokens",
    "available_balance": "Saldo Disponible",
    "tokens": "Tokens",
    "amount_placeholder": "Cantidad...",
    "buy": "Comprar",
    "earnings_withdrawable": "Ganancias (Retirables)",
    "request_withdrawal": "Solicitar Retiro",
    "transaction_history": "Historial de Transacciones",
    "no_transactions": "No hay transacciones recientes"
})
es_data['wallet'] = wallet_es

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated wallet locales.")
