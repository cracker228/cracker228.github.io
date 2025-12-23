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

// ================== ADMIN LOGIC ==================
const adminState = {};

// ---------- HELPERS ----------
const askCatalog = (ctx, next) => {
  adminState[ctx.from.id] = { step: next };
  ctx.reply(
    'Выберите каталог:',
    Markup.keyboard([['1', '2'], ['3', '4'], ['⬅️ Назад']])
      .resize()
      .oneTime()
  );
};

const getCatalogKeyboard = (catalog) => {
  const cat = loadCatalog(catalog);
  const kb = cat.items.map(i => [i.name]);
  kb.push(['⬅️ Назад']);
  return kb;
};

// ---------- ADMIN ENTRY ----------
bot.command('admin', ctx => {
  if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Нет доступа');

  adminState[ctx.from.id] = {};
  ctx.reply(
    '🔧 Админ-панель',
    Markup.keyboard([
      ['➕ Добавить товар'],
      ['✏️ Редактировать товар'],
      ['🗑 Удалить товар'],
      ...(isSuper(ctx.from.id) ? [['👑 Назначить админа']] : []),
      ['⬅️ Назад']
    ]).resize()
  );
});

// ---------- BACK ----------
bot.hears('⬅️ Назад', ctx => {
  delete adminState[ctx.from.id];
  ctx.reply('Главное меню', Markup.removeKeyboard());
});

// ---------- ASSIGN ADMIN ----------
bot.hears('👑 Назначить админа', ctx => {
  if (!isSuper(ctx.from.id)) return;
  adminState[ctx.from.id] = { step: 'SET_ADMIN' };
  ctx.reply('ID пользователя:');
});

// ---------- ADD PRODUCT ----------
bot.hears('➕ Добавить товар', ctx => askCatalog(ctx, 'ADD_CAT'));

// ---------- EDIT PRODUCT ----------
bot.hears('✏️ Редактировать товар', ctx => askCatalog(ctx, 'EDIT_CAT'));

// ---------- DELETE PRODUCT ----------
bot.hears('🗑 Удалить товар', ctx => askCatalog(ctx, 'DEL_CAT'));

// ---------- TEXT HANDLER ----------
bot.on('text', ctx => {
  const s = adminState[ctx.from.id];
  if (!s) return;

  const text = ctx.message.text;

  // --- SET ADMIN ---
  if (s.step === 'SET_ADMIN') {
    const roles = loadRoles();
    roles[text] = 'admin';
    saveRoles(roles);
    delete adminState[ctx.from.id];
    return ctx.reply('✅ Админ назначен');
  }

  // === ADD PRODUCT FLOW ===
  if (s.step === 'ADD_CAT') {
    s.catalog = Number(text);
    s.step = 'ADD_NAME';
    s.variants = [];
    return ctx.reply('Название товара:');
  }

  if (s.step === 'ADD_NAME') {
    s.name = text;
    s.step = 'ADD_DESC';
    return ctx.reply('Описание товара:');
  }

  if (s.step === 'ADD_DESC') {
    s.description = text;
    s.step = 'ADD_ITEM_IMAGE';
    return ctx.reply('📸 Фото товара:');
  }

  if (s.step === 'ADD_VAR_TYPE') {
    s.varType = text;
    s.step = 'ADD_VAR_PRICE';
    return ctx.reply('Цена вариации:');
  }

  if (s.step === 'ADD_VAR_PRICE') {
    s.varPrice = Number(text);
    s.step = 'ADD_VAR_IMAGE';
    return ctx.reply('📸 Фото вариации:');
  }

  if (s.step === 'ADD_MORE_VAR') {
    if (text === '➕ Да') {
      s.step = 'ADD_VAR_TYPE';
      return ctx.reply('Тип вариации:');
    }
    if (text === '❌ Нет') {
      const catalog = loadCatalog(s.catalog);
      catalog.items.push({
        id: Date.now().toString(),
        name: s.name,
        description: s.description,
        image: s.image,
        subcategories: s.variants
      });
      saveCatalog(s.catalog, catalog);
      delete adminState[ctx.from.id];
      return ctx.reply('✅ Товар добавлен', Markup.removeKeyboard());
    }
  }

  // === DELETE PRODUCT ===
  if (s.step === 'DEL_CAT') {
    s.catalog = Number(text);
    s.step = 'DEL_ITEM';
    return ctx.reply(
      'Выберите товар:',
      Markup.keyboard(getCatalogKeyboard(s.catalog)).oneTime()
    );
  }

  if (s.step === 'DEL_ITEM') {
    const catalog = loadCatalog(s.catalog);
    catalog.items = catalog.items.filter(i => i.name !== text);
    saveCatalog(s.catalog, catalog);
    delete adminState[ctx.from.id];
    return ctx.reply('🗑 Товар удалён', Markup.removeKeyboard());
  }

  // === EDIT PRODUCT ===
  if (s.step === 'EDIT_CAT') {
    s.catalog = Number(text);
    s.step = 'EDIT_ITEM';
    return ctx.reply(
      'Выберите товар:',
      Markup.keyboard(getCatalogKeyboard(s.catalog)).oneTime()
    );
  }

  if (s.step === 'EDIT_ITEM') {
    s.itemName = text;
    s.step = 'EDIT_ACTION';
    return ctx.reply(
      'Что редактировать?',
      Markup.keyboard([
        ['🖼 Фото', '✏️ Название'],
        ['📝 Описание'],
        ['⬅️ Назад']
      ]).oneTime()
    );
  }

  if (s.step === 'EDIT_ACTION') {
    if (text === '✏️ Название') {
      s.step = 'EDIT_NAME';
      return ctx.reply('Новое название:');
    }
    if (text === '📝 Описание') {
      s.step = 'EDIT_DESC';
      return ctx.reply('Новое описание:');
    }
    if (text === '🖼 Фото') {
      s.step = 'EDIT_IMAGE';
      return ctx.reply('📸 Новое фото:');
    }
  }

  if (s.step === 'EDIT_NAME') {
    const cat = loadCatalog(s.catalog);
    const item = cat.items.find(i => i.name === s.itemName);
    item.name = text;
    saveCatalog(s.catalog, cat);
    delete adminState[ctx.from.id];
    return ctx.reply('✅ Название обновлено', Markup.removeKeyboard());
  }

  if (s.step === 'EDIT_DESC') {
    const cat = loadCatalog(s.catalog);
    const item = cat.items.find(i => i.name === s.itemName);
    item.description = text;
    saveCatalog(s.catalog, cat);
    delete adminState[ctx.from.id];
    return ctx.reply('✅ Описание обновлено', Markup.removeKeyboard());
  }
});

// ---------- PHOTO HANDLER ----------
bot.on('photo', ctx => {
  const s = adminState[ctx.from.id];
  if (!s) return;

  const fileId = ctx.message.photo.at(-1).file_id;

  if (s.step === 'ADD_ITEM_IMAGE') {
    s.image = fileId;
    s.step = 'ADD_VAR_TYPE';
    return ctx.reply('Тип вариации:');
  }

  if (s.step === 'ADD_VAR_IMAGE') {
    s.variants.push({
      type: s.varType,
      price: s.varPrice,
      image: fileId
    });
    s.step = 'ADD_MORE_VAR';
    return ctx.reply(
      'Добавить ещё вариацию?',
      Markup.keyboard([['➕ Да', '❌ Нет']]).oneTime()
    );
  }

  if (s.step === 'EDIT_IMAGE') {
    const cat = loadCatalog(s.catalog);
    const item = cat.items.find(i => i.name === s.itemName);
    item.image = fileId;
    saveCatalog(s.catalog, cat);
    delete adminState[ctx.from.id];
    return ctx.reply('✅ Фото обновлено', Markup.removeKeyboard());
  }
});
// ================== END ADMIN LOGIC ==================

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
