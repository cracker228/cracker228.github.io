require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;

// === НАСТРОЙКИ ===
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = parseInt(process.env.ADMIN_CHAT_ID, 10);
const BASE_URL = process.env.BASE_URL;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const bot = new Telegraf(BOT_TOKEN);
const app = express();

// === EXPRESS ===
app.use(cors());
app.use(express.json());
app.use('/api', express.static('api'));

const CATALOGS_DIR = path.join(__dirname, 'api');
const ROLES_FILE = path.join(__dirname, 'roles.json');

if (!fs.existsSync(CATALOGS_DIR)) fs.mkdirSync(CATALOGS_DIR);

// === РОЛИ ===
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

function getUserRole(id) {
  return loadRoles()[id] || null;
}

function hasAdminAccess(id) {
  const r = getUserRole(id);
  return r === 'admin' || r === 'superadmin';
}

function hasSuperAdminAccess(id) {
  return getUserRole(id) === 'superadmin';
}

function getAllCourierIds() {
  return Object.keys(loadRoles()).filter(id => loadRoles()[id] === 'courier');
}

// === API ===
app.post('/order', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  const roles = loadRoles();
  const admins = Object.keys(roles).filter(id => ['admin','superadmin'].includes(roles[id]));
  const couriers = getAllCourierIds();

  for (const id of admins) {
    await bot.telegram.sendMessage(id, `📦 НОВЫЙ ЗАКАЗ:\n\n${message}`);
  }
  for (const id of couriers) {
    await bot.telegram.sendMessage(id, `🚚 Новый заказ:\n\n${message}`);
  }

  res.json({ success: true });
});

app.get('/', (_, res) => res.json({ status: 'ok' }));

// === STATE ===
const userState = {};

// === START ===
bot.start(ctx => {
  ctx.reply('Добро пожаловать!', {
    reply_markup: {
      inline_keyboard: [[
        { text: '🛍️ Открыть магазин', web_app: { url: 'https://cracker228.github.io' } }
      ]]
    }
  });
});

// === ADMIN ===
bot.command('admin', ctx => {
  if (!hasAdminAccess(ctx.from.id)) return ctx.reply('🚫 Нет доступа');
  ctx.reply('🔐 Админка', Markup.keyboard([
    ['➕ Добавить товар'],
    ['✏️ Редактировать товар'],
    ['🗑 Удалить'],
    ['⬅️ Назад']
  ]).resize());
});

// === ДОБАВЛЕНИЕ ТОВАРА ===
bot.hears('➕ Добавить товар', ctx => {
  if (!hasAdminAccess(ctx.from.id)) return;
  userState[ctx.from.id] = { step: 'ADD_CATALOG' };
  ctx.reply('Каталог (1–4):');
});

// === FSM TEXT ===
bot.on('text', async ctx => {
  const state = userState[ctx.from.id];
  const text = ctx.message.text.trim();
  if (!state) return;

  if (state.step === 'ADD_CATALOG') {
    userState[ctx.from.id] = { step: 'ADD_NAME', catalog: text };
    return ctx.reply('Название:');
  }

  if (state.step === 'ADD_NAME') {
    userState[ctx.from.id] = { ...state, step: 'ADD_DESC', name: text };
    return ctx.reply('Описание:');
  }

  if (state.step === 'ADD_DESC') {
    userState[ctx.from.id] = { ...state, step: 'ADD_TYPE', description: text };
    return ctx.reply('Тип:');
  }

  if (state.step === 'ADD_TYPE') {
    userState[ctx.from.id] = { ...state, step: 'ADD_PRICE', currentType: text };
    return ctx.reply('Цена:');
  }

  if (state.step === 'ADD_PRICE') {
    userState[ctx.from.id] = { ...state, step: 'AWAITING_IMAGE', currentPrice: text };
    return ctx.reply('📸 Фото или "нет":');
  }

  if (state.step === 'AWAITING_IMAGE' && text.toLowerCase() === 'нет') {
    const file = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
    const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { items: [] };

    data.items.push({
      id: Date.now().toString(),
      name: state.name,
      description: state.description,
      subcategories: [{
        type: state.currentType,
        price: state.currentPrice,
        image: null
      }]
    });

    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    delete userState[ctx.from.id];
    return ctx.reply('✅ Товар добавлен', Markup.removeKeyboard());
  }
});

// === ФОТО (CLOUDINARY) ===
bot.on('photo', async ctx => {
  if (!hasAdminAccess(ctx.from.id)) return;
  const state = userState[ctx.from.id];
  if (!state || state.step !== 'AWAITING_IMAGE') return;

  try {
    const photo = ctx.message.photo.pop();
    const link = await ctx.telegram.getFileLink(photo.file_id);
    const upload = await cloudinary.uploader.upload(link.href);

    const file = path.join(CATALOGS_DIR, `catalog${state.catalog}.json`);
    const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { items: [] };

    data.items.push({
      id: Date.now().toString(),
      name: state.name,
      description: state.description,
      subcategories: [{
        type: state.currentType,
        price: state.currentPrice,
        image: upload.secure_url
      }]
    });

    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    delete userState[ctx.from.id];
    ctx.reply('✅ Товар с фото добавлен', Markup.removeKeyboard());
  } catch (e) {
    console.error(e);
    ctx.reply('❌ Ошибка загрузки фото');
  }
});

// === ЗАПУСК ===
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`API on ${PORT}`));
bot.launch();
console.log('BOT STARTED');
