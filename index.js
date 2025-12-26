require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = Number(process.env.ADMIN_CHAT_ID);
const PORT = process.env.PORT || 3000;
const WEBAPP_URL = 'https://cracker228.github.io';

const bot = new Telegraf(BOT_TOKEN);
const app = express();
app.use(cors());
app.use(express.json());

/* ================= FILES ================= */
const DATA_DIR = path.join(__dirname, 'catalogs');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const catalogPath = id => path.join(DATA_DIR, `catalog${id}.json`);
const loadCatalog = id =>
  fs.existsSync(catalogPath(id))
    ? JSON.parse(fs.readFileSync(catalogPath(id)))
    : { name: `Каталог ${id}`, items: [] };

const saveCatalog = (id, data) =>
  fs.writeFileSync(catalogPath(id), JSON.stringify(data, null, 2));

/* ================= API ================= */
app.get('/api/catalog/:id', (req, res) => {
  const id = Number(req.params.id);
  res.json(loadCatalog(id));
});

app.get('/tg-image/:fileId', async (req, res) => {
  const link = await bot.telegram.getFileLink(req.params.fileId);
  res.redirect(link.href);
});

app.post('/order', async (req, res) => {
  const { phone, address, items, total } = req.body;
  let text = `📦 ЗАКАЗ\n📞 ${phone}\n🏠 ${address}\n\n`;

  items.forEach(i => {
    text += `• ${i.name} (${i.type}) — ${i.price} ₽\n`;
  });

  text += `\n💰 Итого: ${total} ₽`;
  await bot.telegram.sendMessage(ADMIN_CHAT_ID, text);
  res.sendStatus(200);
});

/* ================= BOT ================= */
const state = {};

bot.start(ctx => {
  ctx.reply(
    '🛍 Магазин',
    Markup.inlineKeyboard([
      Markup.button.webApp('Открыть магазин', WEBAPP_URL)
    ])
  );
});

bot.command('admin', ctx => {
  if (ctx.from.id !== ADMIN_CHAT_ID) return;
  state[ctx.from.id] = {};
  ctx.reply(
    '⚙️ Админка',
    Markup.keyboard([
      ['➕ Добавить товар'],
      ['✏️ Редактировать товар'],
      ['🗑 Удалить товар'],
      ['✏️ Переименовать каталог'],
      ['⬅️ Назад']
    ]).resize()
  );
});

/* ========== ADD PRODUCT ========== */
bot.hears('➕ Добавить товар', ctx => {
  state[ctx.from.id] = { step: 'ADD_CAT' };
  ctx.reply('Каталог (1–4):');
});

bot.on('photo', ctx => {
  const s = state[ctx.from.id];
  if (!s) return;
  const fileId = ctx.message.photo.at(-1).file_id;

  if (s.step === 'ADD_IMAGE') {
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
    s.step = 'ADD_MORE';
    return ctx.reply(
      'Добавить ещё вариацию?',
      Markup.keyboard([['✅ Да', '❌ Нет']]).resize()
    );
  }
});

bot.on('text', ctx => {
  const s = state[ctx.from.id];
  if (!s) return;
  const t = ctx.message.text;

  if (s.step === 'ADD_CAT') {
    s.catalog = Number(t);
    s.step = 'ADD_NAME';
    return ctx.reply('Название товара:');
  }

  if (s.step === 'ADD_NAME') {
    s.name = t;
    s.step = 'ADD_DESC';
    return ctx.reply('Описание:');
  }

  if (s.step === 'ADD_DESC') {
    s.desc = t;
    s.step = 'ADD_IMAGE';
    return ctx.reply('📸 Фото товара:');
  }

  if (s.step === 'ADD_VAR_TYPE') {
    s.varType = t;
    s.step = 'ADD_VAR_PRICE';
    return ctx.reply('Цена:');
  }

  if (s.step === 'ADD_VAR_PRICE') {
    s.varPrice = Number(t);
    s.step = 'ADD_VAR_IMAGE';
    return ctx.reply('📸 Фото вариации:');
  }

  if (s.step === 'ADD_MORE') {
    if (t === '✅ Да') {
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
  }
});

/* ========== DELETE ========== */
bot.hears('🗑 Удалить товар', ctx => {
  state[ctx.from.id] = { step: 'DEL_CAT' };
  ctx.reply('Каталог (1–4):');
});

bot.on('text', ctx => {
  const s = state[ctx.from.id];
  if (!s) return;

  if (s.step === 'DEL_CAT') {
    s.catalog = Number(ctx.message.text);
    const cat = loadCatalog(s.catalog);
    if (!cat.items.length) return ctx.reply('❌ Каталог пуст');

    s.step = 'DEL_ITEM';
    return ctx.reply(
      'Выберите товар:',
      Markup.keyboard(cat.items.map(i => [i.name])).resize()
    );
  }

  if (s.step === 'DEL_ITEM') {
    const cat = loadCatalog(s.catalog);
    cat.items = cat.items.filter(i => i.name !== ctx.message.text);
    saveCatalog(s.catalog, cat);
    delete state[ctx.from.id];
    return ctx.reply('🗑 Удалено', Markup.removeKeyboard());
  }
});

/* ========== RENAME CAT ========== */
bot.hears('✏️ Переименовать каталог', ctx => {
  state[ctx.from.id] = { step: 'REN_CAT' };
  ctx.reply('Номер каталога (1–4):');
});

bot.on('text', ctx => {
  const s = state[ctx.from.id];
  if (!s) return;

  if (s.step === 'REN_CAT') {
    s.catalog = Number(ctx.message.text);
    s.step = 'REN_NAME';
    return ctx.reply('Новое название:');
  }

  if (s.step === 'REN_NAME') {
    const cat = loadCatalog(s.catalog);
    cat.name = ctx.message.text;
    saveCatalog(s.catalog, cat);
    delete state[ctx.from.id];
    return ctx.reply('✅ Готово');
  }
});

bot.hears('⬅️ Назад', ctx => {
  delete state[ctx.from.id];
  ctx.reply('Ок', Markup.removeKeyboard());
});

/* ================= RUN ================= */
app.listen(PORT, () => console.log('API OK'));
bot.launch();
