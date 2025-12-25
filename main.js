// === ПРОВЕРКА TELEGRAM ===
if (!window.Telegram || !window.Telegram.WebApp) {
  document.body.innerHTML = `<h3>⚠️ Только внутри Telegram</h3>`;
  throw new Error('Not Telegram');
}

const tg = window.Telegram.WebApp;
tg.ready();
const tgUser = tg.initDataUnsafe?.user;

// === ДАННЫЕ ===
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let deliveryAddress = localStorage.getItem('deliveryAddress') || '';
let phoneNumber = localStorage.getItem('phoneNumber') || '';

// === URL ===
const BACKEND_URL = 'https://cracker228-github-io.onrender.com';
const GITHUB_API = 'https://cracker228.github.io/api';

// DOM
const content = document.getElementById('content');
const navbar = document.getElementById('navbar');

// === NAV ===
function renderNavbar(active) {
  navbar.innerHTML = `
    <button onclick="navigate('catalog')" class="${active==='catalog'?'active':''}">🛍️</button>
    <button onclick="navigate('cart')" class="${active==='cart'?'active':''}">🛒</button>
    <button onclick="navigate('profile')" class="${active==='profile'?'active':''}">👤</button>
  `;
}

function navigate(page, id = null) {
  renderNavbar(page);
  if (page === 'catalog') renderCatalogLine(content);
  if (page === 'catalog-items') renderCatalogItems(content, id);
  if (page === 'cart') renderCart(content);
  if (page === 'profile') renderProfile(content);
}

// === КАТАЛОГИ (GitHub) ===
async function renderCatalogLine(container) {
  container.innerHTML = '<h2>🛍 Каталоги</h2>';

  for (let i = 1; i <= 4; i++) {
    try {
      const res = await fetch(`${GITHUB_API}/catalog${i}.json?_=${Date.now()}`);
      if (!res.ok) continue;
      const data = await res.json();

      container.innerHTML += `
        <button onclick="navigate('catalog-items', ${i})">
          ${data.name || `Каталог ${i}`}
        </button>
      `;
    } catch {}
  }
}

// === ТОВАРЫ ===
async function renderCatalogItems(container, id) {
  const res = await fetch(`${GITHUB_API}/catalog${id}.json?_=${Date.now()}`);
  const data = await res.json();

  container.innerHTML = `<h2>${data.name}</h2><div id="items-list"></div>`;
  const itemsDiv = document.getElementById('items-list');

  data.items.forEach(item => {
    const img = item.image
      ? `${BACKEND_URL}/tg-image/${item.image}`
      : 'https://via.placeholder.com/300x300?text=Нет+фото';

    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <img src="${img}">
      <div class="product-info">
        <h3>${item.name}</h3>
        <p>${item.description || ''}</p>
      </div>
    `;
    card.onclick = () => showVariants(item.id, id);
    itemsDiv.appendChild(card);
  });
}

// === ВАРИАЦИИ ===
async function showVariants(itemId, catalogId) {
  const res = await fetch(`${GITHUB_API}/catalog${catalogId}.json?_=${Date.now()}`);
  const data = await res.json();
  const item = data.items.find(i => i.id === itemId);

  let html = `<h3>${item.name}</h3>`;

  item.subcategories.forEach(sub => {
    const img = sub.image
      ? `${BACKEND_URL}/tg-image/${sub.image}`
      : 'https://via.placeholder.com/100';

    html += `
      <div class="variant-card">
        <img src="${img}">
        <div class="variant-content">
          <div class="variant-name">${sub.type}</div>
          <div class="variant-price">${sub.price} ₽</div>
          <button class="add-to-cart-btn"
            onclick="addToCart('${item.name}','${sub.type}',${sub.price})">
            🛒 В корзину
          </button>
        </div>
      </div>
    `;
  });

  content.innerHTML = html;
}

// === CART ===
window.addToCart = (name, type, price) => {
  cart.push({ name, type, price });
  localStorage.setItem('cart', JSON.stringify(cart));
  alert('Добавлено');
};

function renderCart(container) {
  if (!cart.length) {
    container.innerHTML = '<h2>Корзина пуста</h2>';
    return;
  }

  let total = cart.reduce((s, i) => s + i.price, 0);
  let html = '<h2>Корзина</h2>';

  cart.forEach((i, idx) => {
    html += `
      <div>
        ${i.name} (${i.type}) — ${i.price} ₽
        <button onclick="removeFromCart(${idx})">❌</button>
      </div>
    `;
  });

  html += `
    <b>Итого: ${total} ₽</b>
    <button onclick="placeOrder(${total})">Оформить заказ</button>
  `;

  container.innerHTML = html;
}

window.removeFromCart = i => {
  cart.splice(i, 1);
  localStorage.setItem('cart', JSON.stringify(cart));
  navigate('cart');
};

// === ORDER ===
window.placeOrder = async total => {
  if (!deliveryAddress || !phoneNumber) {
    navigate('profile');
    return;
  }

  await fetch(`${BACKEND_URL}/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: phoneNumber,
      address: deliveryAddress,
      total,
      items: cart
    })
  });

  cart = [];
  localStorage.removeItem('cart');
  alert('Заказ отправлен');
  navigate('catalog');
};

// === PROFILE ===
function renderProfile(container) {
  container.innerHTML = `
    <h2>👤 Профиль</h2>
    ${tgUser ? `<p>${tgUser.first_name}</p>` : ''}
    <textarea id="addr" placeholder="Адрес">${deliveryAddress}</textarea>
    <input id="phone" placeholder="+7..." value="${phoneNumber}">
    <button onclick="saveProfile()">Сохранить</button>
  `;
}

window.saveProfile = () => {
  deliveryAddress = document.getElementById('addr').value.trim();
  phoneNumber = document.getElementById('phone').value.trim();
  localStorage.setItem('deliveryAddress', deliveryAddress);
  localStorage.setItem('phoneNumber', phoneNumber);
  alert('Сохранено');
};

// === START ===
document.addEventListener('DOMContentLoaded', () => navigate('catalog'));
