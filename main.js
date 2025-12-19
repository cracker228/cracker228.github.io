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

// === URL ВАШЕГО RAILWAY-СЕРВЕРА (ИСПРАВЛЕНО: УБРАНЫ ПРОБЕЛЫ!) ===
const API_BASE_URL = 'https://cracker228githubio-site.up.railway.app  '; // ← ТУТ БЫЛО 2 ПРОБЕЛА!

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
function renderNavbar(active) {
  const nav = document.getElementById('navbar');
  if (!nav) return;
  nav.innerHTML = `
    <button onclick="navigate('catalog')" class="${active === 'catalog' ? 'active' : ''}">🛍️</button>
    <button onclick="navigate('cart')" class="${active === 'cart' ? 'active' : ''}">🛒</button>
    <button onclick="navigate('profile')" class="${active === 'profile' ? 'active' : ''}">👤</button>
  `;
}

// === НАВИГАЦИЯ ===
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
    default:
      renderCatalogLine(content);
  }
}

// === СТРАНИЦА: СПИСОК КАТАЛОГОВ ===
async function renderCatalogLine(container) {
  container.innerHTML = '<h2>Добро пожаловать в магазин!</h2>';
  for (let i = 1; i <= 4; i++) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/catalog${i}.json?_=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        const catalogName = data.name || `Каталог ${i}`;
        container.innerHTML += `
          <button onclick="navigate('catalog-items', ${i})"
                  style="width:100%; padding:12px; margin:8px 0; background:#2a2a2a; color:#e0e0e0; border:none; border-radius:12px; text-align:left; font-size:16px;">
            ${catalogName}
          </button>
        `;
      }
    } catch (e) {
      console.error('Ошибка загрузки каталога', i, e);
    }
  }
}

// === СТРАНИЦА: ТОВАРЫ В КАТАЛОГЕ ===
async function renderCatalogItems(container, catalogId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/catalog${catalogId}.json?_=${Date.now()}`);
    if (!res.ok) throw new Error('404');
    const data = await res.json();

    container.innerHTML = `<h2>${data.name}</h2><div id="items-list"></div>`;
    const itemsDiv = container.querySelector('#items-list');

    data.items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'product-card';
      const imgTag = item.image
        ? `<img src="${item.image.trim()}" alt="${item.name}">` // ← trim() на случай пробелов
        : `<div style="height:160px; background:#333; display:flex;align-items:center;justify-content:center;color:#555;">Нет фото</div>`;
      
      card.innerHTML = `
        ${imgTag}
        <div class="product-info">
          <h3>${item.name}</h3>
          <p>${item.description}</p>
        </div>
      `;
      card.onclick = () => showVariants(item, catalogId);
      itemsDiv.appendChild(card);
    });
  } catch (e) {
    container.innerHTML = `<p style="color:#ff6b6b;">❌ Ошибка загрузки каталога</p>`;
  }
}

// === ПОКАЗАТЬ ВАРИАЦИИ С ИЗОБРАЖЕНИЯМИ ===
async function showVariants(item, catalogId) {
  try {
    // 🔥 ИСПРАВЛЕНО: было ${i}, стало ${catalogId}
    const res = await fetch(`${API_BASE_URL}/api/catalog${catalogId}.json?_=${Date.now()}`);
    const data = await res.json();
    const targetItem = data.items.find(it => it.id === item.id);

    let html = `<h3>${item.name}</h3>`;
    if (targetItem?.subcategories?.length) {
      targetItem.subcategories.forEach(sub => {
        // 🔥 Убраны пробелы из placeholder
        const cleanImage = (sub.image || '').trim() || 'https://via.placeholder.com/100?text  =Нет+фото';
        html += `
          <div class="variant-card">
            <img src="${cleanImage}" alt="${sub.type}">
            <div class="variant-info">
              <h4>${sub.type}</h4>
              <div class "price">${sub.price} ₽</div>
              <button class="add-to-cart-btn" onclick="confirmAddToCart('${item.id}', '${item.name.replace(/'/g, "\\'")}', '${sub.type.replace(/'/g, "\\'")}', ${sub.price})">
                🛒 В корзину
              </button>
            </div>
          </div>
        `;
      });
    } else {
      html += '<p>Вариации не найдены.</p>';
    }
    document.getElementById('content').innerHTML = html;
  } catch (e) {
    console.error('Ошибка в showVariants:', e);
    document.getElementById('content').innerHTML = '<p style="color:#ff6b6b;">❌ Ошибка загрузки вариаций</p>';
  }
}

// === ГЛОБАЛЬНЫЕ ФУНКЦИИ ===
window.confirmAddToCart = (id, name, type, price) => {
  if (confirm(`Добавить "${type}" в корзину за ${price} ₽?`)) {
    cart.push({ id, name, type, price: Number(price) });
    localStorage.setItem('cart', JSON.stringify(cart));
    alert('✅ Товар добавлен в корзину!');
    // Не переходим в корзину — остаёмся на странице
  }
};

window.removeFromCart = (index) => {
  cart.splice(index, 1);
  localStorage.setItem('cart', JSON.stringify(cart));
  navigate('cart');
};

window.placeOrder = async (total) => {
  const paymentMethod = document.getElementById('payment-method')?.value || 'cash';
  const address = deliveryAddress.trim();
  const phone = phoneNumber.trim();

  if (!address || !phone) {
    alert('❗ Заполните адрес и телефон в личном кабинете!');
    navigate('profile');
    return;
  }

  const itemsText = cart.map(i => `- ${i.name} (${i.type}) — ${i.price} ₽`).join('\n');
  const paymentText = paymentMethod === 'cash' ? 'Наличными' : 'Переводом';
  const message = `📦 НОВЫЙ ЗАКАЗ\n\n📞 Телефон: ${phone}\n🏠 Адрес: ${address}\n💳 Оплата: ${paymentText}\n💰 Сумма: ${total} ₽\n\nТовары:\n${itemsText}`;

  try {
    const response = await fetch(`${API_BASE_URL}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });

    if (response.ok) {
      alert('✅ Заказ отправлен!');
      cart = [];
      localStorage.setItem('cart', JSON.stringify(cart));
      navigate('catalog');
    } else {
      alert('❌ Ошибка сервера. Попробуйте позже.');
    }
  } catch (e) {
    console.error('Ошибка сети:', e);
    alert('❌ Не удалось отправить заказ. Проверьте интернет.');
  }
};

// === СТРАНИЦЫ ===
function renderCart(container) {
  if (cart.length === 0) {
    container.innerHTML = '<h2>🛒 Ваша корзина пуста</h2>';
    return;
  }
  const total = cart.reduce((sum, item) => sum + item.price, 0);
  let html = `<h2>🛒 Корзина</h2><ul style="list-style:none; padding:0;">`;
  cart.forEach((item, index) => {
    html += `
      <li style="background:#2a2a2a; padding:12px; margin:8px 0; border-radius:8px;">
        ${item.name} (${item.type}) — ${item.price} ₽
        <button onclick="removeFromCart(${index})" style="float:right; background:#ff6b6b; border:none; color:white; border-radius:4px; padding:4px 8px;">❌</button>
      </li>
    `;
  });
  html += `</ul><p><strong>Итого: ${total} ₽</strong></p>`;
  html += `
    <label>Способ оплаты:
      <select id="payment-method" style="width:100%; padding:10px; margin:8px 0; background:#2a2a2a; color:#e0e0e0; border:1px solid #333; border-radius:8px;">
        <option value="cash">Наличными</option>
        <option value="transfer">Переводом</option>
      </select>
    </label><br><br>
    <button onclick="placeOrder(${total})">Оформить заказ</button>
  `;
  container.innerHTML = html;
}

function renderProfile(container) {
  container.innerHTML = `
    <h2>👤 Личный кабинет</h2>
    <label style="display:block; margin:12px 0;">Адрес доставки:
      <textarea id="delivery-address" rows="3" placeholder="Улица, дом, квартира..." style="width:100%; padding:12px; background:#2a2a2a; color:#e0e0e0; border:1px solid #333; border-radius:8px;">${deliveryAddress}</textarea>
    </label>
    <label style="display:block; margin:12px 0;">Телефон для связи:
      <input type="tel" id="phone-number" placeholder="+7 (999) 123-45-67" value="${phoneNumber}" style="width:100%; padding:12px; background:#2a2a2a; color:#e0e0e0; border:1px solid #333; border-radius:8px;">
    </label>
    <button onclick="saveProfile()" style="width:100%; padding:12px; background:#8a6dff; color:white; border:none; border-radius:8px; font-weight:bold;">💾 Сохранить</button>
  `;
}

window.saveProfile = () => {
  const addr = document.getElementById('delivery-address').value.trim();
  const phone = document.getElementById('phone-number').value.trim();

  if (!addr) {
    alert('❗ Укажите адрес доставки.');
    return;
  }
  if (!phone) {
    alert('❗ Укажите номер телефона.');
    return;
  }

  deliveryAddress = addr;
  phoneNumber = phone;
  localStorage.setItem('deliveryAddress', addr);
  localStorage.setItem('phoneNumber', phone);
  alert('✅ Профиль сохранён!');
};

// === ГЛОБАЛЬНЫЙ ДОСТУП ===
window.navigate = navigate;

// === ЗАПУСК ===
document.addEventListener('DOMContentLoaded', () => {
  navigate('catalog');
});
