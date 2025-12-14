require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// === НАСТРОЙКИ ===
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = parseInt(process.env.ADMIN_CHAT_ID, 10);
const RAILWAY_URL = 'https://cracker228githubio-site.up.railway.app';

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
          { text: '🛍️ Открыть магазин', web_app: { url: 'https://cracker228.github.io' } }
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

  // --- УПРАВЛЕНИЕ РОЛЯМИ ---
  if (state?.step === 'ROLE_ACTION') {
    if (text === '👑 Назначить админа') {
      userState[userId] = { step: 'SET_ADMIN_ID' };
      return ctx.reply('ID пользователя:');
    }
    if (text === '🧑‍💼 Назначить курьера') {
      userState[userId] = { step: 'SET_COURIER_ID' };
      return ctx.reply('ID пользователя:');
    }
  }

  if (state?.step === 'SET_ADMIN_ID' || state?.step === 'SET_COURIER_ID') {
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
  if (state?.step === 'DELETE_TYPE') {
    if (text === '📦 Товар') {
      userState[userId] = { step: 'DELETE_ITEM_CATALOG' };
      return ctx.reply('Каталог (1–4):');
    } else if (text === '🖌 Вариацию') {
      userState[userId] = { step: 'DELETE_VAR_CATALOG' };
      return ctx.reply('Каталог (1–4):');
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
    return ctx.reply('Выберите товар:', Markup.keyboard(kb).oneTime());
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
      return ctx.reply('✅ Товар удалён!', Markup.removeKeyboard());
    }
    return ctx.reply('Не найден.');
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
    return ctx.reply('Выберите вариацию:', Markup.keyboard(kb).oneTime());
  }

  if (state?.step === 'DELETE_VAR_CONFIRM') {
    const parts = text.replace('🗑 ', '').split(' – ');
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
      return ctx.reply('✅ Вариация удалена!', Markup.removeKeyboard());
    }
    return ctx.reply('Не найдена.');
  }

  // --- РЕДАКТИРОВАНИЕ ---
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
    return ctx.reply('Выберите товар:', Markup.keyboard(kb).oneTime());
  }

  if (state?.step === 'EDIT_ITEM_SELECT') {
    const itemName = text.replace('✏️ ', '');
    const filePath = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const item = data.items.find(i => i.name === itemName);
    if (!item) return ctx.reply('Не найден.');
    userState[userId] = { step: 'EDIT_ITEM_ACTION', catalog: state.catalog, itemName, itemId: item.id };
    return ctx.reply('Что редактировать?', Markup.keyboard([
      ['✏️ Название', '📝 Описание'],
      ['➕ Вариацию', '✏️ Вариацию'],
      ['⬅️ Назад']
    ]).oneTime());
  }

  if (state?.step === 'EDIT_ITEM_ACTION') {
    if (text === '✏️ Название') {
      userState[userId] = { ...state, step: 'EDIT_FIELD_INPUT', field: 'name' };
      return ctx.reply('Новое название:');
    }
    if (text === '📝 Описание') {
      userState[userId] = { ...state, step: 'EDIT_FIELD_INPUT', field: 'description' };
      return ctx.reply('Новое описание:');
    }
    if (text === '➕ Вариацию') {
      userState[userId] = { ...state, step: 'ADD_VAR_TYPE' };
      return ctx.reply('Название вариации:');
    }
    if (text === '✏️ Вариацию') {
      const filePath = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const item = data.items.find(i => i.name === state.itemName);
      let kb = item.subcategories.map(sub => [`✏️ ${sub.type}`]);
      kb.push(['⬅️ Назад']);
      userState[userId] = { ...state, step: 'EDIT_VAR_SELECT' };
      return ctx.reply('Выберите вариацию:', Markup.keyboard(kb).oneTime());
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
      return ctx.reply('✅ Обновлено!', Markup.removeKeyboard());
    }
    return ctx.reply('❌ Ошибка.');
  }

  if (state?.step === 'ADD_VAR_TYPE') {
    userState[userId] = { ...state, step: 'ADD_VAR_PRICE', varType: text };
    return ctx.reply(`Цена для "${text}":`);
  }

  if (state?.step === 'ADD_VAR_PRICE') {
    const price = parseFloat(text);
    if (isNaN(price) || price <= 0) return ctx.reply('❌ Цена > 0');
    userState[userId] = { ...state, step: 'AWAITING_VAR_IMAGE', varPrice: price };
    return ctx.reply('📸 Фото или "нет":');
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
    return ctx.reply('✅ Вариация добавлена!', Markup.removeKeyboard());
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
    return ctx.reply('✅ Вариация добавлена!', Markup.removeKeyboard());
  }

  // --- ДОБАВЛЕНИЕ НОВОГО ТОВАРА ---
  if (state?.step === 'ADD_CATALOG') {
    const cat = parseInt(text);
    if (isNaN(cat) || cat < 1 || cat > 4) return ctx.reply('❌ 1–4');
    userState[userId] = { step: 'ADD_NAME', catalog: cat };
    return ctx.reply('Название:');
  }

  if (state?.step === 'ADD_NAME') {
    userState[userId] = { ...state, step: 'ADD_DESC', name: text };
    return ctx.reply('Описание:');
  }

  if (state?.step === 'ADD_DESC') {
    userState[userId] = { ...state, step: 'ADD_TYPE', description: text };
    return ctx.reply('Вариация (тип):');
  }

  if (state?.step === 'ADD_TYPE') {
    userState[userId] = { ...state, step: 'ADD_PRICE', currentType: text };
    return ctx.reply(`Цена для "${text}":`);
  }

  if (state?.step === 'ADD_PRICE') {
    const price = parseFloat(text);
    if (isNaN(price) || price <= 0) return ctx.reply('❌ Цена > 0');
    userState[userId] = { ...state, step: 'AWAITING_IMAGE', currentPrice: price };
    return ctx.reply('📸 Фото или "нет":');
  }

  if (state?.step === 'AWAITING_IMAGE' && text.toLowerCase() === 'нет') {
    const variants = state.variants || [];
    variants.push({ type: state.currentType, price: state.currentPrice, image: null });
    userState[userId] = { ...state, variants, step: 'ADD_MORE' };
    return ctx.reply('Ещё?', Markup.keyboard([['✅ Да', '❌ Нет']]).oneTime());
  }

  if (state?.step === 'AWAITING_IMAGE') {
    const variants = state.variants || [];
    variants.push({ type: state.currentType, price: state.currentPrice, image: text });
    userState[userId] = { ...state, variants, step: 'ADD_MORE' };
    return ctx.reply('Ещё?', Markup.keyboard([['✅ Да', '❌ Нет']]).oneTime());
  }

  if (state?.step === 'ADD_MORE') {
    if (text === '✅ Да') {
      userState[userId] = { ...state, step: 'ADD_TYPE' };
      return ctx.reply('Вариация (тип):');
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
  if (!hasAdminAccess(ctx.from.id)) return;
  const state = userState[ctx.from.id];
  if (!state || !state.step?.startsWith('AWAITING')) return;

  try {
    const photo = ctx.message.photo.pop();
    const file = await ctx.telegram.getFile(photo.file_id);
    const fileName = `${Date.now()}.jpg`;
    const filePath = path.join(IMAGES_DIR, fileName);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
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
      return ctx.reply('✅ Вариация с фото добавлена!', Markup.removeKeyboard());
    } else {
      const variants = state.variants || [];
      variants.push({ type: state.currentType, price: state.currentPrice, image: imageUrl });
      userState[ctx.from.id] = { ...state, variants, step: 'ADD_MORE' };
      return ctx.reply('Ещё?', Markup.keyboard([['✅ Да', '❌ Нет']]).oneTime());
    }
  } catch (e) {
    console.error('Ошибка фото:', e);
    await ctx.reply('❌ Ошибка загрузки фото.');
  }
});

// === ЗАПУСК ===
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
bot.launch();
console.log('Бот запущен');
