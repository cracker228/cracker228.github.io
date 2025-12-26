require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors'); // ДОБАВЬ ЭТУ ЗАВИСИМОСТЬ
const fs = require('fs');

/* ================== CONFIG ================== */
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_CHAT_ID);
const PORT = process.env.PORT || 3000;
const BACKEND_URL = process.env.BACKEND_URL || 'https://cracker228-github-io.onrender.com'; // Укажи свой Render URL

if (!BOT_TOKEN || !ADMIN_ID) {
  console.error('❌ BOT_TOKEN или ADMIN_CHAT_ID отсутствует');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();

// ДОБАВЬ ЭТИ СТРОКИ ДЛЯ CORS И JSON
app.use(cors());
app.use(express.json());

/* ===== GITHUB CONFIG ===== */
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_OWNER || !GITHUB_REPO || !GITHUB_TOKEN) {
  console.error('❌ Отсутствуют GITHUB_OWNER, GITHUB_REPO или GITHUB_TOKEN');
  process.exit(1);
}

// Кэш админов в памяти
let adminCache = [ADMIN_ID];
let adminsSha = null;

const state = {};

/* ===== GITHUB API HELPERS (ИСПРАВЛЕНО) ===== */

async function fetchFile(filePath) {
  // ✅ ИСПРАВЛЕНО: убраны лишние пробелы в URL
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;
  const headers = { 
    Authorization: `Bearer ${GITHUB_TOKEN}`, 
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'TelegramBot'
  };
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error(`❌ Ошибка GitHub API (${res.status}):`, await res.text());
      return { sha: null, content: null };
    }
    const data = await res.json();
    return { sha: data.sha, content: Buffer.from(data.content, 'base64').toString('utf8') };
  } catch (error) {
    console.error('❌ Ошибка fetchFile:', error);
    return { sha: null, content: null };
  }
}

async function saveFile(filePath, data, sha = null) {
  // ✅ ИСПРАВЛЕНО: убраны лишние пробелы в URL
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;
  const body = {
    message: `Update ${filePath} via bot`,
    content: Buffer.from(JSON.stringify(data, null, 2), 'utf8').toString('base64'),
    branch: GITHUB_BRANCH,
  };
  if (sha) body.sha = sha;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'TelegramBot'
  };
  
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });
    
    if (!res.ok) {
      console.error(`❌ Ошибка сохранения файла (${res.status}):`, await res.text());
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('❌ Ошибка saveFile:', error);
    return false;
  }
}

// Загрузка админов с GitHub
async function loadAdminsFromGithub() {
  const { sha, content } = await fetchFile('admins.json');
  if (content) {
    try {
      const list = JSON.parse(content);
      if (Array.isArray(list)) {
        adminCache = [...new Set([...list, ADMIN_ID].map(id => Number(id)))];
        adminsSha = sha;
        console.log('✅ Админы загружены:', adminCache);
        return;
      }
    } catch (error) {
      console.error('❌ Ошибка парсинга admins.json:', error);
    }
  }
  // Создаём файл, если нет
  console.log('📝 Создаём admins.json');
  await saveFile('admins.json', [ADMIN_ID], sha);
  adminCache = [ADMIN_ID];
  adminsSha = null;
}

function isAdmin(id) {
  return adminCache.includes(Number(id));
}

// Каталоги
async function loadCatalog(catalogId) {
  const { sha, content } = await fetchFile(`catalogs/catalog${catalogId}.json`);
  if (content) {
    try {
      return { sha, catalog: JSON.parse(content) };
    } catch (error) {
      console.error(`❌ Ошибка парсинга catalog${catalogId}.json:`, error);
    }
  }
  return { 
    sha: null, 
    catalog: { 
      name: `Каталог ${catalogId}`, 
      items: [] 
    } 
  };
}

async function saveCatalog(catalogId, data, sha) {
  return await saveFile(`catalogs/catalog${catalogId}.json`, data, sha);
}

/* ================== ЗАГРУЗКА ПРИ СТАРТЕ ================== */

(async () => {
  await loadAdminsFromGithub();
})();

/* ================== ЭНДПОИНТ ЗАКАЗОВ (ИЗ СТАРОГО БОТА) ================== */

app.post('/order', async (req, res) => {
  try {
    const { message, items, contact, address, total, userId } = req.body;
    
    if (!message || !items || !contact || !address) {
      return res.status(400).json({ error: 'Отсутствуют обязательные поля' });
    }

    // Формируем сообщение для админов
    let orderMessage = `📦 <b>НОВЫЙ ЗАКАЗ</b>\n`;
    orderMessage += `👤 <b>Покупатель:</b> ID ${userId}\n\n`;
    
    // Добавляем товары из корзины
    orderMessage += `<b>Состав заказа:</b>\n`;
    items.forEach((item, index) => {
      orderMessage += `${index + 1}. ${item.name}`;
      if (item.variant) orderMessage += ` - ${item.variant}`;
      orderMessage += ` — ${item.price} ₽\n`;
    });
    
    // Добавляем общую сумму
    orderMessage += `\n<b>Итого:</b> ${total} ₽\n`;
    
    // Добавляем контактные данные
    orderMessage += `\n📞 <b>Телефон:</b> ${contact}`;
    orderMessage += `\n🏠 <b>Адрес:</b> ${address}`;
    
    // Отправляем заказ всем админам
    let successCount = 0;
    for (const adminId of adminCache) {
      try {
        await bot.telegram.sendMessage(adminId, orderMessage, {
          parse_mode: 'HTML'
        });
        successCount++;
      } catch (error) {
        console.error(`❌ Не удалось отправить заказ админу ${adminId}:`, error);
      }
    }

    if (successCount === 0) {
      throw new Error('Не удалось отправить заказ ни одному админу');
    }

    // Ответ клиенту
    res.json({ success: true, message: 'Заказ успешно оформлен!' });
    
    console.log(`✅ Заказ от пользователя ${userId} успешно обработан`);
    
  } catch (error) {
    console.error('❌ Ошибка обработки заказа:', error);
    
    // Отправляем админам уведомление об ошибке
    try {
      const adminError = `🚨 <b>Ошибка оформления заказа</b>\n\n` +
                         `Ошибка: ${error.message || 'Неизвестная ошибка'}\n` +
                         `Данные: ${JSON.stringify(req.body, null, 2)}`;
      
      for (const adminId of adminCache) {
        await bot.telegram.sendMessage(adminId, adminError, { parse_mode: 'HTML' });
      }
    } catch (e) {
      console.error('Не удалось отправить уведомление об ошибке админам:', e);
    }
    
    res.status(500).json({ error: 'Ошибка обработки заказа' });
  }
});

/* ================== ДРУГИЕ ЭНДПОИНТЫ ================== */

app.get('/tg-image/:id', async (req, res) => {
  try {
    const link = await bot.telegram.getFileLink(req.params.id);
    res.redirect(link.href);
  } catch (error) {
    console.error('❌ Ошибка получения изображения:', error);
    res.sendStatus(404);
  }
});

app.get('/', (_, res) => res.send('OK'));

/* ================== КОМАНДЫ ================== */

bot.start((ctx) => {
  delete state[ctx.from.id];
  // ✅ ИСПРАВЛЕНО: убраны лишние пробелы в URL
  const webAppUrl = 'https://cracker228.github.io/';
  ctx.reply(
    '👋 Добро пожаловать в магазин!\nНажмите кнопку ниже, чтобы открыть каталог.',
    Markup.keyboard([
      Markup.button.webApp('🛍 Открыть магазин', webAppUrl)
    ]).resize()
  );
});

bot.command('admin', ctx => {
  if (!isAdmin(ctx.from.id)) return ctx.reply('⛔ Нет доступа');
  delete state[ctx.from.id];
  ctx.reply(
    '⚙️ Админка',
    Markup.keyboard([
      ['➕ Добавить товар'],
      ['🗑 Удалить товар'],
      ['✏️ Переименовать каталог'],
      ['👮 Добавить админа'],
      ['⬅️ Выход']
    ]).resize()
  );
});

/* ================== КНОПКИ ================== */

bot.hears('⬅️ Выход', ctx => {
  delete state[ctx.from.id];
  ctx.reply('Ок', Markup.removeKeyboard());
});

bot.hears('➕ Добавить товар', ctx => {
  if (!isAdmin(ctx.from.id)) return;
  state[ctx.from.id] = { step: 'ADD_CAT', vars: [] };
  ctx.reply('Номер каталога (1–4):');
});

bot.hears('🗑 Удалить товар', ctx => {
  if (!isAdmin(ctx.from.id)) return;
  state[ctx.from.id] = { step: 'DEL_CAT' };
  ctx.reply('Номер каталога (1–4):');
});

bot.hears('✏️ Переименовать каталог', ctx => {
  if (!isAdmin(ctx.from.id)) return;
  state[ctx.from.id] = { step: 'REN_CAT' };
  ctx.reply('Номер каталога (1–4):');
});

bot.hears('👮 Добавить админа', ctx => {
  if (!isAdmin(ctx.from.id)) return;
  state[ctx.from.id] = { step: 'ADD_ADMIN' };
  ctx.reply('Введите ID нового админа (число):');
});

/* ================== ТЕКСТ ================== */

bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;

  const userId = ctx.from.id;
  const s = state[userId];
  
  // Обработка причины отклонения заказа
  if (s && s.step === 'REJECT_REASON') {
    try {
      const reason = ctx.message.text;
      const userId = s.userId;
      
      // Отправляем уведомление пользователю
      await bot.telegram.sendMessage(userId, 
        '❌ Ваш заказ отклонен.\n\n' +
        `Причина: ${reason}\n\n` +
        'Пожалуйста, свяжитесь с администратором для уточнения деталей.'
      );
      
      // Редактируем сообщение для админа
      await bot.telegram.editMessageText(
        s.originalMessage.chat.id,
        s.originalMessage.message_id,
        null,
        s.originalMessage.text + `\n\n❌ <b>Заказ отклонен</b>\n` +
        `Причина: ${reason}`,
        { 
          parse_mode: 'HTML', 
          reply_markup: { inline_keyboard: [] } 
        }
      );
      
      await ctx.reply('✅ Заказ успешно отклонен и пользователь уведомлен.');
      
      // Очищаем состояние
      delete state[ctx.from.id];
      
      console.log(`❌ Заказ ${s.orderId} для пользователя ${userId} отклонен. Причина: ${reason}`);
    } catch (error) {
      console.error('Ошибка отклонения заказа:', error);
      await ctx.reply('❌ Произошла ошибка при отклонении заказа.');
      delete state[ctx.from.id];
    }
    return;
  }
  
  if (!s || !isAdmin(userId)) {
    delete state[userId];
    return;
  }

  const t = ctx.message.text;

  // === ДОБАВЛЕНИЕ АДМИНА ===
  if (s.step === 'ADD_ADMIN') {
    const newId = Number(t);
    if (isNaN(newId) || newId <= 0) {
      return ctx.reply('❌ ID должен быть положительным числом');
    }
    if (adminCache.includes(newId)) {
      delete state[userId];
      return ctx.reply('✅ Этот пользователь уже админ');
    }

    const updated = [...new Set([...adminCache, newId])];
    const saveList = updated.includes(ADMIN_ID) ? updated : [ADMIN_ID, ...updated];
    const ok = await saveFile('admins.json', saveList, adminsSha);
    if (ok) {
      adminCache = saveList.map(id => Number(id));
      const { sha } = await fetchFile('admins.json');
      adminsSha = sha;
      delete state[userId];
      ctx.reply(`✅ Пользователь ${newId} добавлен в админы`, Markup.removeKeyboard());
    } else {
      ctx.reply('❌ Не удалось сохранить на GitHub');
    }
    return;
  }

  // === ОСТАЛЬНЫЕ ШАГИ ===
  switch (s.step) {
    case 'ADD_CAT':
      s.catalog = Number(t);
      if (isNaN(s.catalog) || s.catalog < 1 || s.catalog > 4) {
        return ctx.reply('❌ Номер каталога должен быть от 1 до 4');
      }
      s.vars = [];
      s.step = 'ADD_NAME';
      return ctx.reply('Название товара:');

    case 'ADD_NAME':
      s.name = t;
      s.step = 'ADD_DESC';
      return ctx.reply('Описание товара:');

    case 'ADD_DESC':
      s.desc = t;
      s.step = 'ADD_IMAGE';
      return ctx.reply('📸 Фото товара:');

    case 'ADD_VAR_TYPE':
      s.varType = t;
      s.step = 'ADD_VAR_PRICE';
      return ctx.reply('Цена вариации:');

    case 'ADD_VAR_PRICE':
      s.varPrice = Number(t);
      if (isNaN(s.varPrice)) return ctx.reply('❌ Введите число');
      s.step = 'ADD_VAR_IMAGE';
      return ctx.reply('📸 Фото вариации:');

    case 'ADD_MORE':
      if (t === '➕ Добавить ещё') {
        s.step = 'ADD_VAR_TYPE';
        return ctx.reply('Тип вариации:');
      }

      const catData = await loadCatalog(s.catalog);
      catData.catalog.items.push({
        id: Date.now().toString(),
        name: s.name,
        description: s.desc,
        image: s.image,
        subcategories: s.vars,
      });
      if (await saveCatalog(s.catalog, catData.catalog, catData.sha)) {
        delete state[userId];
        ctx.reply('✅ Товар добавлен', Markup.removeKeyboard());
      } else {
        ctx.reply('❌ Ошибка сохранения');
      }
      return;

    case 'DEL_CAT':
      s.catalog = Number(t);
      if (isNaN(s.catalog) || s.catalog < 1 || s.catalog > 4) {
        return ctx.reply('❌ Номер каталога должен быть от 1 до 4');
      }
      const dc = await loadCatalog(s.catalog);
      if (!dc.catalog.items.length) {
        delete state[userId];
        return ctx.reply('❌ Каталог пуст', Markup.removeKeyboard());
      }
      s.step = 'DEL_ITEM';
      return ctx.reply(
        'Выберите товар:',
        Markup.keyboard(dc.catalog.items.map(i => [i.name])).resize()
      );

    case 'DEL_ITEM':
      const dcat = await loadCatalog(s.catalog);
      dcat.catalog.items = dcat.catalog.items.filter(i => i.name !== t);
      if (await saveCatalog(s.catalog, dcat.catalog, dcat.sha)) {
        delete state[userId];
        ctx.reply('🗑 Товар удалён', Markup.removeKeyboard());
      } else {
        ctx.reply('❌ Ошибка удаления');
      }
      return;

    case 'REN_CAT':
      s.catalog = Number(t);
      if (isNaN(s.catalog) || s.catalog < 1 || s.catalog > 4) {
        return ctx.reply('❌ Номер каталога должен быть от 1 до 4');
      }
      s.step = 'REN_NAME';
      return ctx.reply('Новое название каталога:');

    case 'REN_NAME':
      const rcat = await loadCatalog(s.catalog);
      rcat.catalog.name = t;
      if (await saveCatalog(s.catalog, rcat.catalog, rcat.sha)) {
        delete state[userId];
        ctx.reply('✅ Каталог переименован', Markup.removeKeyboard());
      } else {
        ctx.reply('❌ Ошибка переименования');
      }
      return;

    default:
      delete state[userId];
  }
});

/* ================== ФОТО ================== */

bot.on('photo', async (ctx) => {
  const s = state[ctx.from.id];
  if (!s || !isAdmin(ctx.from.id)) return;

  const fileId = ctx.message.photo.at(-1).file_id;

  if (s.step === 'ADD_IMAGE') {
    s.image = fileId;
    s.step = 'ADD_VAR_TYPE';
    return ctx.reply('Тип вариации:');
  }

  if (s.step === 'ADD_VAR_IMAGE') {
    s.vars.push({ type: s.varType, price: s.varPrice, image: fileId });
    s.step = 'ADD_MORE';
    return ctx.reply(
      'Добавить ещё вариацию?',
      Markup.keyboard([['➕ Добавить ещё'], ['✅ Завершить']]).resize()
    );
  }
});

/* ================== ЗАПУСК ================== */

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 HTTP сервер запущен на порту ${PORT}`);
  console.log(`📦 Эндпоинт заказов: POST ${BACKEND_URL}/order`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

(async () => {
  await bot.telegram.deleteWebhook({ drop_pending_updates: true });
  await bot.launch();
  console.log('🤖 Telegram-бот запущен');
  console.log('👥 Админы:', adminCache);
})();
