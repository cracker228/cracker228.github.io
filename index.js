require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = parseInt(process.env.ADMIN_CHAT_ID, 10);

const bot = new Telegraf(BOT_TOKEN);
const app = express();

app.use(cors());
app.use(express.json());
app.use('/api', express.static('api'));

const CATALOGS_DIR = path.join(__dirname, 'api');
const ROLES_FILE = path.join(__dirname, 'roles.json');
if (!fs.existsSync(CATALOGS_DIR)) fs.mkdirSync(CATALOGS_DIR);

// ===== РОЛИ =====
function loadRoles() {
  if (!fs.existsSync(ROLES_FILE)) {
    fs.writeFileSync(ROLES_FILE, JSON.stringify({ [ADMIN_CHAT_ID]: 'superadmin' }, null, 2));
  }
  return JSON.parse(fs.readFileSync(ROLES_FILE));
}
function hasAdminAccess(id) {
  const r = loadRoles()[id];
  return r === 'admin' || r === 'superadmin';
}

// ===== API =====
app.post('/order', async (req, res) => {
  const { message } = req.body;
  const roles = loadRoles();
  for (const id of Object.keys(roles)) {
    if (roles[id] === 'admin' || roles[id] === 'superadmin') {
      await bot.telegram.sendMessage(id, message);
    }
  }
  res.json({ ok: true });
});

app.get('/', (_, res) => res.json({ status: 'ok' }));

// 🔥 PROXY ДЛЯ КАРТИНОК TELEGRAM
app.get('/tg-image/:fileId', async (req, res) => {
  try {
    const file = await bot.telegram.getFile(req.params.fileId);
    const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    res.redirect(url);
  } catch {
    res.status(404).send('Not found');
  }
});

// ===== FSM =====
const userState = {};

bot.start(ctx => {
  ctx.reply('Добро пожаловать!', {
    reply_markup: {
      inline_keyboard: [[
        { text: '🛍 Открыть магазин', web_app: { url: 'https://cracker228.github.io' } }
      ]]
    }
  });
});

bot.command('admin', ctx => {
  if (!hasAdminAccess(ctx.from.id)) return ctx.reply('🚫 Нет доступа');
  ctx.reply('Админка', Markup.keyboard([['➕ Добавить товар']]).resize());
});

bot.hears('➕ Добавить товар', ctx => {
  userState[ctx.from.id] = { step: 'CATALOG' };
  ctx.reply('Номер каталога (1–4):');
});

bot.on('text', ctx => {
  const s = userState[ctx.from.id];
  if (!s) return;

  if (s.step === 'CATALOG') {
    s.catalog = ctx.message.text;
    s.step = 'NAME';
    return ctx.reply('Название:');
  }
  if (s.step === 'NAME') {
    s.name = ctx.message.text;
    s.step = 'DESC';
    return ctx.reply('Описание:');
  }
  if (s.step === 'DESC') {
    s.desc = ctx.message.text;
    s.step = 'TYPE';
    return ctx.reply('Тип:');
  }
  if (s.step === 'TYPE') {
    s.type = ctx.message.text;
    s.step = 'PRICE';
    return ctx.reply('Цена:');
  }
  if (s.step === 'PRICE') {
    s.price = ctx.message.text;
    s.step = 'PHOTO';
    return ctx.reply('Отправь фото или напиши "нет":');
  }
  if (s.step === 'PHOTO' && ctx.message.text.toLowerCase() === 'нет') {
    saveItem(s, null);
    delete userState[ctx.from.id];
    ctx.reply('✅ Товар добавлен');
  }
});

bot.on('photo', ctx => {
  const s = userState[ctx.from.id];
  if (!s || s.step !== 'PHOTO') return;

  const fileId = ctx.message.photo.at(-1).file_id;
  saveItem(s, fileId);
  delete userState[ctx.from.id];
  ctx.reply('✅ Товар с фото добавлен');
});

function saveItem(s, image) {
  const file = path.join(CATALOGS_DIR, `catalog${s.catalog}.json`);
  const data = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file))
    : { name: `Каталог ${s.catalog}`, items: [] };

  data.items.push({
    id: Date.now().toString(),
    name: s.name,
    description: s.desc,
    subcategories: [{ type: s.type, price: s.price, image }]
  });

  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ===== ЗАПУСК =====
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0');
bot.launch();
