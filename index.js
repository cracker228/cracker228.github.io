require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// === НАСТРОЙКИ ===
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = parseInt(process.env.ADMIN_CHAT_ID, 10);
const RAILWAY_URL = 'https://cracker228githubio-site.up.railway.app'; // ← УБРАНЫ ПРОБЕЛЫ!

const bot = new Telegraf(BOT_TOKEN);
const app = express();

// === EXPRESS ===
app.use(cors());
app.use(express.json());
app.use('/api', express.static('api'));
app.use('/images', express.static('images'));

const CATALOGS_DIR = path.join(__dirname, 'api');
const IMAGES_DIR = path.join(__dirname, 'images');
const ROLES_FILE = path.join(__dirname, 'roles.json');

if (!fs.existsSync(CATALOGS_DIR)) fs.mkdirSync(CATALOGS_DIR);
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR);

// === УПРАВЛЕНИЕ РОЛЯМИ ===
function loadRoles() {
  if (!fs.existsSync(ROLES_FILE)) {
    const roles = {};
    roles[ADMIN_CHAT_ID] = 'superadmin';
    fs.writeFileSync(ROLES_FILE, JSON.stringify(roles, null, 2));
  }
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
  return role === 'superadmin' || role === 'admin';
}

function hasSuperAdminAccess(userId) {
  return getUserRole(userId) === 'superadmin';
}

function getAllCourierIds() {
  const roles = loadRoles();
  return Object.keys(roles).filter(id => roles[id] === 'courier');
}

// === ЭНДПОИНТЫ ===
app.post('/order', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Поле message обязательно' });

    const roles = loadRoles();
    const adminIds = Object.keys(roles).filter(id => roles[id] === 'superadmin' || roles[id] === 'admin');
    const courierIds = getAllCourierIds();

    await bot.telegram.sendMessage(ADMIN_CHAT_ID, `📦 НОВЫЙ ЗАКАЗ:\n\n${message}`);
    for (const id of adminIds) {
      if (id != ADMIN_CHAT_ID) {
        await bot.telegram.sendMessage(id, `📦 НОВЫЙ ЗАКАЗ:\n\n${message}`);
      }
    }
    for (const cid of courierIds) {
      await bot.telegram.sendMessage(cid, `🚚 Новый заказ!\n\n${message}`);
    }

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка отправки' });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'Bot is running' });
});

// === СОСТОЯНИЕ ===
const userState = {};

// === /start ===
bot.start(async (ctx) => {
  const payload = ctx.startPayload;
  if (payload?.startsWith('order_')) {
    try {
      const msg = decodeURIComponent(Buffer.from(payload.slice(6), 'base64').toString('utf8'));
      await ctx.reply('✅ Заказ получен!');

      const roles = loadRoles();
      const adminIds = Object.keys(roles).filter(id => roles[id] === 'superadmin' || roles[id] === 'admin');
      const courierIds = getAllCourierIds();

      await bot.telegram.sendMessage(ADMIN_CHAT_ID, `📦 НОВЫЙ ЗАКАЗ:\n\n${msg}`);
      for (const id of adminIds) {
        if (id != ADMIN_CHAT_ID) {
          await bot.telegram.sendMessage(id, `📦 НОВЫЙ ЗАКАЗ:\n\n${msg}`);
        }
      }
      for (const cid of courierIds) {
        await bot.telegram.sendMessage(cid, `🚚 Новый заказ!\n\n${msg}`);
      }
    } catch (e) {
      await ctx.reply('❌ Ошибка обработки заказа.');
    }
  } else {
    await ctx.reply('Добро пожаловать!', {
      reply_markup: {
        inline_keyboard: [[
          { text: '🛍️ Открыть магазин', web_app: { url: 'https://cracker228.github.io' } } // ← УБРАНЫ ПРОБЕЛЫ!
        ]]
      }
    });
  }
});

// === /admin ===
bot.command('admin', (ctx) => {
  if (!hasAdminAccess(ctx.from.id)) {
    return ctx.reply('🚫 У вас нет доступа к админ-панели.');
  }
  const role = getUserRole(ctx.from.id);
  const kb = [
    ['➕ Добавить товар'],
    ['✏️ Редактировать товар'],
    ['🗑 Удалить']
  ];
  if (role === 'superadmin') {
    kb.push(['👥 Управление ролями']);
    kb.push(['✏️ Переименовать каталог']);
  }
  kb.push(['⬅️ Назад']);
  ctx.reply('🔐 Админ-панель:', Markup.keyboard(kb).resize().oneTime());
});

bot.hears('⬅️ Назад', (ctx) => {
  const role = getUserRole(ctx.from.id);
  if (!role) return ctx.reply('Неизвестная команда.');
  ctx.reply('Главное меню.', Markup.removeKeyboard());
});

// === УПРАВЛЕНИЕ РОЛЯМИ ===
bot.hears('👥 Управление ролями', (ctx) => {
  if (!hasSuperAdminAccess(ctx.from.id)) return;
  ctx.reply('Выберите:', Markup.keyboard([
    ['👑 Суперадмин', '🧑 Админ', '🧑‍💼 Курьер'],
    ['⬅️ Назад']
  ]).oneTime());
  userState[ctx.from.id] = { step: 'ROLE_ACTION' };
});

// === ПЕРЕИМЕНОВАТЬ КАТАЛОГ ===
bot.hears('✏️ Переименовать каталог', (ctx) => {
  if (!hasSuperAdminAccess(ctx.from.id)) return;
  userState[ctx.from.id] = { step: 'RENAME_CATALOG_SELECT' };
  ctx.reply('Каталог (1–4):');
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

  // --- УПРАВЛЕНИЕ РОЛЯМИ ---
  if (state?.step === 'ROLE_ACTION') {
    let roleToSet = null;
    if (text === '👑 Суперадмин') roleToSet = 'superadmin';
    else if (text === '🧑 Админ') roleToSet = 'admin';
    else if (text === '🧑‍💼 Курьер') roleToSet = 'courier';
    
    if (roleToSet) {
      userState[userId] = { step: 'SET_ROLE_ID', role: roleToSet };
      ctx.reply('Введите ID пользователя:');
      return;
    }
  }

  if (state?.step === 'SET_ROLE_ID') {
    if (!/^\d+$/.test(text)) return ctx.reply('❌ ID должен быть числом.');
    const roles = loadRoles();
    roles[text] = state.role;
    saveRoles(roles);
    delete userState[userId];
    ctx.reply(`✅ Пользователь назначен как ${state.role}!`);
    return;
  }

  // --- ПЕРЕИМЕНОВАНИЕ КАТАЛОГА ---
  if (state?.step === 'RENAME_CATALOG_SELECT') {
    const cat = parseInt(text);
    if (isNaN(cat) || cat < 1 || cat > 4) return ctx.reply('❌ 1–4');
    const filePath = path.join(CATALOGS_DIR, `catalog${cat}.json`);
    if (!fs.existsSync(filePath)) return ctx.reply('Каталог пуст.');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    userState[userId] = { step: 'RENAME_CATALOG_INPUT', catalog: cat };
    ctx.reply(`Текущее название: ${data.name}\nВведите новое:`);
    return;
  }

  if (state?.step === 'RENAME_CATALOG_INPUT') {
    const filePath = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
    try {
      let data = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : { items: [] };
      data.name = text;
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      delete userState[userId];
      ctx.reply('✅ Каталог переименован!', Markup.removeKeyboard());
    } catch (e) {
      console.error('Ошибка записи catalog.json:', e);
      ctx.reply('❌ Не удалось переименовать. Проверьте файл.');
    }
    return;
  }

  // --- ДОБАВЛЕНИЕ ТОВАРА ---
  if (state?.step === 'ADD_CATALOG') {
    const cat = parseInt(text);
    if (isNaN(cat) || cat < 1 || cat > 4) return ctx.reply('❌ 1–4');
    userState[userId] = { step: 'ADD_NAME', catalog: cat };
    ctx.reply('Название:');
    return;
  }

  if (state?.step === 'ADD_NAME') {
    userState[userId] = { ...state, step: 'ADD_DESC', name: text };
    ctx.reply('Описание:');
    return;
  }

  if (state?.step === 'ADD_DESC') {
    userState[userId] = { ...state, step: 'ADD_TYPE', description: text };
    ctx.reply('Вариация (тип):');
    return;
  }

  if (state?.step === 'ADD_TYPE') {
    userState[userId] = { ...state, step: 'ADD_PRICE', currentType: text };
    ctx.reply(`Цена для "${text}":`);
    return;
  }

  if (state?.step === 'ADD_PRICE') {
    const price = parseFloat(text);
    if (isNaN(price) || price <= 0) return ctx.reply('❌ Цена > 0');
    userState[userId] = { ...state, step: 'AWAITING_IMAGE', currentPrice: price };
    ctx.reply('📸 Фото или "нет":');
    return;
  }

  if (state?.step === 'AWAITING_IMAGE' && text.toLowerCase() === 'нет') {
    const variants = state.variants || [];
    variants.push({ type: state.currentType, price: state.currentPrice, image: null });
    userState[userId] = { ...state, variants, step: 'ADD_MORE' };
    ctx.reply('Ещё?', Markup.keyboard([['✅ Да', '❌ Нет']]).oneTime());
    return;
  }

  if (state?.step === 'AWAITING_IMAGE') {
    const variants = state.variants || [];
    variants.push({ type: state.currentType, price: state.currentPrice, image: text });
    userState[userId] = { ...state, variants, step: 'ADD_MORE' };
    ctx.reply('Ещё?', Markup.keyboard([['✅ Да', '❌ Нет']]).oneTime());
    return;
  }

  if (state?.step === 'ADD_MORE') {
    if (text === '✅ Да') {
      userState[userId] = { ...state, step: 'ADD_TYPE' };
      ctx.reply('Вариация (тип):');
      return;
    } else if (text === '❌ Нет') {
      const filePath = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
      let data = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : { items: [] };
      data.name = data.name || `Каталог ${state.catalog}`;
      data.items.push({
        id: Date.now().toString(),
        name: state.name,
        description: state.description,
        subcategories: state.variants || []
      });
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      delete userState[userId];
      ctx.reply('✅ Товар добавлен!', Markup.removeKeyboard());
      return;
    }
  }

  // --- РЕДАКТИРОВАНИЕ ТОВАРА ---
  if (state?.step === 'EDIT_CATALOG') {
    const cat = parseInt(text);
    if (isNaN(cat) || cat < 1 || cat > 4) return ctx.reply('❌ 1–4');
    const filePath = path.join(CATALOGS_DIR, `catalog${cat}.json`);
    if (!fs.existsSync(filePath)) return ctx.reply('Каталог пуст.');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!data.items?.length) return ctx.reply('Нет товаров.');
    let kb = data.items.map(item => [`✏️ ${item.name}`]);
    kb.push(['⬅️ Назад']);
    userState[userId] = { step: 'EDIT_ITEM_SELECT', catalog: cat };
    ctx.reply('Выберите товар:', Markup.keyboard(kb).oneTime());
    return;
  }

  if (state?.step === 'EDIT_ITEM_SELECT') {
    const itemName = text.replace('✏️ ', '');
    const filePath = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const item = data.items.find(i => i.name === itemName);
    if (!item) return ctx.reply('Не найден.');
    userState[userId] = { step: 'EDIT_ITEM_ACTION', catalog: state.catalog, itemName, itemId: item.id };
    ctx.reply('Что редактировать?', Markup.keyboard([
      ['✏️ Название', '📝 Описание'],
      ['➕ Вариацию', '✏️ Вариацию'],
      ['⬅️ Назад']
    ]).oneTime());
    return;
  }

  if (state?.step === 'EDIT_ITEM_ACTION') {
    if (text === '✏️ Название') {
      userState[userId] = { ...state, step: 'EDIT_FIELD_INPUT', field: 'name' };
      ctx.reply('Новое название:');
      return;
    }
    if (text === '📝 Описание') {
      userState[userId] = { ...state, step: 'EDIT_FIELD_INPUT', field: 'description' };
      ctx.reply('Новое описание:');
      return;
    }
    if (text === '➕ Вариацию') {
      userState[userId] = { ...state, step: 'ADD_VAR_TYPE' };
      ctx.reply('Название вариации:');
      return;
    }
    if (text === '✏️ Вариацию') {
      const filePath = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const item = data.items.find(i => i.name === state.itemName);
      if (!item) return ctx.reply('Товар не найден.');
      let kb = item.subcategories.map(sub => [`✏️ ${sub.type}`]);
      kb.push(['⬅️ Назад']);
      userState[userId] = { ...state, step: 'EDIT_VAR_SELECT' };
      ctx.reply('Выберите вариацию:', Markup.keyboard(kb).oneTime());
      return;
    }
  }

  if (state?.step === 'EDIT_FIELD_INPUT') {
    const filePath = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const item = data.items.find(i => i.id === state.itemId);
    if (item) {
      item[state.field] = text;
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      delete userState[userId];
      ctx.reply('✅ Обновлено!', Markup.removeKeyboard());
    } else {
      ctx.reply('❌ Ошибка.');
    }
    return;
  }

  // --- УДАЛЕНИЕ ---
  if (state?.step === 'DELETE_TYPE') {
    if (text === '📦 Товар') {
      userState[userId] = { step: 'DELETE_ITEM_CATALOG' };
      ctx.reply('Каталог (1–4):');
      return;
    } else if (text === '🖌 Вариацию') {
      userState[userId] = { step: 'DELETE_VAR_CATALOG' };
      ctx.reply('Каталог (1–4):');
      return;
    }
  }

  if (state?.step === 'DELETE_ITEM_CATALOG') {
    const cat = parseInt(text);
    if (isNaN(cat) || cat < 1 || cat > 4) return ctx.reply('❌ 1–4');
    const filePath = path.join(CATALOGS_DIR, `catalog${cat}.json`);
    if (!fs.existsSync(filePath)) return ctx.reply('Каталог пуст.');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!data.items?.length) return ctx.reply('Нет товаров.');
    let kb = data.items.map(item => [`🗑 ${item.name}`]);
    kb.push(['⬅️ Назад']);
    userState[userId] = { step: 'DELETE_ITEM_CONFIRM', catalog: cat };
    ctx.reply('Выберите товар:', Markup.keyboard(kb).oneTime());
    return;
  }

  if (state?.step === 'DELETE_ITEM_CONFIRM') {
    const itemName = text.replace('🗑 ', '');
    const filePath = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const before = data.items.length;
    data.items = data.items.filter(item => item.name !== itemName);
    if (data.items.length < before) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      delete userState[userId];
      ctx.reply('✅ Товар удалён!', Markup.removeKeyboard());
    } else {
      ctx.reply('Не найден.');
    }
    return;
  }

  if (state?.step === 'DELETE_VAR_CATALOG') {
    const cat = parseInt(text);
    if (isNaN(cat) || cat < 1 || cat > 4) return ctx.reply('❌ 1–4');
    const filePath = path.join(CATALOGS_DIR, `catalog${cat}.json`);
    if (!fs.existsSync(filePath)) return ctx.reply('Каталог пуст.');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!data.items?.length) return ctx.reply('Нет товаров.');
    let kb = [];
    data.items.forEach(item => {
      if (item.subcategories?.length) {
        item.subcategories.forEach(sub => kb.push([`🗑 ${item.name} – ${sub.type}`]));
      }
    });
    if (kb.length === 0) return ctx.reply('Нет вариаций.');
    kb.push(['⬅️ Назад']);
    userState[userId] = { step: 'DELETE_VAR_CONFIRM', catalog: cat };
    ctx.reply('Выберите вариацию:', Markup.keyboard(kb).oneTime());
    return;
  }

  if (state?.step === 'DELETE_VAR_CONFIRM') {
    const parts = text.replace('🗑 ', '').split(' – ');
    if (parts.length < 2) return ctx.reply('❌ Ошибка.');
    const itemName = parts[0];
    const varType = parts[1];
    const filePath = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let found = false;
    data.items = data.items.map(item => {
      if (item.name === itemName) {
        const before = item.subcategories.length;
        item.subcategories = item.subcategories.filter(sub => sub.type !== varType);
        if (item.subcategories.length < before) found = true;
      }
      return item;
    });
    if (found) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      delete userState[userId];
      ctx.reply('✅ Вариация удалена!', Markup.removeKeyboard());
    } else {
      ctx.reply('Не найдена.');
    }
    return;
  }

  // --- ДОБАВЛЕНИЕ ВАРИАЦИИ ---
  if (state?.step === 'ADD_VAR_TYPE') {
    userState[userId] = { ...state, step: 'ADD_VAR_PRICE', varType: text };
    ctx.reply(`Цена для "${text}":`);
    return;
  }

  if (state?.step === 'ADD_VAR_PRICE') {
    const price = parseFloat(text);
    if (isNaN(price) || price <= 0) return ctx.reply('❌ Цена > 0');
    userState[userId] = { ...state, step: 'AWAITING_VAR_IMAGE', varPrice: price };
    ctx.reply('📸 Фото или "нет":');
    return;
  }

  if (state?.step === 'AWAITING_VAR_IMAGE' && text.toLowerCase() === 'нет') {
    const filePath = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const item = data.items.find(i => i.id === state.itemId);
    if (item) {
      item.subcategories.push({ type: state.varType, price: state.varPrice, image: null });
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }
    delete userState[userId];
    ctx.reply('✅ Вариация добавлена!', Markup.removeKeyboard());
    return;
  }

  if (state?.step === 'AWAITING_VAR_IMAGE') {
    const filePath = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const item = data.items.find(i => i.id === state.itemId);
    if (item) {
      item.subcategories.push({ type: state.varType, price: state.varPrice, image: text });
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }
    delete userState[userId];
    ctx.reply('✅ Вариация добавлена!', Markup.removeKeyboard());
    return;
  }

  // --- РЕДАКТИРОВАНИЕ ВАРИАЦИИ ---
  if (state?.step === 'EDIT_VAR_SELECT') {
    const varType = text.replace('✏️ ', '');
    const filePath = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const item = data.items.find(i => i.name === state.itemName);
    const sub = item.subcategories.find(s => s.type === varType);
    if (!sub) return ctx.reply('Вариация не найдена.');
    userState[userId] = { ...state, step: 'EDIT_VAR_ACTION', varType: varType };
    ctx.reply('Что редактировать?', Markup.keyboard([
      ['✏️ Название', '💰 Цену'],
      ['🖼 Фото', '❌ Удалить'],
      ['⬅️ Назад']
    ]).oneTime());
    return;
  }

  if (state?.step === 'EDIT_VAR_ACTION') {
    if (text === '✏️ Название') {
      userState[userId] = { ...state, step: 'EDIT_VAR_NAME_INPUT' };
      ctx.reply('Новое название:');
      return;
    }
    if (text === '💰 Цену') {
      userState[userId] = { ...state, step: 'EDIT_VAR_PRICE_INPUT' };
      ctx.reply('Новая цена:');
      return;
    }
    if (text === '🖼 Фото') {
      userState[userId] = { ...state, step: 'AWAITING_VAR_IMAGE_EDIT' };
      ctx.reply('📸 Новое фото или "нет":');
      return;
    }
    if (text === '❌ Удалить') {
      const filePath = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const item = data.items.find(i => i.name === state.itemName);
      item.subcategories = item.subcategories.filter(sub => sub.type !== state.varType);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      delete userState[userId];
      ctx.reply('✅ Вариация удалена!', Markup.removeKeyboard());
      return;
    }
  }

  if (state?.step === 'EDIT_VAR_NAME_INPUT') {
    const filePath = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const item = data.items.find(i => i.name === state.itemName);
    const sub = item.subcategories.find(s => s.type === state.varType);
    if (sub) {
      sub.type = text;
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      delete userState[userId];
      ctx.reply('✅ Название изменено!', Markup.removeKeyboard());
    } else {
      ctx.reply('❌ Ошибка.');
    }
    return;
  }

  if (state?.step === 'EDIT_VAR_PRICE_INPUT') {
    const price = parseFloat(text);
    if (isNaN(price) || price <= 0) return ctx.reply('❌ Цена > 0');
    const filePath = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const item = data.items.find(i => i.name === state.itemName);
    const sub = item.subcategories.find(s => s.type === state.varType);
    if (sub) {
      sub.price = price;
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      delete userState[userId];
      ctx.reply('✅ Цена изменена!', Markup.removeKeyboard());
    } else {
      ctx.reply('❌ Ошибка.');
    }
    return;
  }

  if (state?.step === 'AWAITING_VAR_IMAGE_EDIT') {
    const filePath = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const item = data.items.find(i => i.name === state.itemName);
    const sub = item.subcategories.find(s => s.type === state.varType);
    if (text.toLowerCase() === 'нет') {
      sub.image = null;
    } else {
      sub.image = text;
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    delete userState[userId];
    ctx.reply('✅ Фото изменено!', Markup.removeKeyboard());
    return;
  }
});

// === ОБРАБОТКА ФОТО ===
bot.on('photo', async (ctx) => {
  if (!hasAdminAccess(ctx.from.id)) return;
  const state = userState[ctx.from.id];
  if (!state || !state.step?.startsWith('AWAITING')) return;

  try {
    const photo = ctx.message.photo.pop();
    const file = await ctx.telegram.getFile(photo.file_id);
    const fileName = `${Date.now()}.jpg`;
    const filePath = path.join(IMAGES_DIR, fileName);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`; // ← УБРАНЫ ПРОБЕЛЫ!
    const response = await fetch(fileUrl);
    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(arrayBuffer));

    const imageUrl = `${RAILWAY_URL}/images/${fileName}`;

    if (state.step === 'AWAITING_VAR_IMAGE') {
      const catalogFile = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
      const data = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
      const item = data.items.find(i => i.id === state.itemId);
      if (item) {
        item.subcategories.push({ type: state.varType, price: state.varPrice, image: imageUrl });
        fs.writeFileSync(catalogFile, JSON.stringify(data, null, 2));
      }
      delete userState[ctx.from.id];
      ctx.reply('✅ Вариация с фото добавлена!', Markup.removeKeyboard());
    } else {
      const variants = state.variants || [];
      variants.push({ type: state.currentType, price: state.currentPrice, image: imageUrl });
      userState[ctx.from.id] = { ...state, variants, step: 'ADD_MORE' };
      ctx.reply('Ещё?', Markup.keyboard([['✅ Да', '❌ Нет']]).oneTime());
    }
  } catch (e) {
    console.error('Ошибка фото:', e);
    ctx.reply('❌ Ошибка загрузки фото.');
  }
});

// === ЗАПУСК ===
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
bot.launch();
console.log('Бот запущен');
