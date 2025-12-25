// === ПРОВЕРКА TELEGRAM ===
if (!window.Telegram || !window.Telegram.WebApp) {
  document.body.innerHTML = `
    <div style="padding:20px; text-align:center;">
      <h2>⚠️ Только внутри Telegram</h2>
    </div>
  `;
  throw new Error('Not in Telegram');
}

const tg = window.Telegram.WebApp;
tg.ready();
const tgUser = tg.initDataUnsafe?.user;

// === ГЛОБАЛЬНЫЕ ДАННЫЕ ===
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let deliveryAddress = localStorage.getItem('deliveryAddress') || '';
let phoneNumber = localStorage.getItem('phoneNumber') || '';
let currentCatalogId = null;

// === URL ===
const BACKEND_URL = 'https://cracker228-github-io.onrender.com';
const GITHUB_CATALOG_BASE = 'https://cracker228.github.io';

// === НАВИГАЦИЯ ===
function renderNavbar(active) {
  const nav = document.getElementById('navbar');
  if (!nav) return;

  nav.innerHTML = `
    <button onclick="navigate('catalog')" ${active === 'catalog' ? 'class="active"' : ''}>🛍️</button>
    <button onclick="navigate('cart')" ${active === 'cart' ? 'class="active"' : ''}>🛒</button>
    <button onclick="navigate('profile')" ${active === 'profile' ? 'class="active"' : ''}>👤</button>
  `;
}

function navigate(page, catalogId = null) {
  renderNavbar(page);
  const content = document.getElementById('content');
  if (!content) return;

  if (page === 'catalog') renderCatalogLine(content);
  if (page === 'catalog-items') renderCatalogItems(content, catalogId);
  if (page === 'cart') renderCart(content);
  if (page === 'profile') renderProfile(content);
}

// === КАТАЛОГИ (GITHUB) ===
async function renderCatalogLine(container) {
  container.innerHTML = '<h2>🛍 Каталоги</h2>';

  for (let i = 1; i <= 4; i++) {
    try {
      const res = await fetch(
        `https://cracker228.github.io/api/catalog${i}.json?_=${Date.now()}`
      );
      if (!res.ok) continue;

      const data = await res.json();

      container.innerHTML += `
        <button onclick="navigate('catalog-items', ${i})"
          style="width:100%; padding:12px; margin:8px 0;">
          ${data.name || `Каталог ${i}`}
        </button>
      `;
    } catch (e) {
      console.error('Каталог ошибка', i, e);
    }
  }
}


// === ТОВАРЫ ===
async function renderCatalogItems(container, catalogId) {
  try {
    const res = await fetch(
      `https://cracker228.github.io/api/catalog${catalogId}.json?_=${Date.now()}`
    );
    if (!res.ok) throw new Error();

    const data = await res.json();
    container.innerHTML = `<h2>${data.name}</h2><div id="items"></div>`;
    const itemsDiv = document.getElementById('items');

    data.items.forEach(item => {
      const img = item.image
        ? `https://cracker228-github-io.onrender.com/tg-image/${item.image}`
        : 'https://via.placeholder.com/160?text=Нет+фото';

      const card = document.createElement('div');
      card.innerHTML = `
        <img src="${img}" style="width:100%;height:160px;object-fit:cover;">
        <h3>${item.name}</h3>
        <p>${item.description}</p>
      `;
      card.onclick = () => showVariants(item, catalogId);
      itemsDiv.appendChild(card);
    });
  } catch {
    container.innerHTML = '<p>❌ Ошибка каталога</p>';
  }
}


// === ВАРИАЦИИ ===
async function showVariants(item, catalogId) {
  const res = await fetch(`${GITHUB_CATALOG_BASE}/catalog${catalogId}.json?_=${Date.now()}`);
  const data = await res.json();
  const target = data.items.find(i => i.id === item.id);

  let html = `<h3>${item.name}</h3>`;
  target.subcategories.forEach(sub => {
    const img = sub.image
      ? `${BACKEND_URL}/tg-image/${sub.image}`
      : 'https://via.placeholder.com/100?text=Нет+фото';

    html += `
      <div>
        <img src="${img}" width="100">
        <b>${sub.type}</b> — ${sub.price} ₽
        <button onclick="addToCart('${item.id}','${item.name}','${sub.type}',${sub.price})">🛒</button>
      </div>
    `;
  });

  document.getElementById('content').innerHTML = html;
}

// === КОРЗИНА ===
window.addToCart = (id, name, type, price) => {
  cart.push({ id, name, type, price });
  localStorage.setItem('cart', JSON.stringify(cart));
  alert('Добавлено');
};

function renderCart(container) {
  if (!cart.length) {
    container.innerHTML = '<h2>Корзина пуста</h2>';
    return;
  }

  const total = cart.reduce((s, i) => s + i.price, 0);
  let html = '<h2>Корзина</h2>';

  cart.forEach((i, idx) => {
    html += `
      <div>
        ${i.name} (${i.type}) — ${i.price} ₽
        <button onclick="removeFromCart(${idx})">❌</button>
      </div>
    `;
  });

  html += `<b>Итого: ${total} ₽</b><br>
           <button onclick="placeOrder(${total})">Оформить заказ</button>`;

  container.innerHTML = html;
}

window.removeFromCart = i => {
  cart.splice(i, 1);
  localStorage.setItem('cart', JSON.stringify(cart));
  navigate('cart');
};

// === ЗАКАЗ ===
window.placeOrder = async total => {
  if (!deliveryAddress || !phoneNumber) {
    alert('Заполните профиль');
    navigate('profile');
    return;
  }

  const payload = {
    phone: phoneNumber,
    address: deliveryAddress,
    total,
    items: cart
  };

  const res = await fetch(`${BACKEND_URL}/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    alert('Заказ отправлен');
    cart = [];
    localStorage.removeItem('cart');
    navigate('catalog');
  }
};

// === ПРОФИЛЬ ===
function renderProfile(container) {
  container.innerHTML = `
    <h2>👤 Профиль</h2>
    <p>${tgUser ? `Вы вошли как ${tgUser.first_name}` : ''}</p>

    <textarea id="addr" placeholder="Адрес">${deliveryAddress}</textarea>
    <input id="phone" placeholder="+7..." value="${phoneNumber}">

    <button onclick="saveProfile()">Сохранить</button>
  `;
}

window.saveProfile = () => {
  deliveryAddress = document.getElementById('addr').value.trim();
  phoneNumber = document.getElementById('phone').value.trim();

  if (!deliveryAddress || !phoneNumber) {
    alert('Заполните всё');
    return;
  }

  localStorage.setItem('deliveryAddress', deliveryAddress);
  localStorage.setItem('phoneNumber', phoneNumber);
  alert('Сохранено');
};

// === START ===
document.addEventListener('DOMContentLoaded', () => {
  navigate('catalog');
});
