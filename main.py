from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ApplicationBuilder, CommandHandler, CallbackQueryHandler, ContextTypes
import json
import os

# === ТОКЕН БОТА ===
TOKEN = os.getenv("8491825768:AAEMgvXN3kAhEZkancl-ePJ37_wNzjmPXrk")

# === GIF ===
WELCOME_GIF_URL = "https://media1.tenor.com/m/nDG2Tu5MyXEAAAAd/jolly-christmas.gif"

# === АДМИНИСТРАТОРЫ ===
ADMIN_IDS = [1026424566, 6249163361]

# === КАТАЛОГ ТОВАРОВ ===
CATALOG = {
    "category1": [
        {"name": "ТОВАР 1", "description": "Описание товара 1", "price": "Цена: 100 руб."},
        {"name": "ТОВАР 2", "description": "Описание товара 2", "price": "Цена: 200 руб."}
    ],
    "category2": [
        {"name": "ТОВАР 3", "description": "Описание товара 3", "price": "Цена: 300 руб."},
        {"name": "ТОВАР 4", "description": "Описание товара 4", "price": "Цена: 400 руб."}
    ]
}

# === ХРАНЕНИЕ ЗАКАЗОВ ===
ORDERS_FILE = 'orders.json'

def load_orders():
    try:
        with open(ORDERS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return []

def save_orders(orders):
    with open(ORDERS_FILE, 'w', encoding='utf-8') as f:
        json.dump(orders, f, ensure_ascii=False, indent=2)

ORDERS = load_orders()

# === КОМАНДЫ ===

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_animation(
        animation=WELCOME_GIF_URL,
        caption="Привет! Добро пожаловать в магазин.\nВыбери категорию:",
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("Категория 1", callback_data="show_category1")],
            [InlineKeyboardButton("Категория 2", callback_data="show_category2")]
        ])
    )

async def get_id(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    await update.message.reply_text(f"Ваш ID: `{user_id}`", parse_mode='Markdown')

async def admin_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ У вас нет прав администратора.")
        return
    await update.message.reply_text("✅ Добро пожаловать в админ-панель!")

async def orders_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ У вас нет прав администратора.")
        return

    orders = load_orders()
    if not orders:
        await update.message.reply_text("📭 Нет новых заказов.")
        return

    for order in orders:
        message = f"📦 Новый заказ!\n\n{order['items']}\n\n📍 Адрес: {order['address']}\n💰 Итого: {order['total']} руб.\n🕒 Время: {order['timestamp']}"
        await update.message.reply_text(message)

async def show_category(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    category_key = query.data.replace("show_", "")
    if category_key in CATALOG:
        items = CATALOG[category_key]
        for item in items:
            text = f"*{item['name']}*\n{item['description']}\n{item['price']}"
            await query.message.reply_text(text, parse_mode='Markdown')

# === ЗАПУСК ===

if __name__ == '__main__':
    application = ApplicationBuilder().token(TOKEN).build()

    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("id", get_id))
    application.add_handler(CommandHandler("admin", admin_command))
    application.add_handler(CommandHandler("orders", orders_command))
    application.add_handler(CallbackQueryHandler(show_category))

    print("Бот запущен...")
    application.run_polling()
