if (typeof window.Telegram === 'undefined') {
  document.body.innerHTML = `
    <div style="padding:20px; text-align:center; font-family:sans-serif; color:#e0e0e0; background:#121212; min-height:100vh; display:flex; flex-direction:column; justify-content:center;">
      <h2>⚠️ Этот сайт работает только внутри Telegram</h2>
      <p>Откройте его через Mini App в боте</p>
    </div>
  `;
  throw new Error('Not running in Telegram Web App');
}

// === ГЛОБАЛЬНЫЕ ДАННЫЕ ===
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let deliveryAddress = localStorage.getItem('deliveryAddress') || '';
let phoneNumber = localStorage.getItem('phoneNumber') || '';
let currentCatalogId = null;

// === URL BACKEND (RENDER) ===
const API_BASE_URL = 'https://cracker228-github-io.onrender.com';

// === НАВИГАЦИЯ ===
function renderNavbar(active) {
  const nav = document.getElementById('navbar');
  if (!nav) return;
  nav.innerHTML = `
    <button onclick="navigate('catalog')" class="${active === 'catalog' ? 'active' : ''}">🛍️</button>
    <button onclick="navigate('cart')" class="${active === 'cart' ? 'active' : ''}">🛒</button>
    <button onclick="navigate('profile')" class="${active === 'profile' ? 'active' : ''}">👤</button>
  `;
}

function navigate(page, catalogId = null) {
  renderNavbar(page);
  const content = document.getElementById('content');
  if (!content) return;

  switch (page) {
    case 'catalog':
      renderCatalogLine(content);
      break;
    case 'catalog-items':
      currentCatalogId = catalogId;
      renderCatalogItems(content, catalogId);
      break;
    case 'cart':
      renderCart(content);
      break;
    case 'profile':
      renderProfile(content);
      break;
  }
}

// === СПИСОК КАТАЛОГОВ ===
async function renderCatalogLine(container) {
  container.innerHTML = '<h2>Добро пожаловать в магазин!</h2>';

  for (let i = 1; i <= 4; i++) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/catalog/${i}?_=${Date.now()}`);
      if (!res.ok) continue;

      const data = await res.json();
      container.innerHTML += `
        <button onclick="navigate('catalog-items', ${i})"
          style="width:100%; padding:12px; margin:8px 0; background:#2a2a2a; color:#e0e0e0; border:none; border-radius:12px; text-align:left; font-size:16px;">
          ${data.name || `Каталог ${i}`}
        </button>
      `;
    } catch (e) {
      console.error('Ошибка каталога', i, e);
    }
  }
}

// === ТОВАРЫ В КАТАЛОГЕ ===
async function renderCatalogItems(container, catalogId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/catalog/${catalogId}?_=${Date.now()}`);
    if (!res.ok) throw new Error('404');

    const data = await res.json();
    container.innerHTML = `<h2>${data.name}</h2><div id="items-list"></div>`;
    const itemsDiv = document.getElementById('items-list');

    data.items.forEach(item => {
      const firstSub = item.subcategories?.[0];
      const imageUrl = firstSub?.image
        ? `${API_BASE_URL}/tg-image/${firstSub.image}`
        : 'https://via.placeholder.com/160?text=Нет+фото';

      const card = document.createElement('div');
      card.className = 'product-card';
      card.innerHTML = `
        <img src="${imageUrl}" style="width:100%; height:160px; object-fit:cover; border-radius:8px;">
        <div class="product-info">
          <h3>${item.name}</h3>
          <p>${item.description}</p>
        </div>
      `;
      card.onclick = () => showVariants(item, catalogId);
      itemsDiv.appendChild(card);
    });
  } catch {
    container.innerHTML = `<p style="color:#ff6b6b;">❌ Ошибка загрузки каталога</p>`;
  }
}

// === ВАРИАЦИИ ===
async function showVariants(item, catalogId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/catalog/${catalogId}?_=${Date.now()}`);
    const data = await res.json();
    const targetItem = data.items.find(i => i.id === item.id);

    let html = `<h3>${item.name}</h3>`;
    targetItem.subcategories.forEach(sub => {
      const img = sub.image
        ? `${API_BASE_URL}/tg-image/${sub.image}`
        : 'https://via.placeholder.com/100?text=Нет+фото';

      html += `
        <div class="variant-card">
          <img src="${img}">
          <div class="variant-info">
            <h4>${sub.type}</h4>
            <div class="price">${sub.price} ₽</div>
            <button onclick="confirmAddToCart('${item.id}','${item.name}','${sub.type}',${sub.price})">
              🛒 В корзину
            </button>
          </div>
        </div>
      `;
    });

    document.getElementById('content').innerHTML = html;
  } catch {
    document.getElementById('content').innerHTML = '<p>❌ Ошибка вариаций</p>';
  }
}

// === КОРЗИНА ===
window.confirmAddToCart = (id, name, type, price) => {
  cart.push({ id, name, type, price });
  localStorage.setItem('cart', JSON.stringify(cart));
  alert('✅ Добавлено в корзину');
};

window.removeFromCart = (i) => {
  cart.splice(i, 1);
  localStorage.setItem('cart', JSON.stringify(cart));
  navigate('cart');
};

function renderCart(container) {
  if (!cart.length) {
    container.innerHTML = '<h2>🛒 Корзина пуста</h2>';
    return;
  }

  const total = cart.reduce((s, i) => s + i.price, 0);
  let html = `<h2>🛒 Корзина</h2>`;

  cart.forEach((i, idx) => {
    html += `<div>${i.name} (${i.type}) — ${i.price} ₽
      <button onclick="removeFromCart(${idx})">❌</button></div>`;
  });

  html += `<b>Итого: ${total} ₽</b>
    <button onclick="placeOrder(${total})">Оформить заказ</button>`;
  container.innerHTML = html;
}

// === ЗАКАЗ ===
window.placeOrder = async (total) => {
  const paymentMethod = document.getElementById('payment-method')?.value || 'cash';
  const address = localStorage.getItem('deliveryAddress');
  const phone = localStorage.getItem('phoneNumber');

  if (!address || !phone) {
    alert('Заполните адрес и телефон');
    return;
  }

  const payload = {
    phone,
    address,
    payment: paymentMethod === 'cash' ? 'Наличными' : 'Переводом',
    total,
    items: cart.map(i => ({
      name: i.name,
      type: i.type,
      price: i.price
    }))
  };

  const res = await fetch(`${API_BASE_URL}/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    alert('Заказ отправлен');
    cart = [];
    localStorage.removeItem('cart');
    navigate('catalog');
  } else {
    alert('Ошибка сервера');
  }
};


// === ПРОФИЛЬ ===
function renderProfile(container) {
  container.innerHTML = `<h2>👤 Профиль</h2>`;
}

// === START ===
document.addEventListener('DOMContentLoaded', () => {
  navigate('catalog');
});
