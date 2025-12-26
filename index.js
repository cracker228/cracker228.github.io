require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const path = require('path');
const fs = require('fs');

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

/* ===== GITHUB CONFIG ===== */
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_OWNER || !GITHUB_REPO || !GITHUB_TOKEN) {
  console.error('❌ GitHub config missing');
  process.exit(1);
}

/* ===== FILES ===== */
const ADMINS_FILE = './admins.json';

// Создадим папку catalogs, если нет — для локального кэша (опционально)
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

// Асинхронная загрузка каталога с GitHub
async function loadCatalogFromGitHub(catalogId) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/catalogs/catalog${catalogId}.json`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
  };

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

    const data = await res.json();
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    return { sha: data.sha, content: JSON.parse(content) };
  } catch (err) {
    console.error('❌ Load catalog failed:', err.message);
    // Если файла нет — создаем дефолтный
    return {
      sha: null,
      content: { name: `Каталог ${catalogId}`, items: [] },
    };
  }
}

// Асинхронное сохранение каталога на GitHub
async function saveCatalogToGitHub(catalogId, data, sha) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/catalogs/catalog${catalogId}.json`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };

  const body = {
    message: `Update catalog${catalogId} via admin bot`,
    content: Buffer.from(JSON.stringify(data, null, 2), 'utf8').toString('base64'),
    branch: GITHUB_BRANCH,
  };

  if (sha) body.sha = sha;

  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    console.log(`✅ Catalog ${catalogId} saved to GitHub`);
    return true;
  } catch (err) {
    console.error('❌ Save catalog failed:', err.message);
    return false;
  }
}

// Обёртка: загрузка каталога (сначала пробуем GitHub, потом локальный fallback)
async function loadCatalog(catalogId) {
  const { sha, content } = await loadCatalogFromGitHub(catalogId);
  return { sha, catalog: content };
}

// Обёртка: сохранение каталога
async function saveCatalog(catalogId, data, sha) {
  return await saveCatalogToGitHub(catalogId, data, sha);
}

/* ===== START ===== */
bot.start(async ctx => {
  delete state[ctx.from.id]; // Очищаем состояние при старте
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
bot.on('text', async ctx => {
  if (!isAdmin(ctx.from.id)) return;
  const s = state[ctx.from.id];
  if (!s) return;

  const t = ctx.message.text;

  switch (s.step) {

    /* === ADD PRODUCT === */
    case 'ADD_CAT':
      s.catalog = Number(t);
      if (isNaN(s.catalog) || s.catalog < 1 || s.catalog > 4) {
        return ctx.reply('❌ Номер каталога должен быть от 1 до 4');
      }
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
      if (isNaN(s.varPrice)) {
        return ctx.reply('❌ Введите число');
      }
      s.step = 'ADD_VAR_IMAGE';
      return ctx.reply('📸 Фото вариации:');

    case 'ADD_MORE':
      if (t === '➕ Добавить ещё') {
        s.step = 'ADD_VAR_TYPE';
        return ctx.reply('Тип вариации:');
      }

      // Сохраняем товар
      const { sha, catalog } = await loadCatalog(s.catalog);
      catalog.items.push({
        id: Date.now().toString(),
        name: s.name,
        description: s.desc,
        image: s.image,
        subcategories: s.vars
      });

      const success = await saveCatalog(s.catalog, catalog, sha);
      if (success) {
        delete state[ctx.from.id];
        return ctx.reply('✅ Товар добавлен', Markup.removeKeyboard());
      } else {
        return ctx.reply('❌ Не удалось сохранить. Попробуйте позже.');
      }

    /* === DELETE PRODUCT === */
    case 'DEL_CAT':
      s.catalog = Number(t);
      if (isNaN(s.catalog) || s.catalog < 1 || s.catalog > 4) {
        return ctx.reply('❌ Номер каталога должен быть от 1 до 4');
      }

      const { sha: delSha, catalog: delCat } = await loadCatalog(s.catalog);

      if (!delCat.items.length) {
        delete state[ctx.from.id];
        return ctx.reply('❌ Каталог пуст', Markup.removeKeyboard());
      }

      s.step = 'DEL_ITEM';
      return ctx.reply(
        'Выберите товар:',
        Markup.keyboard(delCat.items.map(i => [i.name])).resize()
      );

    case 'DEL_ITEM':
      const { sha: dSha, catalog: dCat } = await loadCatalog(s.catalog);
      dCat.items = dCat.items.filter(i => i.name !== t);
      const delSuccess = await saveCatalog(s.catalog, dCat, dSha);

      if (delSuccess) {
        delete state[ctx.from.id];
        return ctx.reply('🗑 Товар удалён', Markup.removeKeyboard());
      } else {
        return ctx.reply('❌ Не удалось удалить. Попробуйте позже.');
      }

    /* === RENAME CATALOG === */
    case 'REN_CAT':
      s.catalog = Number(t);
      if (isNaN(s.catalog) || s.catalog < 1 || s.catalog > 4) {
        return ctx.reply('❌ Номер каталога должен быть от 1 до 4');
      }
      s.step = 'REN_NAME';
      return ctx.reply('Новое название каталога:');

    case 'REN_NAME':
      const { sha: rSha, catalog: rCat } = await loadCatalog(s.catalog);
      rCat.name = t;
      const renSuccess = await saveCatalog(s.catalog, rCat, rSha);

      if (renSuccess) {
        delete state[ctx.from.id];
        return ctx.reply('✅ Каталог переименован', Markup.removeKeyboard());
      } else {
        return ctx.reply('❌ Не удалось переименовать. Попробуйте позже.');
      }

    default:
      delete state[ctx.from.id];
      return;
  }
});

/* ===== PHOTO LOGIC ===== */
bot.on('photo', async ctx => {
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
process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());

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

/* ================== BOT LAUNCH ================== */
(async () => {
  await bot.telegram.deleteWebhook();
  await bot.launch();
  console.log('🤖 Bot launched');
})();
