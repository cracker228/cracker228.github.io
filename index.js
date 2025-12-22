require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = 'https://cracker228-github-io.onrender.com'; // ← убраны пробелы

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

// ===== API ДЛЯ MINI APP =====
app.get('/api/catalog/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (![1, 2, 3, 4].includes(id)) {
      return res.status(400).json({ error: 'Invalid catalog id' });
    }

    const data = await loadCatalog(id);
    res.json(data);
  } catch (err) {
    console.error('Catalog API error:', err);
    res.status(500).json({ error: 'Failed to load catalog' });
  }
});

// ===== ПРОКСИ ДЛЯ TELEGRAM ФОТО =====
app.get('/tg-image/:fileId', async (req, res) => {
  try {
    const link = await bot.telegram.getFileLink(req.params.fileId);
    res.redirect(link.href);
  } catch (e) {
    console.error('TG image error', e);
    res.status(404).send('Image not found');
  }
});

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

bot.hears('⬅️ Назад', ctx => {
  reset(ctx.from.id);
  ctx.reply('↩️ Выход из админки', Markup.removeKeyboard());
});

/* ================= TEXT FLOW ================= */

bot.on('text', async ctx => {
  const s = state[ctx.from.id];
  if (!s) return;
  const t = ctx.message.text.trim(); // ← обрезаем пробелы на всякий случай

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
    s.vars = s.vars || [];
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
  if (s.step === 'ADD_MORE' && t === 'да') {
    s.step = 'ADD_VAR_NAME';
    return ctx.reply('Вариация:');
  }

  /* === EDIT PRODUCT === */
  if (s.step === 'EDIT_CAT') {
    const catNum = +t;
    if (![1,2,3,4].includes(catNum)) {
      return ctx.reply('❌ Каталог должен быть от 1 до 4. Попробуйте снова.');
    }
    s.cat = catNum;
    s.step = 'EDIT_ID';
    try {
      const catalog = await loadCatalog(s.cat);
      if (!catalog.items?.length) {
        ctx.reply('📦 В этом каталоге пока нет товаров.');
        reset(ctx.from.id);
        return;
      }
      const itemsList = catalog.items.map(item => `${item.id}: ${item.name}`).join('\n');
      ctx.reply(`Выберите ID товара для редактирования:\n\n${itemsList}`);
    } catch (e) {
      ctx.reply('❌ Ошибка загрузки каталога.');
      reset(ctx.from.id);
    }
  }

  if (s.step === 'EDIT_ID') {
    s.itemId = t;
    try {
      const catalog = await loadCatalog(s.cat);
      const item = catalog.items.find(i => i.id === s.itemId);
      if (!item) {
        ctx.reply('❌ Товар не найден. Попробуйте снова.');
        reset(ctx.from.id);
        return;
      }
      s.item = item;
      s.step = 'EDIT_FIELD';
      ctx.reply(
        `Редактируем: ${item.name}\n\nЧто изменить?\n\n1. Название\n2. Описание\n3. Вариации`,
        Markup.keyboard([['1', '2', '3'], ['❌ Отмена']]).oneTime()
      );
    } catch (e) {
      ctx.reply('❌ Ошибка при поиске товара.');
      reset(ctx.from.id);
    }
  }

  if (s.step === 'EDIT_FIELD') {
    if (t === '❌ Отмена') {
      reset(ctx.from.id);
      return ctx.reply('✅ Отменено', Markup.removeKeyboard());
    }
    if (t === '1') {
      s.editField = 'name';
      ctx.reply('Введите новое название:');
      s.step = 'EDIT_VALUE';
    } else if (t === '2') {
      s.editField = 'description';
      ctx.reply('Введите новое описание:');
      s.step = 'EDIT_VALUE';
    } else if (t === '3') {
      ctx.reply('🛠️ Редактирование вариаций пока не реализовано.', Markup.removeKeyboard());
      reset(ctx.from.id);
    } else {
      ctx.reply('Выберите 1, 2 или 3.');
    }
  }

  if (s.step === 'EDIT_VALUE') {
    if (s.editField === 'name') {
      s.item.name = t;
    } else if (s.editField === 'description') {
      s.item.description = t;
    }

    try {
      const catalog = await loadCatalog(s.cat);
      const index = catalog.items.findIndex(i => i.id === s.itemId);
      if (index !== -1) {
        catalog.items[index] = s.item;
        await saveCatalog(s.cat, catalog);
        ctx.reply('✅ Товар обновлён', Markup.removeKeyboard());
      } else {
        ctx.reply('❌ Товар исчез при сохранении.');
      }
    } catch (e) {
      ctx.reply('❌ Ошибка сохранения.');
    }
    reset(ctx.from.id);
  }

  /* === DELETE PRODUCT === */
  if (s.step === 'DEL_CAT') {
    const catNum = +t;
    if (![1,2,3,4].includes(catNum)) {
      return ctx.reply('❌ Каталог должен быть от 1 до 4.');
    }
    s.cat = catNum;
    s.step = 'DEL_ID';
    try {
      const catalog = await loadCatalog(s.cat);
      if (!catalog.items?.length) {
        ctx.reply('📦 В этом каталоге нет товаров.');
        reset(ctx.from.id);
        return;
      }
      const itemsList = catalog.items.map(item => `${item.id}: ${item.name}`).join('\n');
      ctx.reply(`Выберите ID товара для удаления:\n\n${itemsList}`);
    } catch (e) {
      ctx.reply('❌ Ошибка загрузки каталога.');
      reset(ctx.from.id);
    }
  }

  if (s.step === 'DEL_ID') {
    s.itemId = t;
    try {
      const catalog = await loadCatalog(s.cat);
      const index = catalog.items.findIndex(i => i.id === s.itemId);
      if (index === -1) {
        ctx.reply('❌ Товар не найден.');
        reset(ctx.from.id);
        return;
      }

      catalog.items.splice(index, 1);
      await saveCatalog(s.cat, catalog);
      ctx.reply('✅ Товар удалён', Markup.removeKeyboard());
      reset(ctx.from.id);
    } catch (e) {
      ctx.reply('❌ Ошибка при удалении.');
      reset(ctx.from.id);
    }
  }
});

/* ================= PHOTO ================= */

bot.on('photo', ctx => {
  const s = state[ctx.from.id];
  if (!s) return;
  const fileId = ctx.message.photo.at(-1).file_id;

  if (s.step === 'ADD_VAR_IMAGE') {
    s.vars = s.vars || [];
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

// Обработка ошибок бота
bot.catch(err => {
  console.error('Unhandled bot error:', err);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('OK'));
