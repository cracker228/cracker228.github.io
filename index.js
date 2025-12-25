require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

/* ===== CONFIG ===== */
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = Number(process.env.ADMIN_CHAT_ID);
const PORT = process.env.PORT || 3000;
const WEBAPP_URL = 'https://cracker228.github.io';

const bot = new Telegraf(BOT_TOKEN);
const app = express();
app.use(cors());
app.use(express.json());

/* ===== FILES ===== */
const DATA_DIR = path.join(__dirname, 'catalogs');
const ROLES_FILE = path.join(__dirname, 'roles.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

if (!fs.existsSync(ROLES_FILE)) {
  fs.writeFileSync(
    ROLES_FILE,
    JSON.stringify({ [ADMIN_CHAT_ID]: 'superadmin' }, null, 2)
  );
}

/* ===== ROLES ===== */
const loadRoles = () => JSON.parse(fs.readFileSync(ROLES_FILE));
const saveRoles = r => fs.writeFileSync(ROLES_FILE, JSON.stringify(r, null, 2));
const roleOf = id => loadRoles()[id];
const isAdmin = id => ['admin', 'superadmin'].includes(roleOf(id));
const isSuper = id => roleOf(id) === 'superadmin';

/* ===== CATALOG ===== */
const catalogPath = n => path.join(DATA_DIR, `catalog${n}.json`);

function loadCatalog(n) {
  if (!fs.existsSync(catalogPath(n))) {
    return { name: `Каталог ${n}`, items: [] };
  }
  return JSON.parse(fs.readFileSync(catalogPath(n)));
}

function saveCatalog(n, data) {
  fs.writeFileSync(catalogPath(n), JSON.stringify(data, null, 2));
}

/* ===== API ===== */
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
  const { phone, address, items, total } = req.body;
  if (!items?.length) return res.sendStatus(400);

  let text =
`📦 НОВЫЙ ЗАКАЗ
📞 ${phone}
🏠 ${address}
💰 ${total} ₽

Товары:
`;

  items.forEach(i => {
    text += `• ${i.name} (${i.type}) — ${i.price} ₽\n`;
  });

  const roles = loadRoles();
  for (const id in roles) {
    if (isAdmin(id)) {
      await bot.telegram.sendMessage(id, text);
    }
  }
  res.send('ok');
});

/* ===== STATE ===== */
const state = {};

/* ===== START ===== */
bot.start(ctx => {
  ctx.reply(
    '🛍 Магазин',
    Markup.inlineKeyboard([
      Markup.button.webApp('Открыть магазин', WEBAPP_URL)
    ])
  );
});

/* ===== ADMIN ===== */
bot.command('admin', ctx => {
  if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Нет доступа');

  state[ctx.from.id] = {};
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
});

bot.hears('✏️ Редактировать товар', ctx => {
  if (!isAdmin(ctx.from.id)) return;

  state[ctx.from.id] = { step: 'EDIT_SELECT_CAT' };
  ctx.reply('Номер каталога (1–4):');
});

bot.on('text', ctx => {
  const s = state[ctx.from.id];
  if (!s) return;

  if (s.step === 'EDIT_SELECT_CAT') {
    s.catalog = Number(ctx.message.text);
    const catalog = loadCatalog(s.catalog);

    if (!catalog.items.length) {
      delete state[ctx.from.id];
      return ctx.reply('❌ В каталоге нет товаров');
    }

    s.step = 'EDIT_SELECT_ITEM';

    return ctx.reply(
      'Выберите товар:',
      Markup.keyboard(
        catalog.items.map(i => [i.name]).concat([['⬅️ Назад']])
      ).resize()
    );
  }

  if (s.step === 'EDIT_SELECT_ITEM') {
    const catalog = loadCatalog(s.catalog);
    const item = catalog.items.find(i => i.name === ctx.message.text);

    if (!item) return ctx.reply('❌ Товар не найден');

    s.itemId = item.id;
    s.step = 'EDIT_MENU';

    return ctx.reply(
      'Что редактировать?',
      Markup.keyboard([
        ['📝 Название', '📄 Описание'],
        ['🖼 Фото'],
        ['⬅️ Назад']
      ]).resize()
    );
  }

  if (s.step === 'EDIT_MENU') {
    s.editField = ctx.message.text;
    s.step = 'EDIT_VALUE';

    return ctx.reply('Введите новое значение:');
  }

  if (s.step === 'EDIT_VALUE') {
    const catalog = loadCatalog(s.catalog);
    const item = catalog.items.find(i => i.id === s.itemId);

    if (s.editField === '📝 Название') item.name = ctx.message.text;
    if (s.editField === '📄 Описание') item.description = ctx.message.text;

    saveCatalog(s.catalog, catalog);
    delete state[ctx.from.id];

    return ctx.reply('✅ Товар обновлён', Markup.removeKeyboard());
  }
});
bot.hears('✏️ Переименовать каталог', ctx => {
  if (!isAdmin(ctx.from.id)) return;
  state[ctx.from.id] = { step: 'RENAME_CAT' };
  ctx.reply('Номер каталога (1–4):');
});

bot.on('text', ctx => {
  const s = state[ctx.from.id];
  if (!s) return;

  if (s.step === 'RENAME_CAT') {
    s.catalog = Number(ctx.message.text);
    s.step = 'RENAME_VALUE';
    return ctx.reply('Новое название каталога:');
  }

  if (s.step === 'RENAME_VALUE') {
    const catalog = loadCatalog(s.catalog);
    catalog.name = ctx.message.text;
    saveCatalog(s.catalog, catalog);
    delete state[ctx.from.id];
    ctx.reply('✅ Каталог переименован');
  }
});
bot.hears('⬅️ Назад', ctx => {
  delete state[ctx.from.id];
  ctx.reply('Главное меню', Markup.removeKeyboard());
});


/* ===== TEXT ===== */
bot.on('text', ctx => {
  const s = state[ctx.from.id];
  if (!s) return;
  const text = ctx.message.text;

  /* ADMIN */
  if (text === '👑 Назначить админа' && isSuper(ctx.from.id)) {
    s.step = 'SET_ADMIN';
    return ctx.reply('ID пользователя:');
  }

  if (s.step === 'SET_ADMIN') {
    const roles = loadRoles();
    roles[text] = 'admin';
    saveRoles(roles);
    delete state[ctx.from.id];
    return ctx.reply('✅ Админ назначен');
  }

  /* ADD PRODUCT */
  if (text === '➕ Добавить товар') {
    s.step = 'ADD_CAT';
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
    if (text === '✅ Да') {
      s.step = 'ADD_VAR_TYPE';
      return ctx.reply('Тип вариации:');
    }
    if (text === '❌ Нет') {
      const cat = loadCatalog(s.catalog);
      cat.items.push({
        id: Date.now().toString(),
        name: s.name,
        description: s.description,
        image: s.image,
        subcategories: s.vars
      });
      saveCatalog(s.catalog, cat);
      delete state[ctx.from.id];
      return ctx.reply('✅ Товар добавлен', Markup.removeKeyboard());
    }
  }

  /* DELETE */
 bot.hears('🗑 Удалить товар', ctx => {
  if (!isAdmin(ctx.from.id)) return;

  state[ctx.from.id] = { step: 'DEL_CAT' };
  ctx.reply('Каталог (1–4):');
});

bot.on('text', ctx => {
  const s = state[ctx.from.id];
  if (!s) return;

  if (s.step === 'DEL_CAT') {
    s.catalog = Number(ctx.message.text);
    const catalog = loadCatalog(s.catalog);

    if (!catalog.items.length) {
      delete state[ctx.from.id];
      return ctx.reply('❌ Каталог пуст');
    }

    s.step = 'DEL_ITEM';

    return ctx.reply(
      'Выберите товар для удаления:',
      Markup.keyboard(
        catalog.items.map(i => [i.name]).concat([['⬅️ Назад']])
      ).resize()
    );
  }

  if (s.step === 'DEL_ITEM') {
    const catalog = loadCatalog(s.catalog);
    catalog.items = catalog.items.filter(i => i.name !== ctx.message.text);
    saveCatalog(s.catalog, catalog);

    delete state[ctx.from.id];
    ctx.reply('🗑 Товар удалён', Markup.removeKeyboard());
  }
});


/* ===== PHOTO ===== */
bot.on('photo', ctx => {
  const s = state[ctx.from.id];
  if (!s) return;

  const fileId = ctx.message.photo.at(-1).file_id;

  if (s.step === 'ADD_ITEM_IMAGE') {
    s.image = fileId;
    s.vars = [];
    s.step = 'ADD_VAR_TYPE';
    return ctx.reply('Тип вариации:');
  }

  if (s.step === 'ADD_VAR_IMAGE') {
    s.vars.push({
      type: s.varType,
      price: s.varPrice,
      image: fileId
    });
    s.step = 'ADD_MORE_VAR';
    return ctx.reply(
      'Добавить ещё вариацию?',
      Markup.keyboard([['✅ Да','❌ Нет']]).resize()
    );
  }
});

/* ===== RUN ===== */
app.listen(PORT, () => console.log('🚀 Server started'));
bot.launch();
console.log('🤖 Bot started');
