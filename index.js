require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// === НАСТРОЙКИ ===
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = parseInt(process.env.ADMIN_CHAT_ID, 10);
// 🔥 УБРАНЫ ПРОБЕЛЫ:
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
          // 🔥 УБРАНЫ ПРОБЕЛЫ:
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

// === УПРАВЛЕНИЕ РОЛЯМИ (только суперадмин) ===
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

// === ОСТАЛЬНАЯ ЛОГИКА (Добавление, редактирование, удаление) ===
// ... (оставьте вашу текущую логику без изменений)

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

  // ... (ваша остальная логика: RENAME, ADD, EDIT, DELETE — без изменений)
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
    // 🔥 УБРАНЫ ПРОБЕЛЫ:
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const response = await fetch(fileUrl);
    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(arrayBuffer));

    const imageUrl = `${RAILWAY_URL}/images/${fileName}`;

    // ... (сохранение в catalogX.json — без изменений)
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
