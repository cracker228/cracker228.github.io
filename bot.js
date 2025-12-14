require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// === НАСТРОЙКИ ===
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = parseInt(process.env.ADMIN_CHAT_ID, 10);
const REPLIT_URL = 'https://98336acf-01d5-468f-8e37-12c8dfdecc91-00-3lkm6n8epp37w.worf.replit.dev';

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

    // Отправляем админу (гарантированно)
    await bot.telegram.sendMessage(ADMIN_CHAT_ID, `📦 НОВЫЙ ЗАКАЗ:\n\n${message}`);

    // Отправляем всем админам (кроме дубля)
    for (const id of adminIds) {
      if (id != ADMIN_CHAT_ID) {
        await bot.telegram.sendMessage(id, `📦 НОВЫЙ ЗАКАЗ:\n\n${message}`);
      }
    }

    // Отправляем курьерам
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

// === УПРАВЛЕНИЕ РОЛЯМИ (только суперадмин) ===
bot.hears('👥 Управление ролями', (ctx) => {
  if (!hasSuperAdminAccess(ctx.from.id)) return;
  ctx.reply('Выберите:', Markup.keyboard([
    ['👑 Назначить админа', '🧑‍💼 Назначить курьера'],
    ['⬅️ Назад']
  ]).oneTime());
  userState[ctx.from.id] = { step: 'ROLE_ACTION' };
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
      return ctx.reply('Отправьте ID пользователя (через @userinfobot):');
    }
    if (text === '🧑‍💼 Назначить курьера') {
      userState[userId] = { step: 'SET_COURIER_ID' };
      return ctx.reply('Отправьте ID пользователя:');
    }
  }

  if (state?.step === 'SET_ADMIN_ID' || state?.step === 'SET_COURIER_ID') {
    if (!/^\d+$/.test(text)) {
      return ctx.reply('❌ ID должен быть числом (например, 123456789).');
    }
    const roles = loadRoles();
    roles[text] = state.step === 'SET_ADMIN_ID' ? 'admin' : 'courier';
    saveRoles(roles);
    delete userState[userId];
    return ctx.reply('✅ Роль назначена!');
  }

  // --- ДАЛЬНЕЙШИЕ ШАГИ АДМИНКИ (товары, вариации и т.д.) ---
  if (!hasAdminAccess(userId)) return;

  // ... здесь вставляется ВЕСЬ ОСТАЛЬНОЙ КОД ИЗ ПРЕДЫДУЩЕГО bot.js ...
  // (логика добавления, редактирования, удаления товаров)
  // Чтобы не удваивать объём — вставьте его сюда (между этими комментариями)

  // =============== НАЧАЛО ЛОГИКИ ТОВАРОВ ===============

  // (ВСТАВЬТЕ СЮДА ВЕСЬ КОД ОБРАБОТКИ ТОВАРОВ ИЗ ПРОШЛОГО СООБЩЕНИЯ)

  // =============== КОНЕЦ ЛОГИКИ ТОВАРОВ ===============
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

    const imageUrl = `${REPLIT_URL}/images/${fileName}`;

    if (state.step === 'AWAITING_VAR_IMAGE') {
      const catalogFile = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
      const data = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
      const item = data.items.find(i => i.id === state.itemId);
      if (item) {
        item.subcategories.push({
          type: state.varType,
          price: state.varPrice,
          image: imageUrl
        });
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
  console.log(`Сервер на порту ${PORT}`);
});
bot.launch();
console.log('Бот запущен');