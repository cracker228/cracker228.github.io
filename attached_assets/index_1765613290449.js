const { Telegraf } = require('telegraf');

const BOT_TOKEN = '8433153883:AAFhiWaF4lhdZnmTZOLLQwW9vDF5suHL_Ns';
const ADMIN_CHAT_ID = 123456789; // ваш ID или ID админа

const bot = new Telegraf(BOT_TOKEN);

bot.start(async (ctx) => {
  const payload = ctx.startPayload; // то, что после /start
  if (payload && payload.startsWith('order_')) {
    const encoded = payload.slice(6);
    try {
      const message = decodeURIComponent(Buffer.from(encoded, 'base64').toString('utf8'));
      await ctx.reply('✅ Заказ получен! Ожидайте подтверждения.');
      await bot.telegram.sendMessage(ADMIN_CHAT_ID, `📦 НОВЫЙ ЗАКАЗ:\n\n${message}`);
    } catch (e) {
      await ctx.reply('❌ Ошибка обработки заказа.');
    }
  } else {
    // Кнопка открытия Mini App
    await ctx.reply('Добро пожаловать в магазин!', {
      reply_markup: {
        inline_keyboard: [[
          { text: '🛍️ Открыть магазин', web_app: { url: 'https://ваш-юзернейм.github.io' } }
        ]]
      }
    });
  }
});

bot.launch();
console.log('Бот запущен');