from telegram import Update, WebAppInfo
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes
import os

TOKEN_SHOP = os.getenv("8433153883:AAFHZSGxBs9yaUoWWQbcqJeyCBtL4KwUOxM")  # Токен бота магазина
URL_MINI_APP = "cracker228githubio-site.up.railway.app"  # Заменить на URL мини-приложения

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "Добро пожаловать в магазин!",
        reply_markup=ReplyKeyboardMarkup(
            [[KeyboardButton("Открыть магазин", web_app=WebAppInfo(url=URL_MINI_APP))]],
            resize_keyboard=True
        )
    )

if __name__ == '__main__':
    app = ApplicationBuilder().token(TOKEN_SHOP).build()
    app.add_handler(CommandHandler("start", start))
    app.run_polling()
