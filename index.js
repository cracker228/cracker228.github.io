require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = String(process.env.ADMIN_CHAT_ID);
const RENDER_URL = 'https://cracker228-github-io.onrender.com';

const bot = new Telegraf(BOT_TOKEN);
const app = express();
app.use(cors());
app.use(express.json());

/* ===================== GITHUB STORAGE ===================== */

const GH = {
  token: process.env.GITHUB_TOKEN,
  owner: process.env.GITHUB_OWNER,
  repo: process.env.GITHUB_REPO,
  branch: process.env.GITHUB_BRANCH || 'main'
};

const GH_API = `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/api`;

async function ghRead(file) {
  const res = await fetch(`${GH_API}/${file}`, {
    headers: { Authorization: `token ${GH.token}` }
  });
  if (!res.ok) throw new Error('GitHub read error');
  const data = await res.json();
  return JSON.parse(Buffer.from(data.content, 'base64').toString());
}

async function ghWrite(file, json, message) {
  let sha;
  const existing = await fetch(`${GH_API}/${file}`, {
    headers: { Authorization: `token ${GH.token}` }
  });
  if (existing.ok) sha = (await existing.json()).sha;

  const res = await fetch(`${GH_API}/${file}`, {
    method: 'PUT',
    headers: {
      Authorization: `token ${GH.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message,
      content: Buffer.from(JSON.stringify(json, null, 2)).toString('base64'),
      sha,
      branch: GH.branch
    })
  });

  if (!res.ok) throw new Error('GitHub write error');
}

const loadCatalog = (n) => ghRead(`catalog${n}.json`);
const saveCatalog = (n, d) => ghWrite(`catalog${n}.json`, d, 'update catalog');

const loadRoles = async () => {
  try {
    return await ghRead('roles.json');
  } catch {
    return { [ADMIN_CHAT_ID]: 'superadmin' };
  }
};
const saveRoles = (r) => ghWrite('roles.json', r, 'update roles');

/* ===================== ROLES ===================== */

async function getUserRole(id) {
  const roles = await loadRoles();
  return roles[String(id)] || null;
}
async function hasAdmin(id) {
  const r = await getUserRole(id);
  return r === 'admin' || r === 'superadmin';
}
async function hasSuperAdmin(id) {
  return (await getUserRole(id)) === 'superadmin';
}

/* ===================== API ===================== */

app.post('/order', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).send('No message');
  const roles = await loadRoles();
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
    res.status(404).send('Not found');
  }
});

/* ===================== BOT ===================== */

bot.start(ctx => {
  ctx.reply('Добро пожаловать!', {
    reply_markup: {
      inline_keyboard: [[
        { text: '🛍️ Открыть магазин', web_app: { url: 'https://cracker228.github.io/' } }
      ]]
    }
  });
});

const state = {};

function resetState(id) {
  delete state[id];
}

bot.command('admin', async ctx => {
  if (!(await hasAdmin(ctx.from.id))) return ctx.reply('🚫 Нет доступа');
  resetState(ctx.from.id);
  ctx.reply('🔐 Админка', Markup.keyboard([
    ['➕ Добавить товар'],
    ['🗑 Удалить'],
    ['⬅️ Назад']
  ]).resize());
});

/* ===================== ADD PRODUCT ===================== */

bot.hears('➕ Добавить товар', async ctx => {
  if (!(await hasAdmin(ctx.from.id))) return;
  state[ctx.from.id] = { step: 'CATALOG' };
  ctx.reply('Каталог (1–4):');
});

bot.on('text', async ctx => {
  const s = state[ctx.from.id];
  if (!s) return;
  const text = ctx.message.text.trim();

  if (s.step === 'CATALOG') {
    const cat = Number(text);
    if (cat < 1 || cat > 4) return ctx.reply('❌ 1–4');
    state[ctx.from.id] = { step: 'NAME', cat };
    return ctx.reply('Название:');
  }

  if (s.step === 'NAME') {
    state[ctx.from.id] = { ...s, step: 'DESC', name: text };
    return ctx.reply('Описание:');
  }

  if (s.step === 'DESC') {
    state[ctx.from.id] = { ...s, step: 'TYPE', desc: text, variants: [] };
    return ctx.reply('Тип:');
  }

  if (s.step === 'TYPE') {
    state[ctx.from.id] = { ...s, step: 'PRICE', curType: text };
    return ctx.reply('Цена:');
  }

  if (s.step === 'PRICE') {
    const price = Number(text);
    if (price <= 0) return ctx.reply('❌ Цена');
    state[ctx.from.id] = { ...s, step: 'PHOTO', curPrice: price };
    return ctx.reply('Фото или "нет":');
  }

  if (s.step === 'PHOTO' && text.toLowerCase() === 'нет') {
    s.variants.push({ type: s.curType, price: s.curPrice, image: null });
    state[ctx.from.id] = { ...s, step: 'MORE' };
    return ctx.reply('Ещё?', Markup.keyboard([['✅ Да', '❌ Нет']]).oneTime());
  }

  if (s.step === 'MORE') {
    if (text === '✅ Да') {
      state[ctx.from.id] = { ...s, step: 'TYPE' };
      return ctx.reply('Тип:');
    }
    if (text === '❌ Нет') {
      const data = await loadCatalog(s.cat);
      data.items.push({
        id: Date.now().toString(),
        name: s.name,
        description: s.desc,
        subcategories: s.variants
      });
      await saveCatalog(s.cat, data);
      resetState(ctx.from.id);
      return ctx.reply('✅ Добавлено', Markup.removeKeyboard());
    }
  }
});

bot.on('photo', async ctx => {
  const s = state[ctx.from.id];
  if (!s || s.step !== 'PHOTO') return;
  const fileId = ctx.message.photo.at(-1).file_id;
  s.variants.push({ type: s.curType, price: s.curPrice, image: fileId });
  state[ctx.from.id] = { ...s, step: 'MORE' };
  ctx.reply('Ещё?', Markup.keyboard([['✅ Да', '❌ Нет']]).oneTime());
});

/* ===================== START ===================== */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server: ${RENDER_URL}`));
const WEBHOOK_URL = 'https://cracker228-github-io.onrender.com';

bot.telegram.setWebhook(`${WEBHOOK_URL}/bot${BOT_TOKEN}`);

app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});
console.log('🤖 Bot started');
