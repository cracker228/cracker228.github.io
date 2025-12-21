require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// === TELEGRAM ===
const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();
app.use(cors());
app.use(express.json());

// === ХРАНЕНИЕ ===
const CATALOGS_DIR = path.join(__dirname, 'catalogs');
if (!fs.existsSync(CATALOGS_DIR)) fs.mkdirSync(CATALOGS_DIR);

// === РОЛИ ===
const ROLES_FILE = path.join(__dirname, 'roles.json');
if (!fs.existsSync(ROLES_FILE)) {
  const roles = {};
  if (process.env.ADMIN_CHAT_ID) {
    roles[process.env.ADMIN_CHAT_ID] = 'superadmin';
  }
  fs.writeFileSync(ROLES_FILE, JSON.stringify(roles, null, 2));
}

function loadRoles() { return JSON.parse(fs.readFileSync(ROLES_FILE, 'utf8')); }
function hasAdminAccess(id) {
  const r = loadRoles()[id];
  return r === 'admin' || r === 'superadmin';
}

// === API ===
app.use('/api', express.static(CATALOGS_DIR));

// === ЗАКАЗ ===
app.post('/order', async (req, res) => {
  const { message } = req.body;
  for (const id in loadRoles()) {
    if (loadRoles()[id] !== 'courier') {
      await bot.telegram.sendMessage(id, message);
    }
  }
  res.send('OK');
});

// === ПРОКСИ ФОТО ===
app.get('/tg-image/:fileId', async (req, res) => {
  try {
    const link = await bot.telegram.getFileLink(req.params.fileId);
    res.redirect(link.href);
  } catch {
    res.status(404).send('Image not found');
  }
});

// === АДМИНКА ===
const userState = {};

bot.command('admin', (ctx) => {
  if (!hasAdminAccess(ctx.from.id)) return ctx.reply('🚫 Нет доступа');
  ctx.reply('Админка', Markup.keyboard([
    ['➕ Добавить товар'],
    ['⬅️ Назад']
  ]).resize());
});

bot.hears('➕ Добавить товар', (ctx) => {
  if (!hasAdminAccess(ctx.from.id)) return;
  userState[ctx.from.id] = { step: 'CATALOG' };
  ctx.reply('Каталог (1–4):');
});

bot.on('text', (ctx) => {
  const s = userState[ctx.from.id];
  if (!s) return;
  const text = ctx.message.text.trim();

  if (s.step === 'CATALOG') {
    const cat = Number(text);
    if (isNaN(cat) || cat < 1 || cat > 4) return ctx.reply('❌ 1–4');
    s.catalog = cat;
    s.step = 'NAME';
    return ctx.reply('Название:');
  }

  if (s.step === 'NAME') {
    s.name = text;
    s.step = 'DESC';
    return ctx.reply('Описание:');
  }

  if (s.step === 'DESC') {
    s.desc = text;
    s.step = 'TYPE';
    return ctx.reply('Тип:');
  }

  if (s.step === 'TYPE') {
    s.type = text;
    s.step = 'PRICE';
    return ctx.reply('Цена:');
  }

  if (s.step === 'PRICE') {
    const price = Number(text);
    if (isNaN(price) || price <= 0) return ctx.reply('❌ Цена > 0');
    s.price = price;
    s.step = 'PHOTO';
    return ctx.reply('📸 Фото или "нет":');
  }

  if (s.step === 'PHOTO' && text.toLowerCase() === 'нет') {
    const data = loadCatalog(s.catalog);
    data.items.push({
      id: Date.now().toString(),
      name: s.name,
      description: s.desc,
      subcategories: [{ type: s.type, price: s.price, image: null }]
    });
    saveCatalog(s.catalog, data);
    delete userState[ctx.from.id];
    return ctx.reply('✅ Товар добавлен');
  }
});

bot.on('photo', async (ctx) => {
  const s = userState[ctx.from.id];
  if (!s || s.step !== 'PHOTO') return;

  const fileId = ctx.message.photo.at(-1).file_id;
  const data = loadCatalog(s.catalog);
  data.items.push({
    id: Date.now().toString(),
    name: s.name,
    description: s.desc,
    subcategories: [{ type: s.type, price: s.price, image: fileId }] // ← file_id!
  });
  saveCatalog(s.catalog, data);
  delete userState[ctx.from.id];
  ctx.reply('✅ Товар добавлен');
});

// === СЕРВИСНЫЕ ФУНКЦИИ ===
function loadCatalog(cat) {
  const file = path.join(CATALOGS_DIR, `catalog${cat}.json`);
  if (!fs.existsSync(file)) return { name: `Каталог ${cat}`, items: [] };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveCatalog(cat, data) {
  const file = path.join(CATALOGS_DIR, `catalog${cat}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// === СТАРТ ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('HTTP OK'));
bot.launch();
console.log('BOT OK');
