require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const fs = require('fs'); // нужен для локального кэша (опционально)

/* ================== CONFIG ================== */
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_CHAT_ID);
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN || !ADMIN_ID) {
  console.error('❌ BOT_TOKEN или ADMIN_CHAT_ID отсутствует');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();

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

/* ===== GITHUB API HELPERS ===== */

async function fetchFile(filePath) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;
  const headers = { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' };
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return { sha: null, content: null };
    const data = await res.json();
    return { sha: data.sha, content: Buffer.from(data.content, 'base64').toString('utf8') };
  } catch {
    return { sha: null, content: null };
  }
}

async function saveFile(filePath, data, sha = null) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;
  const body = {
    message: `Update ${filePath} via bot`,
    content: Buffer.from(JSON.stringify(data, null, 2), 'utf8').toString('base64'),
    branch: GITHUB_BRANCH,
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return res.ok;
}

// Загрузка админов с GitHub
async function loadAdminsFromGithub() {
  const { sha, content } = await fetchFile('admins.json');
  if (content) {
    try {
      const list = JSON.parse(content);
      if (Array.isArray(list)) {
        adminCache = [...new Set([...list, ADMIN_ID])];
        adminsSha = sha;
        return;
      }
    } catch {
      // ignore
    }
  }
  // Создаём файл, если нет
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
    } catch {
      // ignore
    }
  }
  return { sha: null, catalog: { name: `Каталог ${catalogId}`, items: [] } };
}

async function saveCatalog(catalogId, data, sha) {
  return await saveFile(`catalogs/catalog${catalogId}.json`, data, sha);
}

/* ================== КОМАНДЫ ================== */

bot.start(ctx => {
  delete state[ctx.from.id];
  ctx.reply(
    '👋 Добро пожаловать в магазин!\nНажмите кнопку ниже, чтобы открыть каталог.',
    Markup.keyboard([
      Markup.button.webApp('🛍 Открыть магазин', 'https://cracker228.github.io/')
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
      adminCache = saveList;
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

/* ================== ЭНДПОИНТЫ ================== */

app.get('/tg-image/:id', async (req, res) => {
  try {
    const link = await bot.telegram.getFileLink(req.params.id);
    res.redirect(link.href);
  } catch {
    res.sendStatus(404);
  }
});

app.get('/', (_, res) => res.send('OK'));

/* ================== ОБРАБОТКА ЗАКАЗОВ ИЗ WEBAPP ================== */

bot.on('web_app_data', async (ctx) => {
  try {
    // Получаем необработанные данные
    const rawData = ctx.payload;
    
    // ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА: если пришли некорректные данные
    if (!rawData || rawData === "undefined" || rawData.trim() === "undefined") {
      throw new Error('Получены некорректные данные заказа');
    }
    
    // Пытаемся распарсить JSON
    let order;
    try {
      order = JSON.parse(rawData);
    } catch (parseError) {
      console.error('❌ Ошибка парсинга JSON:', rawData);
      throw new Error('Неверный формат данных заказа');
    }
    
    // Проверяем минимальную структуру заказа
    if (!order.items || !Array.isArray(order.items) || order.items.length === 0) {
      throw new Error('Пустой заказ или отсутствуют товары');
    }
    
    // Информация о пользователе
    const userId = ctx.from.id;
    const userName = ctx.from.username 
      ? `@${ctx.from.username}` 
      : `${ctx.from.first_name} ${ctx.from.last_name || ''}`;
    
    // Формируем сообщение для админов
    let orderMessage = `📦 <b>НОВЫЙ ЗАКАЗ</b>\n`;
    orderMessage += `👤 <b>Покупатель:</b> ${userName} (ID: ${userId})\n\n`;
    
    // Добавляем товары из корзины
    orderMessage += `<b>Состав заказа:</b>\n`;
    order.items.forEach((item, index) => {
      orderMessage += `${index + 1}. ${item.name || 'Без названия'}`;
      if (item.variant) orderMessage += ` - ${item.variant}`;
      orderMessage += ` — ${item.price || 0} ₽\n`;
    });
    
    // Добавляем общую сумму
    const total = order.total || order.items.reduce((sum, item) => sum + (item.price || 0), 0);
    orderMessage += `\n<b>Итого:</b> ${total} ₽\n`;
    
    // Добавляем контактные данные
    if (order.contact) orderMessage += `\n📞 <b>Телефон:</b> ${order.contact}`;
    if (order.address) orderMessage += `\n🏠 <b>Адрес:</b> ${order.address || 'не указан'}`;
    
    // Кнопки для админов
    const adminButtons = Markup.inlineKeyboard([
      [Markup.button.callback('✅ Подтвердить заказ', `confirm_${userId}_${Date.now()}`)],
      [Markup.button.callback('❌ Отклонить заказ', `reject_${userId}_${Date.now()}`)]
    ]);

    // Отправляем заказ всем админам
    const failedAdmins = [];
    let successCount = 0;
    for (const adminId of adminCache) {
      try {
        await bot.telegram.sendMessage(adminId, orderMessage, {
          parse_mode: 'HTML',
          reply_markup: adminButtons
        });
        successCount++;
      } catch (error) {
        console.error(`Не удалось отправить заказ админу ${adminId}:`, error);
        failedAdmins.push(adminId);
      }
    }

    // Если ни одному админу не удалось отправить - ошибка
    if (successCount === 0) {
      throw new Error(`Не удалось отправить заказ ни одному админу (${failedAdmins.join(', ')})`);
    }

    // Подтверждение для пользователя
    let userMessage = '✅ <b>Ваш заказ успешно оформлен!</b>\n\n';
    userMessage += `Сумма заказа: ${total} ₽\n`;
    userMessage += 'Администратор скоро свяжется с вами для подтверждения заказа.';
    
    await ctx.replyWithHTML(userMessage);
    
    // Логируем успешный заказ
    console.log(`✅ Заказ от пользователя ${userId} успешно обработан`);
    
  } catch (error) {
    console.error('❌ Ошибка обработки заказа:', error);
    
    // Логируем полученные данные для отладки
    console.log('Полученные данные:', ctx.payload);
    
    // Отправляем пользователю сообщение об ошибке
    await ctx.replyWithHTML(
      '❌ <b>Произошла ошибка при оформлении заказа.</b>\n' +
      'Пожалуйста, попробуйте еще раз или свяжитесь с администратором.'
    );
    
    // Отправляем админам уведомление об ошибке
    try {
      const adminError = `🚨 <b>Ошибка оформления заказа</b>\n\n` +
                         `Пользователь: ${ctx.from.id}\n` +
                         `Ошибка: ${error.message || 'Неизвестная ошибка'}\n` +
                         `Данные: ${ctx.payload?.substring(0, 200) || 'нет данных'}`;
      
      for (const adminId of adminCache) {
        await bot.telegram.sendMessage(adminId, adminError, { parse_mode: 'HTML' });
      }
    } catch (e) {
      console.error('Не удалось отправить уведомление об ошибке админам:', e);
    }
  }
});

/* ================== ОБРАБОТКА КНОПОК АДМИНОВ ================== */

// Обработка подтверждения заказа
bot.action(/^confirm_(\d+)_(\d+)$/, async (ctx) => {
  const [, userId, orderId] = ctx.match;
  
  try {
    // Отправляем уведомление пользователю
    await bot.telegram.sendMessage(userId, 
      '✅ Ваш заказ подтвержден!\n\n' +
      'Администратор скоро свяжется с вами для уточнения деталей доставки.'
    );
    
    // Редактируем сообщение для админа
    await ctx.editMessageText(
      ctx.message.text + '\n\n✅ <b>Заказ подтвержден</b>',
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } }
    );
    
    await ctx.answerCbQuery('Заказ успешно подтвержден!');
    
    console.log(`✅ Заказ ${orderId} для пользователя ${userId} подтвержден`);
  } catch (error) {
    console.error('Ошибка подтверждения заказа:', error);
    await ctx.answerCbQuery('Ошибка подтверждения заказа', true);
  }
});

// Обработка отклонения заказа
bot.action(/^reject_(\d+)_(\d+)$/, async (ctx) => {
  const [, userId, orderId] = ctx.match;
  
  try {
    await ctx.answerCbQuery('Причина отклонения:', { 
      prompt: 'Введите причину отклонения заказа:' 
    });
    
    // Сохраняем состояние для обработки причины
    state[ctx.from.id] = {
      step: 'REJECT_REASON',
      userId: userId,
      orderId: orderId,
      originalMessage: ctx.message
    };
  } catch (error) {
    console.error('Ошибка запроса причины отклонения:', error);
    await ctx.answerCbQuery('Ошибка обработки', true);
  }
});

// Обработка текста с причиной отклонения
bot.on('text', async (ctx) => {
  const s = state[ctx.from.id];
  if (!s || s.step !== 'REJECT_REASON') return;
  
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
    await ctx.telegram.editMessageText(
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
});

/* ================== ЗАПУСК ================== */

app.listen(PORT, () => {
  console.log(`🌐 HTTP сервер запущен на порту ${PORT}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

(async () => {
  await loadAdminsFromGithub();
  await bot.telegram.deleteWebhook();
  await bot.launch();
  console.log('🤖 Telegram-бот запущен');
})();
