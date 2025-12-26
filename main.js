// === ПРОВЕРКА TELEGRAM ===
if (!window.Telegram || !window.Telegram.WebApp) {
  document.body.innerHTML = `<h3>⚠️ Только внутри Telegram</h3>`;
  throw new Error('Not Telegram');
}

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();
const tgUser = tg.initDataUnsafe?.user;

// === ДАННЫЕ ===
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let deliveryAddress = localStorage.getItem('deliveryAddress') || '';
let phoneNumber = localStorage.getItem('phoneNumber') || '';

// === URL ===
const BACKEND_URL = 'https://cracker228-github-io.onrender.com';
const API = 'https://cracker228.github.io/catalogs';

// DOM
const content = document.getElementById('content');
const navbar = document.getElementById('navbar');

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
  if (page === 'catalog-items') renderCatalogItems(content, id);
  if (page === 'cart') renderCart(content);
  if (page === 'profile') renderProfile(content);
}

// === КАТАЛОГИ ===
async function renderCatalogLine(container) {
  container.innerHTML = '<h2>🛍 Каталоги</h2>';
  let found = false;

  for (let i = 1; i <= 4; i++) {
    try {
      const res = await fetch(`${API}/catalog${i}.json?_=${Date.now()}`);
      if (!res.ok) continue;

      const data = await res.json();
      found = true;

      const catalogBtn = document.createElement('button');
      catalogBtn.innerHTML = data.name || `Каталог ${i}`;
      catalogBtn.onclick = () => navigate('catalog-items', i);
      container.appendChild(catalogBtn);
    } catch (e) {
      console.warn(`Каталог ${i} не загружен`, e);
    }
  }

  if (!found) {
    container.innerHTML += '<p>Нет доступных каталогов</p>';
  }
}

// === ТОВАРЫ ===
async function renderCatalogItems(container, id) {
  try {
    const res = await fetch(`${API}/catalog${id}.json?_=${Date.now()}`);
    if (!res.ok) throw new Error('Каталог не найден');

    const data = await res.json();
    container.innerHTML = `<h2>${data.name}</h2><div id="items-list"></div>`;
    const itemsDiv = document.getElementById('items-list');

    if (!data.items || !data.items.length) {
      itemsDiv.innerHTML = '<p>В каталоге нет товаров</p>';
      return;
    }

    data.items.forEach(item => {
      const img = item.image
        ? `${BACKEND_URL}/tg-image/${item.image}`
        : 'https://via.placeholder.com/300x300?text=Нет+фото';

      const card = document.createElement('div');
      card.className = 'product-card';
      card.innerHTML = `
        <div class="product-image">
          <img src="${img}" alt="${item.name}" onerror="this.src='https://via.placeholder.com/300x300?text=Ошибка+загрузки'">
        </div>
        <div class="product-info">
          <h3>${item.name}</h3>
          <p>${item.description || 'Описание отсутствует'}</p>
        </div>
      `;
      card.onclick = () => showVariants(item.id, id, item.name, item.description);
      itemsDiv.appendChild(card);
    });
  } catch (e) {
    console.error('Ошибка загрузки каталога:', e);
    container.innerHTML = '<p>❌ Ошибка загрузки каталога</p>';
  }
}

// === ВАРИАЦИИ ===
async function showVariants(itemId, catalogId, itemName, itemDesc) {
  try {
    const res = await fetch(`${API}/catalog${catalogId}.json?_=${Date.now()}`);
    const data = await res.json();
    const item = data.items.find(i => i.id === itemId);
    if (!item) throw new Error('Товар не найден');

    let html = `
      <button onclick="navigate('catalog-items', ${catalogId})">← Назад</button>
      <h3>${itemName}</h3>
      <p>${itemDesc || ''}</p>
      <div class="variants-container">
    `;

    if (!item.subcategories || !item.subcategories.length) {
      html += '<p>Нет доступных вариаций</p>';
    } else {
      item.subcategories.forEach((sub, idx) => {
        const img = sub.image
          ? `${BACKEND_URL}/tg-image/${sub.image}`
          : 'https://via.placeholder.com/100?text=Нет+фото';

        html += `
          <div class="variant-card">
            <img src="${img}" onerror="this.src='https://via.placeholder.com/100?text=Ошибка'">
            <div class="variant-content">
              <div class="variant-name">${sub.type || 'Без названия'}</div>
              <div class="variant-price">${sub.price || 0} ₽</div>
              <button class="add-to-cart-btn" 
                onclick="addToCart('${itemName.replace(/'/g, "\\'")}', 
                                 '${(sub.type || '').replace(/'/g, "\\'")}', 
                                 ${sub.price || 0})">
                🛒 В корзину
              </button>
            </div>
          </div>
        `;
      });
    }

    html += '</div>';
    content.innerHTML = html;
  } catch (e) {
    console.error('Ошибка загрузки вариаций:', e);
    content.innerHTML = `<button onclick="navigate('catalog-items', ${catalogId})">← Назад</button><p>❌ Ошибка загрузки товара</p>`;
  }
}

// === CART ===
window.addToCart = (name, type, price) => {
  if (!price || price <= 0) {
    tg.showAlert('Некорректная цена товара');
    return;
  }

  cart.push({ name, type, price: Number(price) });
  localStorage.setItem('cart', JSON.stringify(cart));
  tg.showAlert('✅ Товар добавлен в корзину');
};

function renderCart(container) {
  if (!cart.length) {
    container.innerHTML = `
      <h2>🛒 Корзина</h2>
      <p>Ваша корзина пуста</p>
      <button onclick="navigate('catalog')">Выбрать товары</button>
    `;
    return;
  }

  let total = cart.reduce((s, i) => s + Number(i.price), 0);
  let html = `
    <button onclick="navigate('catalog')">← Продолжить покупки</button>
    <h2>🛒 Корзина</h2>
  `;

  cart.forEach((i, idx) => {
    html += `
      <div class="cart-item">
        <span>${i.name} ${i.type ? `(${i.type})` : ''} — ${i.price} ₽</span>
        <button onclick="removeFromCart(${idx})" class="remove-btn">❌</button>
      </div>
    `;
  });

  html += `
    <div class="cart-total">
      <strong>Итого: ${total} ₽</strong>
    </div>
    <button onclick="placeOrder()" class="checkout-btn">Оформить заказ</button>
  `;

  container.innerHTML = html;
}

window.removeFromCart = (i) => {
  cart.splice(i, 1);
  localStorage.setItem('cart', JSON.stringify(cart));
  renderCart(content);
};

// === ORDER (РАБОЧИЙ ВАРИАНТ ЧЕРЕЗ POST ЗАПРОС) ===
window.placeOrder = async () => {
  try {
    // 1. Проверка корзины
    if (!Array.isArray(cart) || cart.length === 0) {
      tg.showAlert('⚠️ Корзина пуста');
      return;
    }

    // 2. Проверка профиля
    if (!deliveryAddress.trim() || !phoneNumber.trim()) {
      tg.showAlert('⚠️ Заполните профиль (адрес и телефон)');
      navigate('profile');
      return;
    }

    // 3. Создаем данные заказа
    const safeItems = cart.map(item => ({
      name: (item.name || 'Товар без названия').toString().trim(),
      variant: (item.type || 'Без вариации').toString().trim(),
      price: Number(item.price) || 0
    }));

    const total = safeItems.reduce((sum, item) => sum + item.price, 0);

    // 4. ОТПРАВЛЯЕМ ЗАКАЗ ЧЕРЕЗ POST ЗАПРОС
    tg.showAlert('📤 Отправка заказа...');
    
    const BACKEND_URL = 'https://cracker228-github-io.onrender.com';
    
    const response = await fetch(`${BACKEND_URL}/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Новый заказ',
        items: safeItems,
        contact: phoneNumber.trim(),
        address: deliveryAddress.trim(),
        total: total,
        userId: tgUser?.id || 'unknown'
      })
    });

    const result = await response.json();
    
    if (response.ok && result.success) {
      // 5. Очищаем корзину
      cart = [];
      localStorage.setItem('cart', JSON.stringify(cart));
      
      tg.showAlert('✅ Заказ успешно оформлен!');
      console.log('✅ Заказ оформлен, корзина очищена');
      
      // Закрываем WebApp
      setTimeout(() => {
        tg.close();
      }, 1000);
    } else {
      throw new Error(result.error || 'Ошибка сервера');
    }
    
  } catch (error) {
    console.error('❌ Ошибка при оформлении заказа:', error);
    tg.showAlert(`❌ Ошибка: ${error.message || 'Неизвестная ошибка'}`);
  }
};
// === PROFILE ===
function renderProfile(container) {
  container.innerHTML = `
    <button onclick="navigate('catalog')">← Назад</button>
    <h2>👤 Профиль</h2>
    ${tgUser ? `<p>Привет, ${tgUser.first_name}</p>` : ''}
    <div class="form-group">
      <label>Адрес доставки</label>
      <textarea id="addr" placeholder="Укажите полный адрес">${deliveryAddress}</textarea>
    </div>
    <div class="form-group">
      <label>Телефон</label>
      <input id="phone" placeholder="+7 (999) 123-45-67" type="tel" value="${phoneNumber}">
    </div>
    <button onclick="saveProfile()" class="save-btn">Сохранить</button>
  `;
}

window.saveProfile = () => {
  const newAddress = document.getElementById('addr').value.trim();
  const newPhone = document.getElementById('phone').value.trim();

  if (!newPhone || !/^\+?[0-9\s\-()]{10,}$/.test(newPhone)) {
    tg.showAlert('⚠️ Укажите корректный телефон');
    return;
  }

  if (newAddress.length < 5) {
    tg.showAlert('⚠️ Адрес должен быть не менее 5 символов');
    return;
  }

  deliveryAddress = newAddress;
  phoneNumber = newPhone;
  
  localStorage.setItem('deliveryAddress', deliveryAddress);
  localStorage.setItem('phoneNumber', phoneNumber);
  
  tg.showAlert('✅ Профиль сохранён');
};

// === START ===
document.addEventListener('DOMContentLoaded', () => {
  // Устанавливаем тему в соответствии с Telegram
  document.body.className = tg.colorScheme;
  
  // Добавляем обработчики для кнопок "Назад"
  tg.onEvent('backButtonClicked', () => {
    const currentPath = window.location.hash || '#catalog';
    if (currentPath.includes('catalog-items')) {
      navigate('catalog');
    } else if (currentPath.includes('cart') || currentPath.includes('profile')) {
      navigate('catalog');
    }
  });
  
  // Показываем кнопку "Назад" при необходимости
  tg.BackButton.show();
  
  // Стартуем с каталога
  navigate('catalog');
});

// === СТИЛИ ДЛЯ ПРИЛОЖЕНИЯ ===
const style = document.createElement('style');
style.textContent = `
  :root {
    --tg-theme-bg-color: #ffffff;
    --tg-theme-text-color: #000000;
    --tg-theme-button-color: #3390ec;
    --tg-theme-button-text-color: #ffffff;
    --tg-theme-hint-color: #999999;
    --tg-theme-link-color: #3390ec;
  }
  
  .dark {
    --tg-theme-bg-color: #1a1a1a;
    --tg-theme-text-color: #ffffff;
    --tg-theme-button-color: #5da8ff;
    --tg-theme-button-text-color: #ffffff;
    --tg-theme-hint-color: #cccccc;
    --tg-theme-link-color: #5da8ff;
  }
  
  body {
    background-color: var(--tg-theme-bg-color);
    color: var(--tg-theme-text-color);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    margin: 0;
    padding: 16px;
    min-height: 100vh;
  }
  
  #content {
    margin-bottom: 80px;
  }
  
  #navbar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background-color: var(--tg-theme-bg-color);
    display: flex;
    justify-content: space-around;
    padding: 12px 0;
    border-top: 1px solid var(--tg-theme-hint-color);
    box-shadow: 0 -2px 10px rgba(0,0,0,0.1);
  }
  
  button {
    background-color: var(--tg-theme-button-color);
    color: var(--tg-theme-button-text-color);
    border: none;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 16px;
    cursor: pointer;
    margin: 8px 0;
    width: 100%;
  }
  
  button.active {
    opacity: 0.8;
  }
  
  .product-card {
    border: 1px solid var(--tg-theme-hint-color);
    border-radius: 12px;
    padding: 16px;
    margin: 12px 0;
    cursor: pointer;
    transition: transform 0.2s;
  }
  
  .product-card:hover {
    transform: translateY(-2px);
  }
  
  .product-image img {
    width: 100%;
    height: 150px;
    object-fit: contain;
    border-radius: 8px;
    display: block;
    margin: 0 auto;
  }
  
  .variants-container {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 16px;
    margin-top: 16px;
  }
  
  .variant-card {
    border: 1px solid var(--tg-theme-hint-color);
    border-radius: 12px;
    padding: 12px;
    text-align: center;
  }
  
  .variant-card img {
    width: 80px;
    height: 80px;
    object-fit: contain;
    margin: 0 auto;
    display: block;
  }
  
  .variant-name {
    font-weight: bold;
    margin: 8px 0;
    font-size: 16px;
  }
  
  .variant-price {
    color: var(--tg-theme-link-color);
    font-size: 18px;
    margin: 4px 0;
    font-weight: bold;
  }
  
  .cart-item {
    display: flex;
    justify-content: space-between;
    padding: 12px;
    border-bottom: 1px solid var(--tg-theme-hint-color);
    align-items: center;
  }
  
  .remove-btn {
    background: #ff5c5c;
    padding: 4px 8px;
    min-width: auto;
    border-radius: 4px;
  }
  
  .cart-total {
    text-align: right;
    font-size: 20px;
    margin: 20px 0;
    font-weight: bold;
    padding: 10px 0;
    border-top: 1px dashed var(--tg-theme-hint-color);
  }
  
  .checkout-btn {
    background: #4CAF50;
    font-size: 18px;
    padding: 14px;
    width: 100%;
    margin-top: 10px;
  }
  
  .form-group {
    margin: 16px 0;
  }
  
  textarea, input {
    width: 100%;
    padding: 12px;
    border: 1px solid var(--tg-theme-hint-color);
    border-radius: 8px;
    background: var(--tg-theme-bg-color);
    color: var(--tg-theme-text-color);
    margin-top: 6px;
    box-sizing: border-box;
  }
  
  .save-btn {
    background: #2196F3;
    width: 100%;
    margin-top: 10px;
  }
  
  button:hover {
    opacity: 0.9;
  }
`;
document.head.appendChild(style);
