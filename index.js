require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const fs = require('fs');
const path = require('path');

/* ================== CONFIG ================== */
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_CHAT_ID);
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN missing');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();

/* ================== STORAGE ================== */
const DATA_DIR = path.join(__dirname, 'catalogs');
const ADMINS_FILE = path.join(__dirname, 'admins.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(ADMINS_FILE)) fs.writeFileSync(ADMINS_FILE, JSON.stringify([ADMIN_ID], null, 2));

const state = {};

/* ================== HELPERS ================== */
const loadAdmins = () => JSON.parse(fs.readFileSync(ADMINS_FILE));
const isAdmin = id => loadAdmins().includes(id);

const catPath = id => path.join(DATA_DIR, `catalog${id}.json`);
const loadCatalog = id => {
  if (!fs.existsSync(catPath(id))) {
    fs.writeFileSync(catPath(id), JSON.stringify({ name: `Каталог ${id}`, items: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(catPath(id)));
};
const saveCatalog = (id, data) =>
  fs.writeFileSync(catPath(id), JSON.stringify(data, null, 2));

/* ================== USER ================== */
bot.start(ctx => {
  ctx.reply(
    '🛍 Магазин',
    Markup.inlineKeyboard([
      Markup.button.webApp(
        'Открыть магазин',
        'https://cracker228-github-io.onrender.com'
      )
    ])
  );
});

/* ================== ADMIN ================== */
bot.command('admin', ctx => {
  if (!isAdmin(ctx.from.id)) return ctx.reply('⛔ Нет доступа');

  state[ctx.from.id] = {};
  ctx.reply(
    '⚙️ Админка',
    Markup.keyboard([
      ['➕ Добавить товар'],
      ['🗑 Удалить товар'],
      ['✏️ Переименовать каталог'],
      ['❌ Выход']
    ]).resize()
  );
});

bot.hears('❌ Выход', ctx => {
  delete state[ctx.from.id];
  ctx.reply('Выход', Markup.removeKeyboard());
});

/* ================== ADD PRODUCT ================== */
bot.hears('➕ Добавить товар', ctx => {
  if (!isAdmin(ctx.from.id)) return;
  state[ctx.from.id] = { step: 'CAT', vars: [] };
  ctx.reply('Номер каталога (1–4):');
});

bot.on('text', ctx => {
  if (!isAdmin(ctx.from.id)) return;
  const s = state[ctx.from.id];
  if (!s) return;

  const t = ctx.message.text;

  if (s.step === 'CAT') {
    s.cat = Number(t);
    s.step = 'NAME';
    return ctx.reply('Название товара:');
  }

  if (s.step === 'NAME') {
    s.name = t;
    s.step = 'DESC';
    return ctx.reply('Описание товара:');
  }

  if (s.step === 'DESC') {
    s.desc = t;
    s.step = 'IMG';
    return ctx.reply('📸 Фото товара:');
  }

  if (s.step === 'VAR_TYPE') {
    s.vType = t;
    s.step = 'VAR_PRICE';
    return ctx.reply('Цена вариации:');
  }

  if (s.step === 'VAR_PRICE') {
    s.vPrice = Number(t);
    s.step = 'VAR_IMG';
    return ctx.reply('📸 Фото вариации:');
  }

  if (s.step === 'MORE') {
    if (t === '➕ Ещё вариация') {
      s.step = 'VAR_TYPE';
      return ctx.reply('Тип вариации:');
    }

    const cat = loadCatalog(s.cat);
    cat.items.push({
      id: Date.now().toString(),
      name: s.name,
      description: s.desc,
      image: s.image,
      subcategories: s.vars
    });
    saveCatalog(s.cat, cat);
    delete state[ctx.from.id];
    return ctx.reply('✅ Товар добавлен', Markup.removeKeyboard());
  }
});

/* ================== PHOTOS ================== */
bot.on('photo', ctx => {
  const s = state[ctx.from.id];
  if (!s) return;

  const fileId = ctx.message.photo.at(-1).file_id;

  if (s.step === 'IMG') {
    s.image = fileId;
    s.step = 'VAR_TYPE';
    return ctx.reply('Тип вариации:');
  }

  if (s.step === 'VAR_IMG') {
    s.vars.push({
      type: s.vType,
      price: s.vPrice,
      image: fileId
    });
    s.step = 'MORE';
    return ctx.reply(
      'Добавить ещё?',
      Markup.keyboard([['➕ Ещё вариация'], ['✅ Завершить']]).resize()
    );
  }
});

/* ================== DELETE ================== */
bot.hears('🗑 Удалить товар', ctx => {
  if (!isAdmin(ctx.from.id)) return;
  state[ctx.from.id] = { step: 'DEL_CAT' };
  ctx.reply('Номер каталога (1–4):');
});

bot.on('text', ctx => {
  const s = state[ctx.from.id];
  if (!s || s.step !== 'DEL_CAT') return;

  s.cat = Number(ctx.message.text);
  const cat = loadCatalog(s.cat);

  if (!cat.items.length) {
    delete state[ctx.from.id];
    return ctx.reply('Каталог пуст');
  }

  s.step = 'DEL_ITEM';
  ctx.reply(
    'Выберите товар:',
    Markup.keyboard(cat.items.map(i => [i.name])).resize()
  );
});

bot.on('text', ctx => {
  const s = state[ctx.from.id];
  if (!s || s.step !== 'DEL_ITEM') return;

  const cat = loadCatalog(s.cat);
  cat.items = cat.items.filter(i => i.name !== ctx.message.text);
  saveCatalog(s.cat, cat);

  delete state[ctx.from.id];
  ctx.reply('🗑 Удалено', Markup.removeKeyboard());
});

/* ================== RENAME CATALOG ================== */
bot.hears('✏️ Переименовать каталог', ctx => {
  if (!isAdmin(ctx.from.id)) return;
  state[ctx.from.id] = { step: 'REN_CAT' };
  ctx.reply('Номер каталога (1–4):');
});

bot.on('text', ctx => {
  const s = state[ctx.from.id];
  if (!s || s.step !== 'REN_CAT') return;

  s.cat = Number(ctx.message.text);
  s.step = 'REN_NAME';
  ctx.reply('Новое название:');
});

bot.on('text', ctx => {
  const s = state[ctx.from.id];
  if (!s || s.step !== 'REN_NAME') return;

  const cat = loadCatalog(s.cat);
  cat.name = ctx.message.text;
  saveCatalog(s.cat, cat);

  delete state[ctx.from.id];
  ctx.reply('✅ Переименовано', Markup.removeKeyboard());
});

/* ================== IMAGE PROXY ================== */
app.get('/tg-image/:id', async (req, res) => {
  try {
    const link = await bot.telegram.getFileLink(req.params.id);
    res.redirect(link.href);
  } catch {
    res.sendStatus(404);
  }
});

/* ================== SERVER ================== */
app.get('/', (_, res) => res.send('OK'));
app.listen(PORT, () => console.log('🌐 HTTP OK'));

(async () => {
  await bot.telegram.deleteWebhook();
  await bot.launch();
  console.log('🤖 Bot launched');
})();

