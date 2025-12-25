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

// === URL (исправлено: убраны пробелы в конце) ===
const BACKEND_URL = 'https://cracker228-github-io.onrender.com';
const API = 'https://cracker228-github-io.onrender.com/api';

// DOM
const content = document.getElementById('content');
const navbar = document.getElementById('navbar');

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
function escapeHtmlAttr(str) {
  return str.replace(/'/g, "\\'");
}

// === NAV ===
function renderNavbar(active) {
  navbar.innerHTML = `
    <button onclick="navigate('catalog')" class="${active === 'catalog' ? 'active' : ''}">🛍️</button>
    <button onclick="navigate('cart')" class="${active === 'cart' ? 'active' : ''}">🛒</button>
    <button onclick="navigate('profile')" class="${active === 'profile' ? 'active' : ''}">👤</button>
  `;
}

function navigate(page, id = null) {
  renderNavbar(page);
  if (page === 'catalog') renderCatalogLine(content);
  else if (page === 'catalog-items') renderCatalogItems(content, id);
  else if (page === 'cart') renderCart(content);
  else if (page === 'profile') renderProfile(content);
}

// === КАТАЛОГИ ===
async function renderCatalogLine(container) {
  container.innerHTML = '<h2>🛍 Каталоги</h2>';
  let hasCatalogs = false;

  for (let i = 1; i <= 4; i++) {
    try {
      const res = await fetch(`${API}/catalog/${i}`);
      if (!res.ok) continue;
      const data = await res.json();
      hasCatalogs = true;

      container.innerHTML += `
        <button onclick="navigate('catalog-items', ${i})">
          ${data.name || `Каталог ${i}`}
        </button>
      `;
    } catch (err) {
      console.warn(`Не удалось загрузить каталог ${i}:`, err);
    }
  }

  if (!hasCatalogs) {
    container.innerHTML += '<p>Нет доступных каталогов</p>';
  }
}

// === ТОВАРЫ ===
async function renderCatalogItems(container, id) {
  try {
    const res = await fetch(`${API}/catalog/${id}`);
    if (!res.ok) throw new Error('Каталог не найден');
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
        <img src="${img}" onerror="this.src='https://via.placeholder.com/300x300?text=Нет+фото'">
        <div class="product-info">
          <h3>${item.name}</h3>
          <p>${item.description || ''}</p>
        </div>
      `;
      card.onclick = () => showVariants(item.id, id);
      itemsDiv.appendChild(card);
    });
  } catch (err) {
    container.innerHTML = `<p>Ошибка загрузки: ${err.message}</p>`;
  }
}

// === ВАРИАЦИИ ===
async function showVariants(itemId, catalogId) {
  try {
    const res = await fetch(`${API}/catalog/${catalogId}`);
    if (!res.ok) throw new Error('Каталог недоступен');
    const data = await res.json();
    const item = data.items.find(i => i.id === itemId);
    if (!item) throw new Error('Товар не найден');

    let html = `<h3>${item.name}</h3>`;

    item.subcategories.forEach(sub => {
      const img = sub.image
        ? `${BACKEND_URL}/tg-image/${sub.image}`
        : 'https://via.placeholder.com/100';

      const safeName = escapeHtmlAttr(item.name);
      const safeType = escapeHtmlAttr(sub.type);

      html += `
        <div class="variant-card">
          <img src="${img}" onerror="this.src='https://via.placeholder.com/100'">
          <div class="variant-content">
            <div class="variant-name">${sub.type}</div>
            <div class="variant-price">${sub.price} ₽</div>
            <button class="add-to-cart-btn"
              onclick="addToCart('${safeName}', '${safeType}', ${sub.price})">
              🛒 В корзину
            </button>
          </div>
        </div>
      `;
    });

    content.innerHTML = html;
  } catch (err) {
    content.innerHTML = `<p>Ошибка: ${err.message}</p>`;
  }
}

// === CART ===
window.addToCart = (name, type, price) => {
  cart.push({ name, type, price });
  localStorage.setItem('cart', JSON.stringify(cart));
  alert('Добавлено в корзину');
};

function renderCart(container) {
  if (!cart.length) {
    container.innerHTML = '<h2>Корзина пуста</h2>';
    return;
  }

  let total = cart.reduce((sum, item) => sum + item.price, 0);
  let html = '<h2>Корзина</h2>';

  cart.forEach((item, idx) => {
    html += `
      <div>
        ${item.name} (${item.type}) — ${item.price} ₽
        <button onclick="removeFromCart(${idx})">❌</button>
      </div>
    `;
  });

  html += `
    <p><b>Итого: ${total} ₽</b></p>
    <button onclick="placeOrder(${total})">Оформить заказ</button>
  `;

  container.innerHTML = html;
}

window.removeFromCart = (index) => {
  cart.splice(index, 1);
  localStorage.setItem('cart', JSON.stringify(cart));
  navigate('cart');
};

// === ORDER ===
window.placeOrder = async (total) => {
  if (!deliveryAddress.trim() || !phoneNumber.trim()) {
    alert('Заполните адрес и телефон в профиле');
    navigate('profile');
    return;
  }

  try {
    const res = await fetch(`${BACKEND_URL}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: phoneNumber,
        address: deliveryAddress,
        total,
        items: cart
      })
    });

    if (!res.ok) throw new Error('Не удалось отправить заказ');

    cart = [];
    localStorage.removeItem('cart');
    alert('Заказ успешно отправлен!');
    navigate('catalog');
  } catch (err) {
    alert('Ошибка отправки заказа: ' + err.message);
  }
};

// === PROFILE ===
function renderProfile(container) {
  container.innerHTML = `
    <h2>👤 Профиль</h2>
    ${tgUser ? `<p>Привет, ${tgUser.first_name}!</p>` : ''}
    <label>
      Адрес доставки:<br>
      <textarea id="addr" placeholder="Укажите полный адрес">${deliveryAddress}</textarea>
    </label><br><br>
    <label>
      Телефон:<br>
      <input id="phone" type="tel" placeholder="+7..." value="${phoneNumber}">
    </label><br><br>
    <button onclick="saveProfile()">Сохранить</button>
  `;
}

window.saveProfile = () => {
  deliveryAddress = document.getElementById('addr').value.trim();
  phoneNumber = document.getElementById('phone').value.trim();
  localStorage.setItem('deliveryAddress', deliveryAddress);
  localStorage.setItem('phoneNumber', phoneNumber);
  alert('Данные сохранены');
};

// === ЗАПУСК ===
document.addEventListener('DOMContentLoaded', () => {
  if (!content || !navbar) {
    document.body.innerHTML = '<h3>Ошибка: отсутствуют #content или #navbar</h3>';
    return;
  }
  navigate('catalog');
});
