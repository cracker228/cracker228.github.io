// ===== ИМПОРТЫ =====
require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// ===== НАСТРОЙКИ =====
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = Number(process.env.ADMIN_CHAT_ID);
const PORT = process.env.PORT || 3000;

const app = express();
const bot = new Telegraf(BOT_TOKEN);

app.use(cors());
app.use(express.json());

// ===== ФАЙЛЫ =====
const DATA_DIR = path.join(__dirname, 'catalogs');
const ROLES_FILE = path.join(__dirname, 'roles.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// ===== РОЛИ =====
if (!fs.existsSync(ROLES_FILE)) {
  fs.writeFileSync(
    ROLES_FILE,
    JSON.stringify({ [ADMIN_CHAT_ID]: 'superadmin' }, null, 2)
  );
}

const loadRoles = () => JSON.parse(fs.readFileSync(ROLES_FILE));
const saveRoles = r => fs.writeFileSync(ROLES_FILE, JSON.stringify(r, null, 2));
const getRole = id => loadRoles()[id];
const isAdmin = id => ['admin', 'superadmin'].includes(getRole(id));
const isSuper = id => getRole(id) === 'superadmin';

// ===== КАТАЛОГИ =====
const catalogFile = n => path.join(DATA_DIR, `catalog${n}.json`);

const loadCatalog = n => {
  if (!fs.existsSync(catalogFile(n))) {
    return { name: `Каталог ${n}`, items: [] };
  }
  return JSON.parse(fs.readFileSync(catalogFile(n)));
};

const saveCatalog = (n, data) => {
  fs.writeFileSync(catalogFile(n), JSON.stringify(data, null, 2));
};

// ===== API ДЛЯ MINI APP =====
app.get('/api/catalog/:id', (req, res) => {
  const id = Number(req.params.id);
  if (![1, 2, 3, 4].includes(id)) return res.sendStatus(400);
  res.json(loadCatalog(id));
});

// ===== TELEGRAM IMAGE PROXY =====
app.get('/tg-image/:fileId', async (req, res) => {
  try {
    const link = await bot.telegram.getFileLink(req.params.fileId);
    res.redirect(link.href);
  } catch {
    res.sendStatus(404);
  }
});

// ===== ЗАКАЗ =====
app.post('/order', async (req, res) => {
  const { message } = req.body;
  const roles = loadRoles();
  for (const id in roles) {
    if (isAdmin(id)) {
      await bot.telegram.sendMessage(id, message);
    }
  }
  res.send('ok');
});

// ===== СОСТОЯНИЯ =====
const state = {};

// ===== START =====
bot.start(ctx => {
  ctx.reply(
    '🛍 Магазин:',
    Markup.inlineKeyboard([
      Markup.button.webApp('Открыть', 'https://cracker228-github-io.onrender.com')
    ])
  );
});

// ===== АДМИН ПАНЕЛЬ =====
bot.command('admin', ctx => {
  if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Нет доступа');
  ctx.reply(
    '🔧 Админка',
    Markup.keyboard([
      ['➕ Добавить товар'],
      ['✏️ Редактировать товар'],
      ['🗑 Удалить товар'],
      ...(isSuper(ctx.from.id) ? [['👑 Назначить админа']] : []),
      ['⬅️ Назад']
    ]).resize()
  );
  state[ctx.from.id] = {};
});

// ===== НАЗАД =====
bot.hears('⬅️ Назад', ctx => {
  delete state[ctx.from.id];
  ctx.reply('Главное меню', Markup.removeKeyboard());
});

// ===== НАЗНАЧЕНИЕ АДМИНА =====
bot.hears('👑 Назначить админа', ctx => {
  if (!isSuper(ctx.from.id)) return;
  state[ctx.from.id] = { step: 'SET_ADMIN' };
  ctx.reply('ID пользователя:');
});

bot.on('text', ctx => {
  const s = state[ctx.from.id];
  if (!s) return;

  const text = ctx.message.text;

  if (s.step === 'SET_ADMIN') {
    const roles = loadRoles();
    roles[text] = 'admin';
    saveRoles(roles);
    delete state[ctx.from.id];
    return ctx.reply('✅ Админ назначен');
  }

  // ===== ДОБАВЛЕНИЕ ТОВАРА =====
  if (text === '➕ Добавить товар') {
    state[ctx.from.id] = { step: 'ADD_CAT' };
    return ctx.reply('Каталог (1–4):');
  }

  if (s.step === 'ADD_CAT') {
    s.catalog = Number(text);
    s.step = 'ADD_NAME';
    return ctx.reply('Название товара:');
  }

  if (s.step === 'ADD_NAME') {
    s.name = text;
    s.step = 'ADD_DESC';
    return ctx.reply('Описание:');
  }

  if (s.step === 'ADD_DESC') {
    s.description = text;
    s.step = 'ADD_ITEM_IMAGE';
    return ctx.reply('📸 Фото товара:');
  }

  // остальные шаги обрабатываются в photo
});

// ===== ФОТО =====
bot.on('photo', ctx => {
  const s = state[ctx.from.id];
  if (!s) return;

  const fileId = ctx.message.photo.at(-1).file_id;

  if (s.step === 'ADD_ITEM_IMAGE') {
    s.image = fileId;
    s.step = 'ADD_VAR_TYPE';
    return ctx.reply('Тип вариации:');
  }

  if (s.step === 'ADD_VAR_IMAGE') {
    const catalog = loadCatalog(s.catalog);
    catalog.items.push({
      id: Date.now().toString(),
      name: s.name,
      description: s.description,
      image: s.image,
      subcategories: [{
        type: s.varType,
        price: s.varPrice,
        image: fileId
      }]
    });
    saveCatalog(s.catalog, catalog);
    delete state[ctx.from.id];
    return ctx.reply('✅ Товар добавлен', Markup.removeKeyboard());
  }
});

bot.on('text', ctx => {
  const s = state[ctx.from.id];
  if (!s) return;

  if (s.step === 'ADD_VAR_TYPE') {
    s.varType = ctx.message.text;
    s.step = 'ADD_VAR_PRICE';
    return ctx.reply('Цена:');
  }

  if (s.step === 'ADD_VAR_PRICE') {
    s.varPrice = Number(ctx.message.text);
    s.step = 'ADD_VAR_IMAGE';
    return ctx.reply('📸 Фото вариации:');
  }
});

// ===== ЗАПУСК =====
app.listen(PORT, () => console.log('Server started'));
bot.launch();
