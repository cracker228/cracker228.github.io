const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

if (!process.env.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is not defined');
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);

/* ================== ДАННЫЕ ================== */
const ADMINS_FILE = './admins.json';
const CATALOG_DIR = './catalogs';
const state = {};

if (!fs.existsSync(CATALOG_DIR)) {
  fs.mkdirSync(CATALOG_DIR, { recursive: true });
}

/* ================== HELPERS ================== */
function loadAdmins() {
  if (!fs.existsSync(ADMINS_FILE)) {
    const root = process.env.ADMIN_CHAT_ID
      ? [Number(process.env.ADMIN_CHAT_ID)]
      : [];
    fs.writeFileSync(ADMINS_FILE, JSON.stringify(root, null, 2));
  }
  return JSON.parse(fs.readFileSync(ADMINS_FILE));
}

function isAdmin(id) {
  return loadAdmins().includes(id);
}

function catPath(id) {
  return path.join(CATALOG_DIR, `catalog${id}.json`);
}

function loadCatalog(id) {
  const p = catPath(id);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, JSON.stringify({ name: `Каталог ${id}`, items: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(p));
}

function saveCatalog(id, data) {
  fs.writeFileSync(catPath(id), JSON.stringify(data, null, 2));
}

/* ================== START ================== */
bot.start(ctx => {
  if (!isAdmin(ctx.from.id)) return ctx.reply('⛔ Нет доступа');

  ctx.reply(
    '⚙️ Админка',
    Markup.keyboard([
      ['➕ Добавить товар', '🗑 Удалить товар'],
      ['✏️ Переименовать каталог']
    ]).resize()
  );
});

/* ================== BUTTONS ================== */
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

/* ================== TEXT ================== */
bot.on('text', ctx => {
  if (!isAdmin(ctx.from.id)) return;
  const s = state[ctx.from.id];
  if (!s) return;

  const t = ctx.message.text;

  switch (s.step) {

    case 'ADD_CAT': {
      const n = Number(t);
      if (![1,2,3,4].includes(n)) return ctx.reply('❌ 1–4');
      s.catalog = n;
      s.step = 'ADD_NAME';
      return ctx.reply('Название товара:');
    }

    case 'ADD_NAME':
      s.name = t;
      s.step = 'ADD_DESC';
      return ctx.reply('Описание:');

    case 'ADD_DESC':
      s.desc = t;
      s.step = 'ADD_IMAGE';
      return ctx.reply('📸 Фото товара:');

    case 'ADD_VAR_TYPE':
      s.varType = t;
      s.step = 'ADD_VAR_PRICE';
      return ctx.reply('Цена:');

    case 'ADD_VAR_PRICE':
      s.varPrice = Number(t);
      s.step = 'ADD_VAR_IMAGE';
      return ctx.reply('📸 Фото вариации:');

    case 'ADD_MORE':
      if (t === '➕ Добавить ещё') {
        s.step = 'ADD_VAR_TYPE';
        return ctx.reply('Тип вариации:');
      }

      if (t === '✅ Завершить') {
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
      }
      return;

    case 'DEL_CAT': {
      const n = Number(t);
      if (![1,2,3,4].includes(n)) return ctx.reply('❌ 1–4');
      s.catalog = n;
      const c = loadCatalog(n);
      if (!c.items.length) {
        delete state[ctx.from.id];
        return ctx.reply('Каталог пуст');
      }
      s.step = 'DEL_ITEM';
      return ctx.reply(
        'Выберите товар:',
        Markup.keyboard(c.items.map(i => [i.name])).resize()
      );
    }

    case 'DEL_ITEM': {
      const c = loadCatalog(s.catalog);
      c.items = c.items.filter(i => i.name !== t);
      saveCatalog(s.catalog, c);
      delete state[ctx.from.id];
      return ctx.reply('🗑 Удалено', Markup.removeKeyboard());
    }

    case 'REN_CAT': {
      const n = Number(t);
      if (![1,2,3,4].includes(n)) return ctx.reply('❌ 1–4');
      s.catalog = n;
      s.step = 'REN_NAME';
      return ctx.reply('Новое название:');
    }

    case 'REN_NAME': {
      const c = loadCatalog(s.catalog);
      c.name = t;
      saveCatalog(s.catalog, c);
      delete state[ctx.from.id];
      return ctx.reply('✅ Переименовано');
    }
  }
});

/* ================== PHOTO ================== */
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
      'Добавить ещё?',
      Markup.keyboard([['➕ Добавить ещё'], ['✅ Завершить']]).resize()
    );
  }
});
const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('OK');
});

app.listen(PORT, () => {
  console.log('🌐 HTTP server on port', PORT);
});


/* ================== LAUNCH ================== */
bot.launch();
console.log('✅ Bot launched');

process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());
