require('dotenv').config();
const { Telegraf } = require('telegraf');
const Markup = require('telegraf/markup');
const express = require('express');
const fetch = require('node-fetch');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();
app.use(express.json());

/* ================= GITHUB STORAGE ================= */

const GH = {
  token: process.env.GITHUB_TOKEN,
  owner: process.env.GITHUB_OWNER,
  repo: process.env.GITHUB_REPO,
  branch: process.env.GITHUB_BRANCH || 'main'
};

const GH_API = `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/api`;

async function ghGet(path) {
  const res = await fetch(`${GH_API}/${path}`, {
    headers: { Authorization: `token ${GH.token}` }
  });
  if (!res.ok) throw new Error('GitHub read error');
  const data = await res.json();
  return JSON.parse(Buffer.from(data.content, 'base64').toString());
}

async function ghPut(path, content, message) {
  let sha = null;
  try {
    const res = await fetch(`${GH_API}/${path}`, {
      headers: { Authorization: `token ${GH.token}` }
    });
    if (res.ok) sha = (await res.json()).sha;
  } catch {}

  const res = await fetch(`${GH_API}/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `token ${GH.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message,
      content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
      branch: GH.branch,
      sha
    })
  });

  if (!res.ok) throw new Error('GitHub write error');
}

async function loadCatalog(cat) {
  try {
    return await ghGet(`catalog${cat}.json`);
  } catch {
    return { name: `Каталог ${cat}`, items: [] };
  }
}

async function saveCatalog(cat, data) {
  await ghPut(`catalog${cat}.json`, data, 'update catalog');
}

/* ================= ROLES (В ПАМЯТИ) ================= */

const roles = {
  [process.env.ADMIN_CHAT_ID]: 'superadmin'
};

function getUserRole(id) {
  return roles[id] || null;
}
function hasAdminAccess(id) {
  return ['admin', 'superadmin'].includes(getUserRole(id));
}
function hasSuperAdminAccess(id) {
  return getUserRole(id) === 'superadmin';
}

/* ================= API ================= */

app.post('/order', async (req, res) => {
  const { message } = req.body;
  for (const id in roles) {
    if (roles[id] !== 'courier') {
      await bot.telegram.sendMessage(id, message);
    }
  }
  res.send('OK');
});

app.get('/tg-image/:fileId', async (req, res) => {
  try {
    const link = await bot.telegram.getFileLink(req.params.fileId);
    res.redirect(link.href);
  } catch {
    res.status(404).send('no image');
  }
});

/* ================= BOT ================= */

bot.start(ctx => {
  ctx.reply('Добро пожаловать!', {
    reply_markup: {
      inline_keyboard: [[
        { text: '🛍️ Открыть магазин', web_app: { url: 'https://cracker228.github.io/' } }
      ]]
    }
  });
});

const userState = {};

bot.command('admin', ctx => {
  if (!hasAdminAccess(ctx.from.id)) return ctx.reply('🚫 Нет доступа');
  ctx.reply('Админка', Markup.keyboard([
    ['➕ Добавить товар'],
    ['🗑 Удалить'],
    ['⬅️ Назад']
  ]).resize());
});

bot.hears('➕ Добавить товар', ctx => {
  userState[ctx.from.id] = { step: 'CATALOG' };
  ctx.reply('Каталог (1–4):');
});

bot.on('text', async ctx => {
  const s = userState[ctx.from.id];
  if (!s) return;
  const text = ctx.message.text.trim();

  if (s.step === 'CATALOG') {
    s.catalog = Number(text);
    s.step = 'NAME';
    return ctx.reply('Название товара:');
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
    s.price = Number(text);
    s.step = 'PHOTO';
    return ctx.reply('Фото или "нет":');
  }

  if (s.step === 'PHOTO' && text.toLowerCase() === 'нет') {
    const data = await loadCatalog(s.catalog);
    data.items.push({
      id: Date.now().toString(),
      name: s.name,
      description: s.desc,
      subcategories: [{ type: s.type, price: s.price, image: null }]
    });
    await saveCatalog(s.catalog, data);
    delete userState[ctx.from.id];
    return ctx.reply('✅ Товар добавлен');
  }
});

bot.on('photo', async ctx => {
  const s = userState[ctx.from.id];
  if (!s || s.step !== 'PHOTO') return;

  const fileId = ctx.message.photo.at(-1).file_id;
  const data = await loadCatalog(s.catalog);

  data.items.push({
    id: Date.now().toString(),
    name: s.name,
    description: s.desc,
    subcategories: [{ type: s.type, price: s.price, image: fileId }]
  });

  await saveCatalog(s.catalog, data);
  delete userState[ctx.from.id];
  ctx.reply('✅ Товар с фото добавлен');
});

/* ================= START ================= */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('HTTP OK'));
bot.launch();
console.log('BOT OK');
