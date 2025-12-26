const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

const bot = new Telegraf(process.env.BOT_TOKEN);

/* ===== FILES ===== */
const ADMINS_FILE = './admins.json';
const CATALOG_DIR = './catalogs';
if (!fs.existsSync(CATALOG_DIR)) fs.mkdirSync(CATALOG_DIR);

const state = {};

/* ===== HELPERS ===== */
function loadAdmins() {
  if (!fs.existsSync(ADMINS_FILE)) fs.writeFileSync(ADMINS_FILE, '[]');
  return JSON.parse(fs.readFileSync(ADMINS_FILE));
}

function isAdmin(id) {
  return loadAdmins().includes(id);
}

function catalogPath(id) {
  return path.join(CATALOG_DIR, `catalog${id}.json`);
}

function loadCatalog(id) {
  const p = catalogPath(id);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(
      p,
      JSON.stringify({ name: `Каталог ${id}`, items: [] }, null, 2)
    );
  }
  return JSON.parse(fs.readFileSync(p));
}

function saveCatalog(id, data) {
  fs.writeFileSync(catalogPath(id), JSON.stringify(data, null, 2));
}

/* ===== START ===== */
bot.start(ctx => {
  if (!isAdmin(ctx.from.id)) return ctx.reply('⛔ Нет доступа');

  ctx.reply(
    '⚙️ Админка',
    Markup.keyboard([
      ['➕ Добавить товар'],
      ['🗑 Удалить товар'],
      ['✏️ Переименовать каталог'],
      ['⬅️ Выход']
    ]).resize()
  );
});

/* ===== BUTTONS ===== */
bot.hears('⬅️ Выход', ctx => {
  delete state[ctx.from.id];
  ctx.reply('Ок', Markup.removeKeyboard());
});

bot.hears('➕ Добавить товар', ctx => {
  if (!isAdmin(ctx.from.id)) return;
  state[ctx.from.id] = { step: 'ADD_CAT', vars: [] };
  ctx.reply('Номер каталога (1–4):');
});

bot.hears('🗑 Удалить товар', ctx => {
  if (!isAdmin(ctx.from.id)) return;
  state[ctx.from.id] = { step: 'DEL_CAT' };
  ctx.reply('Номер каталога (1–4):');
});

bot.hears('✏️ Переименовать каталог', ctx => {
  if (!isAdmin(ctx.from.id)) return;
  state[ctx.from.id] = { step: 'REN_CAT' };
  ctx.reply('Номер каталога (1–4):');
});

/* ===== TEXT LOGIC ===== */
bot.on('text', ctx => {
  if (!isAdmin(ctx.from.id)) return;
  const s = state[ctx.from.id];
  if (!s) return;

  const t = ctx.message.text;

  switch (s.step) {

    /* === ADD PRODUCT === */
    case 'ADD_CAT':
      s.catalog = Number(t);
      s.vars = [];
      s.step = 'ADD_NAME';
      return ctx.reply('Название товара:');

    case 'ADD_NAME':
      s.name = t;
      s.step = 'ADD_DESC';
      return ctx.reply('Описание товара:');

    case 'ADD_DESC':
      s.desc = t;
      s.step = 'ADD_IMAGE';
      return ctx.reply('📸 Фото товара:');

    case 'ADD_VAR_TYPE':
      s.varType = t;
      s.step = 'ADD_VAR_PRICE';
      return ctx.reply('Цена вариации:');

    case 'ADD_VAR_PRICE':
      s.varPrice = Number(t);
      s.step = 'ADD_VAR_IMAGE';
      return ctx.reply('📸 Фото вариации:');

    case 'ADD_MORE':
      if (t === '➕ Добавить ещё') {
        s.step = 'ADD_VAR_TYPE';
        return ctx.reply('Тип вариации:');
      }

      const cat = loadCatalog(s.catalog);
      cat.items.push({
        id: Date.now().toString(),
        name: s.name,
        description: s.desc,
        image: s.image,
        subcategories: s.vars
      });
      saveCatalog(s.catalog, cat);
      delete state[ctx.from.id];
      return ctx.reply('✅ Товар добавлен', Markup.removeKeyboard());

    /* === DELETE PRODUCT === */
    case 'DEL_CAT':
      s.catalog = Number(t);
      const dc = loadCatalog(s.catalog);

      if (!dc.items.length) {
        delete state[ctx.from.id];
        return ctx.reply('❌ Каталог пуст', Markup.removeKeyboard());
      }

      s.step = 'DEL_ITEM';
      return ctx.reply(
        'Выберите товар:',
        Markup.keyboard(dc.items.map(i => [i.name])).resize()
      );

    case 'DEL_ITEM':
      const dcat = loadCatalog(s.catalog);
      dcat.items = dcat.items.filter(i => i.name !== t);
      saveCatalog(s.catalog, dcat);
      delete state[ctx.from.id];
      return ctx.reply('🗑 Товар удалён', Markup.removeKeyboard());

    /* === RENAME CATALOG === */
    case 'REN_CAT':
      s.catalog = Number(t);
      s.step = 'REN_NAME';
      return ctx.reply('Новое название каталога:');

    case 'REN_NAME':
      const rc = loadCatalog(s.catalog);
      rc.name = t;
      saveCatalog(s.catalog, rc);
      delete state[ctx.from.id];
      return ctx.reply('✅ Каталог переименован', Markup.removeKeyboard());

    default:
      delete state[ctx.from.id];
      return;
  }
});

/* ===== PHOTO LOGIC ===== */
bot.on('photo', ctx => {
  const s = state[ctx.from.id];
  if (!s) return;

  const fileId = ctx.message.photo.at(-1).file_id;

  if (s.step === 'ADD_IMAGE') {
    s.image = fileId;
    s.step = 'ADD_VAR_TYPE';
    return ctx.reply('Тип вариации:');
  }

  if (s.step === 'ADD_VAR_IMAGE') {
    s.vars.push({
      type: s.varType,
      price: s.varPrice,
      image: fileId
    });

    s.step = 'ADD_MORE';
    return ctx.reply(
      'Добавить ещё вариацию?',
      Markup.keyboard([['➕ Добавить ещё'], ['✅ Завершить']]).resize()
    );
  }
});

/* ===== LAUNCH ===== */
bot.launch();
process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());
