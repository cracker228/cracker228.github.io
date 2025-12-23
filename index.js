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

// ===== STATE =====
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

// ===== ADMIN MENU =====
function showAdmin(ctx) {
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
}

bot.command('admin', ctx => {
  if (!isAdmin(ctx.from.id)) return;
  showAdmin(ctx);
});

// ===== BACK =====
bot.hears('⬅️ Назад', ctx => {
  delete state[ctx.from.id];
  ctx.reply('Ок', Markup.removeKeyboard());
});

// ===== ASSIGN ADMIN =====
bot.hears('👑 Назначить админа', ctx => {
  if (!isSuper(ctx.from.id)) return;
  state[ctx.from.id] = { step: 'SET_ADMIN' };
  ctx.reply('ID пользователя:');
});

// ===== ADD / EDIT / DELETE ENTRY =====
bot.hears('➕ Добавить товар', ctx => {
  state[ctx.from.id] = { step: 'ADD_CAT' };
  ctx.reply('Каталог (1–4):');
});

bot.hears('✏️ Редактировать товар', ctx => {
  state[ctx.from.id] = { step: 'EDIT_CAT' };
  ctx.reply('Каталог (1–4):');
});

bot.hears('🗑 Удалить товар', ctx => {
  state[ctx.from.id] = { step: 'DEL_CAT' };
  ctx.reply('Каталог (1–4):');
});

// ===== TEXT =====
bot.on('text', ctx => {
  const s = state[ctx.from.id];
  if (!s) return;
  const text = ctx.message.text;

  // ---- SET ADMIN
  if (s.step === 'SET_ADMIN') {
    const roles = loadRoles();
    roles[text] = 'admin';
    saveRoles(roles);
    delete state[ctx.from.id];
    return showAdmin(ctx);
  }

  // ---- ADD
  if (s.step === 'ADD_CAT') {
    s.catalog = Number(text);
    s.step = 'ADD_NAME';
    return ctx.reply('Название:');
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

  // ---- EDIT / DELETE SELECT CATALOG
  if (['EDIT_CAT','DEL_CAT'].includes(s.step)) {
    s.catalog = Number(text);
    const data = loadCatalog(s.catalog);
    if (!data.items.length) {
      delete state[ctx.from.id];
      return ctx.reply('❌ В каталоге пусто');
    }
    s.step = s.step === 'EDIT_CAT' ? 'EDIT_ITEM' : 'DEL_ITEM';
    return ctx.reply(
      'Выберите товар:',
      Markup.keyboard(
        data.items.map(i => [i.name]).concat([['⬅️ Назад']])
      ).resize()
    );
  }

  // ---- EDIT SELECT ITEM
  if (s.step === 'EDIT_ITEM') {
    const data = loadCatalog(s.catalog);
    const item = data.items.find(i => i.name === text);
    if (!item) return ctx.reply('❌ Не найдено');
    s.itemId = item.id;
    s.step = 'EDIT_NAME';
    return ctx.reply('Новое название:');
  }

  if (s.step === 'EDIT_NAME') {
    const data = loadCatalog(s.catalog);
    const item = data.items.find(i => i.id === s.itemId);
    item.name = text;
    saveCatalog(s.catalog, data);
    delete state[ctx.from.id];
    return showAdmin(ctx);
  }

  // ---- DELETE
  if (s.step === 'DEL_ITEM') {
    const data = loadCatalog(s.catalog);
    data.items = data.items.filter(i => i.name !== text);
    saveCatalog(s.catalog, data);
    delete state[ctx.from.id];
    return showAdmin(ctx);
  }
});

// ===== PHOTO =====
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
    return showAdmin(ctx);
  }
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
