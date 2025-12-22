require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = 'https://cracker228-github-io.onrender.com';

const bot = new Telegraf(BOT_TOKEN);
const app = express();
app.use(cors());
app.use(express.json());

/* ================= GITHUB ================= */

const GH = {
  token: process.env.GITHUB_TOKEN,
  owner: process.env.GITHUB_OWNER,
  repo: process.env.GITHUB_REPO,
  branch: 'main'
};

const GH_API = `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/api`;

async function ghRead(file) {
  const r = await fetch(`${GH_API}/${file}`, {
    headers: { Authorization: `token ${GH.token}` }
  });
  if (!r.ok) throw new Error('read error');
  const j = await r.json();
  return JSON.parse(Buffer.from(j.content, 'base64').toString());
}

async function ghWrite(file, data, msg) {
  let sha;
  const r = await fetch(`${GH_API}/${file}`, {
    headers: { Authorization: `token ${GH.token}` }
  });
  if (r.ok) sha = (await r.json()).sha;

  await fetch(`${GH_API}/${file}`, {
    method: 'PUT',
    headers: {
      Authorization: `token ${GH.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: msg,
      content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
      sha,
      branch: GH.branch
    })
  });
}

const loadCatalog = (n) => ghRead(`catalog${n}.json`);
const saveCatalog = (n, d) => ghWrite(`catalog${n}.json`, d, 'update catalog');
const loadRoles = () => ghRead('roles.json');
const saveRoles = (r) => ghWrite('roles.json', r, 'update roles');

/* ================= ROLES ================= */

async function isAdmin(id) {
  const r = await loadRoles();
  return ['admin','superadmin'].includes(r[id]);
}
async function isSuper(id) {
  const r = await loadRoles();
  return r[id] === 'superadmin';
}

/* ================= BOT ================= */

bot.start(ctx => {
  ctx.reply(
    'Магазин:',
    Markup.inlineKeyboard([
      Markup.button.webApp(
        '🛍 Открыть магазин',
        'https://cracker228.github.io/'
      )
    ])
  );
});


const state = {};
const reset = id => delete state[id];

/* ================= ADMIN MENU ================= */

bot.command('admin', async ctx => {
  if (!(await isAdmin(ctx.from.id))) return ctx.reply('🚫 Нет доступа');

  const roles = await loadRoles();
  const role = roles[ctx.from.id];

  const kb = [
    ['➕ Добавить товар'],
    ['✏️ Редактировать товар'],
    ['🗑 Удалить товар']
  ];

  if (role === 'superadmin') kb.push(['👥 Назначить админа']);
  kb.push(['⬅️ Назад']);

  reset(ctx.from.id);
  ctx.reply('🔐 Админка', Markup.keyboard(kb).resize());
});

/* ================= HEARS ================= */

bot.hears('👥 Назначить админа', async ctx => {
  if (!(await isSuper(ctx.from.id))) return;
  state[ctx.from.id] = { step: 'SET_ADMIN' };
  ctx.reply('ID пользователя:');
});

bot.hears('➕ Добавить товар', async ctx => {
  if (!(await isAdmin(ctx.from.id))) return;
  state[ctx.from.id] = { step: 'ADD_CAT', vars: [] };
  ctx.reply('Каталог (1–4):');
});

bot.hears('🗑 Удалить товар', async ctx => {
  if (!(await isAdmin(ctx.from.id))) return;
  state[ctx.from.id] = { step: 'DEL_CAT' };
  ctx.reply('Каталог (1–4):');
});

bot.hears('✏️ Редактировать товар', async ctx => {
  if (!(await isAdmin(ctx.from.id))) return;
  state[ctx.from.id] = { step: 'EDIT_CAT' };
  ctx.reply('Каталог (1–4):');
});

/* ================= TEXT FLOW ================= */

bot.on('text', async ctx => {
  const s = state[ctx.from.id];
  if (!s) return;
  const t = ctx.message.text;

  /* === SET ADMIN === */
  if (s.step === 'SET_ADMIN') {
    const roles = await loadRoles();
    roles[t] = 'admin';
    await saveRoles(roles);
    reset(ctx.from.id);
    return ctx.reply('✅ Админ назначен', Markup.removeKeyboard());
  }

  /* === ADD PRODUCT === */
  if (s.step === 'ADD_CAT') {
    s.cat = +t; s.step = 'ADD_NAME';
    return ctx.reply('Название:');
  }
  if (s.step === 'ADD_NAME') {
    s.name = t; s.step = 'ADD_DESC';
    return ctx.reply('Описание:');
  }
  if (s.step === 'ADD_DESC') {
    s.desc = t; s.step = 'ADD_VAR_NAME';
    return ctx.reply('Вариация:');
  }
  if (s.step === 'ADD_VAR_NAME') {
    s.varName = t; s.step = 'ADD_VAR_PRICE';
    return ctx.reply('Цена:');
  }
  if (s.step === 'ADD_VAR_PRICE') {
    s.varPrice = +t; s.step = 'ADD_VAR_IMAGE';
    return ctx.reply('Фото или "нет":');
  }
  if (s.step === 'ADD_VAR_IMAGE' && t === 'нет') {
    s.vars.push({
      id: Date.now().toString(),
      type: s.varName,
      price: s.varPrice,
      image: null
    });
    s.step = 'ADD_MORE';
    return ctx.reply('Ещё?', Markup.keyboard([['да','нет']]).oneTime());
  }
  if (s.step === 'ADD_MORE' && t === 'нет') {
    const c = await loadCatalog(s.cat);
    c.items.push({
      id: Date.now().toString(),
      name: s.name,
      description: s.desc,
      subcategories: s.vars
    });
    await saveCatalog(s.cat, c);
    reset(ctx.from.id);
    return ctx.reply('✅ Товар добавлен', Markup.removeKeyboard());
  }
});

/* ================= PHOTO ================= */

bot.on('photo', ctx => {
  const s = state[ctx.from.id];
  if (!s) return;
  const fileId = ctx.message.photo.at(-1).file_id;

  if (s.step === 'ADD_VAR_IMAGE') {
    s.vars.push({
      id: Date.now().toString(),
      type: s.varName,
      price: s.varPrice,
      image: fileId
    });
    s.step = 'ADD_MORE';
    ctx.reply('Ещё?', Markup.keyboard([['да','нет']]).oneTime());
  }
});

/* ================= WEBHOOK ================= */

bot.telegram.setWebhook(`${WEBHOOK_URL}/bot${BOT_TOKEN}`);
app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('OK'));
