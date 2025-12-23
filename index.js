require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = Number(process.env.ADMIN_CHAT_ID);
const PORT = process.env.PORT || 3000;

const app = express();
const bot = new Telegraf(BOT_TOKEN);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// ===== FILES =====
const DATA_DIR = path.join(__dirname, 'catalogs');
const ROLES_FILE = path.join(__dirname, 'roles.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

if (!fs.existsSync(ROLES_FILE)) {
  fs.writeFileSync(
    ROLES_FILE,
    JSON.stringify({ [ADMIN_CHAT_ID]: 'superadmin' }, null, 2)
  );
}

const loadRoles = () => JSON.parse(fs.readFileSync(ROLES_FILE));
const saveRoles = r => fs.writeFileSync(ROLES_FILE, JSON.stringify(r, null, 2));
const isAdmin = id => ['admin', 'superadmin'].includes(loadRoles()[id]);
const isSuper = id => loadRoles()[id] === 'superadmin';

// ===== CATALOG =====
const catalogFile = n => path.join(DATA_DIR, `catalog${n}.json`);

const loadCatalog = n => {
  if (!fs.existsSync(catalogFile(n))) {
    return { name: `Каталог ${n}`, items: [] };
  }
  return JSON.parse(fs.readFileSync(catalogFile(n)));
};

const saveCatalog = (n, data) =>
  fs.writeFileSync(catalogFile(n), JSON.stringify(data, null, 2));

// ===== API =====
app.get('/api/catalog/:id', (req, res) => {
  const id = Number(req.params.id);
  if (![1,2,3,4].includes(id)) return res.sendStatus(400);
  res.json(loadCatalog(id));
});

app.get('/tg-image/:fileId', async (req, res) => {
  try {
    const link = await bot.telegram.getFileLink(req.params.fileId);
    res.redirect(link.href);
  } catch {
    res.sendStatus(404);
  }
});

app.post('/order', async (req, res) => {
  const roles = loadRoles();
  for (const id in roles) {
    if (isAdmin(id)) {
      await bot.telegram.sendMessage(id, req.body.message);
    }
  }
  res.send('ok');
});

const adminState = {};

// ===== HELPERS =====
function reset(ctx) {
  delete adminState[ctx.from.id];
  ctx.reply('🔧 Админка', Markup.keyboard([
    ['➕ Добавить товар'],
    ['✏️ Редактировать товар'],
    ['🗑 Удалить товар'],
    ...(isSuper(ctx.from.id) ? [['👑 Назначить админа']] : []),
    ['⬅️ Назад']
  ]).resize());
}

function chooseCatalog(ctx, mode) {
  adminState[ctx.from.id] = { mode };
  ctx.reply('Выбери каталог:', Markup.keyboard([
    ['1','2','3','4'],
    ['⬅️ Назад']
  ]).resize());
}

function chooseItem(ctx, catalog) {
  const data = loadCatalog(catalog);
  if (!data.items.length) {
    ctx.reply('❌ Каталог пуст');
    return reset(ctx);
  }
  adminState[ctx.from.id].catalog = catalog;
  ctx.reply(
    'Выбери товар:',
    Markup.keyboard(
      data.items.map(i => [i.name]).concat([['⬅️ Назад']])
    ).resize()
  );
}

// ===== COMMAND =====
bot.command('admin', ctx => {
  if (!isAdmin(ctx.from.id)) return;
  reset(ctx);
});

// ===== BUTTONS =====
bot.hears('➕ Добавить товар', ctx => chooseCatalog(ctx, 'add'));
bot.hears('✏️ Редактировать товар', ctx => chooseCatalog(ctx, 'edit'));
bot.hears('🗑 Удалить товар', ctx => chooseCatalog(ctx, 'delete'));
bot.hears('⬅️ Назад', ctx => reset(ctx));

// ===== TEXT FLOW =====
bot.on('text', ctx => {
  const s = adminState[ctx.from.id];
  if (!s) return;

  const text = ctx.message.text;

  // ===== SELECT CATALOG =====
  if (['add','edit','delete'].includes(s.mode) && !s.catalog) {
    s.catalog = Number(text);
    if (s.mode === 'add') {
      s.step = 'NAME';
      return ctx.reply('Название товара:');
    }
    return chooseItem(ctx, s.catalog);
  }

  // ===== ADD FLOW =====
  if (s.mode === 'add') {
    if (s.step === 'NAME') {
      s.name = text;
      s.step = 'DESC';
      return ctx.reply('Описание:');
    }
    if (s.step === 'DESC') {
      s.description = text;
      s.step = 'ITEM_PHOTO';
      return ctx.reply('📸 Фото товара:');
    }
  }

  // ===== EDIT =====
  if (s.mode === 'edit' && !s.itemName) {
    s.itemName = text;
    s.step = 'EDIT_NAME';
    return ctx.reply('Новое название:');
  }

  if (s.step === 'EDIT_NAME') {
    const data = loadCatalog(s.catalog);
    const item = data.items.find(i => i.name === s.itemName);
    if (!item) return reset(ctx);
    item.name = text;
    saveCatalog(s.catalog, data);
    ctx.reply('✅ Обновлено');
    return reset(ctx);
  }

  // ===== DELETE =====
  if (s.mode === 'delete' && !s.itemName) {
    const data = loadCatalog(s.catalog);
    data.items = data.items.filter(i => i.name !== text);
    saveCatalog(s.catalog, data);
    ctx.reply('🗑 Удалено');
    return reset(ctx);
  }
});

// ===== PHOTO =====
bot.on('photo', ctx => {
  const s = adminState[ctx.from.id];
  if (!s || s.mode !== 'add' || s.step !== 'ITEM_PHOTO') return;

  const fileId = ctx.message.photo.at(-1).file_id;
  const data = loadCatalog(s.catalog);

  data.items.push({
    id: Date.now().toString(),
    name: s.name,
    description: s.description,
    image: fileId,
    subcategories: []
  });

  saveCatalog(s.catalog, data);
  ctx.reply('✅ Товар добавлен');
  reset(ctx);
});


// ===== VARIATION =====
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

// ===== START =====
app.listen(PORT, () => console.log('Server started'));
bot.launch();
