const { Telegraf } = require('telegraf');
const Markup = require('telegraf/markup');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

const CATALOGS_DIR = path.join(__dirname, 'catalogs');
if (!fs.existsSync(CATALOGS_DIR)) fs.mkdirSync(CATALOGS_DIR);

const ROLES_FILE = path.join(__dirname, 'roles.json');
if (!fs.existsSync(ROLES_FILE)) {
  const roles = {};
  const adminId = process.env.ADMIN_CHAT_ID;
  if (adminId) {
    roles[adminId] = 'superadmin';
  }
  fs.writeFileSync(ROLES_FILE, JSON.stringify(roles, null, 2));
  console.log(`✅ Создан roles.json с superadmin: ${adminId}`);
}

function loadRoles() {
  return JSON.parse(fs.readFileSync(ROLES_FILE, 'utf8'));
}

function saveRoles(roles) {
  fs.writeFileSync(ROLES_FILE, JSON.stringify(roles, null, 2));
}

function getUserRole(userId) {
  const roles = loadRoles();
  return roles[userId] || null;
}

function hasAdminAccess(userId) {
  const role = getUserRole(userId);
  return role === 'admin' || role === 'superadmin';
}

function hasSuperAdminAccess(userId) {
  return getUserRole(userId) === 'superadmin';
}

// === /start ===
bot.start((ctx) => {
  ctx.reply(`Привет! Это магазин.\n\nОткройте Mini App через кнопку ниже:`, {
    reply_markup: {
      inline_keyboard: [[
        { text: '🛒 Открыть магазин', web_app: { url: 'https://cracker228.github.io/' } }
      ]]
    }
  });
});

// === /order ===
bot.command('order', (ctx) => {
  ctx.reply('Заказы отправляются только через Mini App.');
});

bot.on('text', (ctx) => {
  if (ctx.message.text === '/order') {
    ctx.reply('Заказы отправляются только через Mini App.');
  }
});

// === ОТПРАВКА ЗАКАЗА ЧЕРЕЗ WEBHOOK ===
const express = require('express');
const app = express();
app.use(express.json());

app.post('/order', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).send('Сообщение отсутствует');
    
    const roles = loadRoles();
    const adminIds = Object.entries(roles)
      .filter(([_, role]) => role === 'admin' || role === 'superadmin')
      .map(([id]) => id);
    
    if (adminIds.length === 0) return res.status(500).send('Нет админов');
    
    for (const adminId of adminIds) {
      try {
        await bot.telegram.sendMessage(adminId, message);
      } catch (e) {
        console.error('Не удалось отправить заказ админу', adminId, e.message);
      }
    }
    res.status(200).send('OK');
  } catch (e) {
    console.error('Ошибка /order:', e);
    res.status(500).send('Ошибка');
  }
});

// === ПРОКСИ /tg-image/:fileId ===
app.get('/tg-image/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    if (!fileId || fileId.length < 10) return res.status(400).send('Invalid file_id');
    
    const fileLink = await bot.telegram.getFileLink(fileId);
    const imageUrl = fileLink.href;
    
    res.redirect(imageUrl);
  } catch (e) {
    console.error('Ошибка /tg-image:', e.message);
    res.status(500).send('Не удалось получить изображение');
  }
});

// === СЛУЖЕБНЫЕ ЭНДПОИНТЫ КАТАЛОГОВ ===
app.use('/api', express.static(CATALOGS_DIR));

// === ЗАПУСК EXPRESS ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🖥️  Сервер запущен на порту ${PORT}`);
});

// === АДМИНКА ===
const userState = {};

bot.command('admin', (ctx) => {
  if (!hasAdminAccess(ctx.from.id)) {
    return ctx.reply(`🚫 У вас нет доступа. Ваш ID: ${ctx.from.id}`);
  }
  const role = getUserRole(ctx.from.id);
  const kb = [
    ['➕ Добавить товар'],
    ['✏️ Редактировать товар'],
    ['🗑 Удалить']
  ];
  if (role === 'superadmin') {
    kb.push(['👥 Управление ролями']);
  }
  kb.push(['⬅️ Назад']);
  ctx.reply('🔐 Админ-панель:', Markup.keyboard(kb).resize().oneTime());
});

bot.hears('⬅️ Назад', (ctx) => {
  ctx.reply('Главное меню.', Markup.removeKeyboard());
  delete userState[ctx.from.id];
});

// === УПРАВЛЕНИЕ РОЛЯМИ ===
bot.hears('👥 Управление ролями', (ctx) => {
  if (!hasSuperAdminAccess(ctx.from.id)) {
    return ctx.reply('🚫 Доступ запрещён.');
  }
  ctx.reply('Выберите:', Markup.keyboard([
    ['👑 Назначить админа', '🧑‍💼 Назначить курьера'],
    ['⬅️ Назад']
  ]).oneTime());
  userState[ctx.from.id] = { step: 'ROLE_ACTION' };
});

// === ДОБАВЛЕНИЕ ТОВАРА ===
bot.hears('➕ Добавить товар', (ctx) => {
  if (!hasAdminAccess(ctx.from.id)) return;
  userState[ctx.from.id] = { step: 'ADD_CATALOG' };
  ctx.reply('Каталог (1–4):');
});

// === РЕДАКТИРОВАНИЕ ТОВАРА ===
bot.hears('✏️ Редактировать товар', (ctx) => {
  if (!hasAdminAccess(ctx.from.id)) return;
  userState[ctx.from.id] = { step: 'EDIT_CATALOG' };
  ctx.reply('Каталог (1–4):');
});

// === УДАЛЕНИЕ ===
bot.hears('🗑 Удалить', (ctx) => {
  if (!hasAdminAccess(ctx.from.id)) return;
  userState[ctx.from.id] = { step: 'DELETE_TYPE' };
  ctx.reply('Что удалить?', Markup.keyboard([
    ['📦 Товар', '🖌 Вариацию'],
    ['⬅️ Назад']
  ]).oneTime());
});

// === ОБРАБОТКА ТЕКСТА ===
bot.on('text', async (ctx) => {
  const state = userState[ctx.from.id];
  const text = ctx.message.text.trim();
  const userId = ctx.from.id;
  if (!state) return;

  // --- УПРАВЛЕНИЕ РОЛЯМИ ---
  if (state.step === 'ROLE_ACTION') {
    if (text === '👑 Назначить админа') {
      userState[userId] = { step: 'SET_ADMIN_ID' };
      return ctx.reply('ID пользователя:');
    }
    if (text === '🧑‍💼 Назначить курьера') {
      userState[userId] = { step: 'SET_COURIER_ID' };
      return ctx.reply('ID пользователя:');
    }
  }
  if (state.step === 'SET_ADMIN_ID' || state.step === 'SET_COURIER_ID') {
    if (!/^\d+$/.test(text)) {
      return ctx.reply('❌ ID должен быть числом.');
    }
    const roles = loadRoles();
    roles[text] = state.step === 'SET_ADMIN_ID' ? 'admin' : 'courier';
    saveRoles(roles);
    delete userState[userId];
    return ctx.reply('✅ Роль назначена!');
  }

  // --- УДАЛЕНИЕ ---
  if (state.step === 'DELETE_TYPE') {
    if (text === '📦 Товар') {
      userState[userId] = { step: 'DELETE_ITEM_CATALOG' };
      return ctx.reply('Каталог (1–4):');
    } else if (text === '🖌 Вариацию') {
      userState[userId] = { step: 'DELETE_VAR_CATALOG' };
      return ctx.reply('Каталог (1–4):');
    }
  }

  if (state.step === 'DELETE_ITEM_CATALOG') {
    const cat = parseInt(text);
    if (isNaN(cat) || cat < 1 || cat > 4) return ctx.reply('❌ Укажите каталог 1–4');
    const filePath = path.join(CATALOGS_DIR, `catalog${cat}.json`);
    if (!fs.existsSync(filePath)) return ctx.reply('Каталог не существует.');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!data.items?.length) return ctx.reply('Нет товаров.');
    const kb = data.items.map(item => [`🗑 ${item.name}`]);
    kb.push(['⬅️ Назад']);
    userState[userId] = { step: 'DELETE_ITEM_CONFIRM', catalog: cat };
    return ctx.reply('Выберите товар:', Markup.keyboard(kb).oneTime());
  }

  if (state.step === 'DELETE_ITEM_CONFIRM') {
    const itemName = text.replace('🗑 ', '');
    const filePath = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    data.items = data.items.filter(item => item.name !== itemName);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    delete userState[userId];
    ctx.reply('✅ Товар удалён!', Markup.removeKeyboard());
    return;
  }

  if (state.step === 'DELETE_VAR_CATALOG') {
    const cat = parseInt(text);
    if (isNaN(cat) || cat < 1 || cat > 4) return ctx.reply('❌ Укажите каталог 1–4');
    const filePath = path.join(CATALOGS_DIR, `catalog${cat}.json`);
    if (!fs.existsSync(filePath)) return ctx.reply('Каталог не существует.');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let kb = [];
    data.items?.forEach(item => {
      item.subcategories?.forEach(sub => kb.push([`🗑 ${item.name} – ${sub.type}`]));
    });
    if (kb.length === 0) return ctx.reply('Нет вариаций.');
    kb.push(['⬅️ Назад']);
    userState[userId] = { step: 'DELETE_VAR_CONFIRM', catalog: cat };
    return ctx.reply('Выберите вариацию:', Markup.keyboard(kb).oneTime());
  }

  if (state.step === 'DELETE_VAR_CONFIRM') {
    const [itemName, varType] = text.replace('🗑 ', '').split(' – ');
    const filePath = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let found = false;
    data.items = data.items.map(item => {
      if (item.name === itemName) {
        const before = item.subcategories?.length || 0;
        item.subcategories = (item.subcategories || []).filter(s => s.type !== varType);
        if (item.subcategories.length < before) found = true;
      }
      return item;
    });
    if (found) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      delete userState[userId];
      return ctx.reply('✅ Вариация удалена!', Markup.removeKeyboard());
    }
    return ctx.reply('❌ Не найдена.');
  }

  // --- РЕДАКТИРОВАНИЕ ---
  if (state.step === 'EDIT_CATALOG') {
    const cat = parseInt(text);
    if (isNaN(cat) || cat < 1 || cat > 4) return ctx.reply('❌ Укажите каталог 1–4');
    const filePath = path.join(CATALOGS_DIR, `catalog${cat}.json`);
    if (!fs.existsSync(filePath)) return ctx.reply('Каталог не существует.');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!data.items?.length) return ctx.reply('Нет товаров.');
    const kb = data.items.map(item => [`✏️ ${item.name}`]);
    kb.push(['⬅️ Назад']);
    userState[userId] = { step: 'EDIT_ITEM_SELECT', catalog: cat };
    return ctx.reply('Выберите товар:', Markup.keyboard(kb).oneTime());
  }

  if (state.step === 'EDIT_ITEM_SELECT') {
    const itemName = text.replace('✏️ ', '');
    const filePath = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const item = data.items.find(i => i.name === itemName);
    if (!item) return ctx.reply('❌ Товар не найден.');
    userState[userId] = { step: 'EDIT_ITEM_ACTION', catalog: state.catalog, itemName, itemId: item.id };
    return ctx.reply('Что редактировать?', Markup.keyboard([
      ['✏️ Название', '📝 Описание'],
      ['🖼 Изменить фото', '➕ Вариацию'],
      ['✏️ Вариацию', '⬅️ Назад']
    ]).oneTime());
  }

  if (state.step === 'EDIT_ITEM_ACTION') {
    if (text === '✏️ Название') {
      userState[userId] = { ...state, step: 'EDIT_FIELD_INPUT', field: 'name' };
      return ctx.reply('Новое название:');
    }
    if (text === '📝 Описание') {
      userState[userId] = { ...state, step: 'EDIT_FIELD_INPUT', field: 'description' };
      return ctx.reply('Новое описание:');
    }
    if (text === '🖼 Изменить фото') {
      userState[userId] = { ...state, step: 'EDIT_ITEM_PHOTO' };
      return ctx.reply('📸 Отправьте новое фото или напишите "нет":');
    }
    if (text === '➕ Вариацию') {
      userState[userId] = { ...state, step: 'ADD_VAR_TYPE' };
      return ctx.reply('Название вариации:');
    }
    if (text === '✏️ Вариацию') {
      const filePath = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const item = data.items.find(i => i.name === state.itemName);
      if (!item?.subcategories?.length) return ctx.reply('Нет вариаций.');
      const kb = item.subcategories.map(sub => [`✏️ ${sub.type}`]);
      kb.push(['⬅️ Назад']);
      userState[userId] = { ...state, step: 'EDIT_VAR_SELECT' };
      return ctx.reply('Выберите вариацию:', Markup.keyboard(kb).oneTime());
    }
  }

  if (state.step === 'EDIT_FIELD_INPUT') {
    const filePath = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const item = data.items.find(i => i.id === state.itemId);
    if (item) {
      item[state.field] = text;
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      delete userState[userId];
      return ctx.reply('✅ Обновлено!', Markup.removeKeyboard());
    }
    return ctx.reply('❌ Ошибка.');
  }

  if (state.step === 'EDIT_ITEM_PHOTO') {
    if (text.toLowerCase() === 'нет') {
      const filePath = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const item = data.items.find(i => i.id === state.itemId);
      if (item) {
        item.image = null;
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      }
      delete userState[userId];
      return ctx.reply('✅ Фото удалено!', Markup.removeKeyboard());
    }
    // Ожидаем фото — обрабатывается ниже
  }

  if (state.step === 'ADD_VAR_TYPE') {
    userState[userId] = { ...state, step: 'ADD_VAR_PRICE', varType: text };
    return ctx.reply(`Цена для "${text}":`);
  }

  if (state.step === 'ADD_VAR_PRICE') {
    const price = parseFloat(text);
    if (isNaN(price) || price <= 0) return ctx.reply('❌ Укажите корректную цену (>0)');
    userState[userId] = { ...state, step: 'AWAITING_VAR_IMAGE', varPrice: price };
    return ctx.reply('📸 Отправьте фото или напишите "нет":');
  }

  if (state.step === 'AWAITING_VAR_IMAGE' && text.toLowerCase() === 'нет') {
    const filePath = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const item = data.items.find(i => i.id === state.itemId);
    if (item) {
      item.subcategories.push({ type: state.varType, price: state.varPrice, image: null });
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }
    delete userState[userId];
    return ctx.reply('✅ Вариация добавлена!', Markup.removeKeyboard());
  }

  // --- ДОБАВЛЕНИЕ НОВОГО ТОВАРА ---
  if (state.step === 'ADD_CATALOG') {
    const cat = parseInt(text);
    if (isNaN(cat) || cat < 1 || cat > 4) return ctx.reply('❌ Укажите каталог 1–4');
    userState[userId] = { step: 'ADD_NAME', catalog: cat };
    return ctx.reply('Название товара:');
  }

  if (state.step === 'ADD_NAME') {
    userState[userId] = { ...state, step: 'ADD_DESC', name: text };
    return ctx.reply('Описание:');
  }

  if (state.step === 'ADD_DESC') {
    userState[userId] = { ...state, step: 'ADD_TYPE', description: text };
    return ctx.reply('Название первой вариации (тип):');
  }

  if (state.step === 'ADD_TYPE') {
    userState[userId] = { ...state, step: 'ADD_PRICE', currentType: text };
    return ctx.reply(`Цена для "${text}":`);
  }

  if (state.step === 'ADD_PRICE') {
    const price = parseFloat(text);
    if (isNaN(price) || price <= 0) return ctx.reply('❌ Укажите корректную цену (>0)');
    userState[userId] = { ...state, step: 'AWAITING_IMAGE', currentPrice: price };
    return ctx.reply('📸 Отправьте фото или напишите "нет":');
  }

  if (state.step === 'AWAITING_IMAGE' && text.toLowerCase() === 'нет') {
    const variants = state.variants || [];
    variants.push({ type: state.currentType, price: state.currentPrice, image: null });
    userState[userId] = { ...state, variants, step: 'ADD_MORE' };
    return ctx.reply('Добавить ещё вариацию?', Markup.keyboard([['✅ Да', '❌ Нет']]).oneTime());
  }

  if (state.step === 'ADD_MORE') {
    if (text === '✅ Да') {
      userState[userId] = { ...state, step: 'ADD_TYPE' };
      return ctx.reply('Название следующей вариации:');
    } else if (text === '❌ Нет') {
      const filePath = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
      let data = { name: `Каталог ${state.catalog}`, items: [] };
      if (fs.existsSync(filePath)) data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      data.items.push({
        id: Date.now().toString(),
        name: state.name,
        description: state.description,
        subcategories: state.variants || []
      });
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      delete userState[userId];
      return ctx.reply('✅ Товар добавлен!', Markup.removeKeyboard());
    }
  }
});

// === ОБРАБОТКА ФОТО ===
bot.on('photo', async (ctx) => {
  const userId = ctx.from.id;
  const state = userState[userId];
  if (!state || !hasAdminAccess(userId)) return;

  const photo = ctx.message.photo.at(-1);
  const fileId = photo.file_id;

  // --- Для нового товара ---
  if (state.step === 'AWAITING_IMAGE') {
    const variants = state.variants || [];
    variants.push({ type: state.currentType, price: state.currentPrice, image: fileId });
    userState[userId] = { ...state, variants, step: 'ADD_MORE' };
    return ctx.reply('Добавить ещё вариацию?', Markup.keyboard([['✅ Да', '❌ Нет']]).oneTime());
  }

  // --- Для редактирования товара (изменение фото) ---
  if (state.step === 'EDIT_ITEM_PHOTO') {
    const filePath = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const item = data.items.find(i => i.id === state.itemId);
    if (item) {
      item.image = fileId;
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }
    delete userState[userId];
    return ctx.reply('✅ Фото обновлено!', Markup.removeKeyboard());
  }

  // --- Для редактирования вариации ---
  if (state.step === 'AWAITING_VAR_IMAGE') {
    const filePath = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const item = data.items.find(i => i.id === state.itemId);
    if (item) {
      item.subcategories.push({ type: state.varType, price: state.varPrice, image: fileId });
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }
    delete userState[userId];
    return ctx.reply('✅ Вариация с фото добавлена!', Markup.removeKeyboard());
  }

  // --- Для редактирования существующей вариации ---
  if (state.step === 'EDIT_VAR_PHOTO') {
    const filePath = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const item = data.items.find(i => i.id === state.itemId);
    if (item) {
      const sub = item.subcategories.find(s => s.type === state.varType);
      if (sub) {
        sub.image = fileId;
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      }
    }
    delete userState[userId];
    return ctx.reply('✅ Фото вариации обновлено!', Markup.removeKeyboard());
  }
});

// === ЗАПУСК БОТА ===
bot.launch();
console.log('🤖 Бот запущен.');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
