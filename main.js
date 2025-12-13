// Защита от запуска вне Telegram
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
      renderCatalogList(content);
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
      renderCatalogList(content);
  }
}

// === СТРАНИЦА: СПИСОК КАТАЛОГОВ ===
function renderCatalogList(container) {
  container.innerHTML = '<h2>Добро пожаловать в магазин!</h2>';
  for (let i = 1; i <= 4; i++) {
    fetch(`api/catalog${i}.json`)
      .then(res => {
        if (res.ok) {
          container.innerHTML += `
            <button onclick="navigate('catalog-items', ${i})"
                    style="width:100%; padding:12px; margin:8px 0; background:#2a2a2a; color:#e0e0e0; border:none; border-radius:12px; text-align:left; font-size:16px;">
              Каталог ${i}
            </button>
          `;
        }
      })
      .catch(() => {});
  }
}

// === СТРАНИЦА: ТОВАРЫ В КАТАЛОГЕ ===
async function renderCatalogItems(container, catalogId) {
  try {
    const res = await fetch(`api/catalog${catalogId}.json`);
    if (!res.ok) throw new Error('404');
    const data = await res.json();

    container.innerHTML = `<h2>${data.name}</h2><div id="items-list"></div>`;
    const itemsDiv = container.querySelector('#items-list');

    data.items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'product-card';
      // Поддержка изображений (если есть поле "image")
      const imgTag = item.image
        ? `<img src="${item.image}" alt="${item.name}" style="width:100%; height:120px; object-fit:cover; border-radius:8px; margin-bottom:10px;">`
        : '';
      card.innerHTML = `
        ${imgTag}
        <strong>${item.name}</strong><br>
        <small>${item.description}</small>
      `;
      card.onclick = () => showVariants(item, catalogId);
      itemsDiv.appendChild(card);
    });
  } catch (e) {
    container.innerHTML = `<p style="color:#ff6b6b;">❌ Ошибка загрузки каталога</p>`;
  }
}

// === ПОКАЗАТЬ ВАРИАЦИИ ТОВАРА ===
async function showVariants(item, catalogId) {
  try {
    const res = await fetch(`api/catalog${catalogId}.json`);
    const data = await res.json();
    const targetItem = data.items.find(it => it.id === item.id);

    let html = `<h3>${item.name}</h3>`;
    if (targetItem?.image) {
      html += `<img src="${targetItem.image}" alt="${item.name}" style="width:100%; height:120px; object-fit:cover; border-radius:8px; margin-bottom:12px;">`;
    }
    if (targetItem?.subcategories?.length) {
      targetItem.subcategories.forEach(sub => {
        html += `
          <button class="subcat"
                  onclick="confirmAddToCart('${item.id}', '${item.name}', '${sub.type}', ${sub.price})">
            ${sub.type} — ${sub.price} ₽
          </button><br>
        `;
      });
    } else {
      html += '<p>Вариации не найдены.</p>';
    }
    document.getElementById('content').innerHTML = html;
  } catch (e) {
    document.getElementById('content').innerHTML = '<p style="color:#ff6b6b;">❌ Ошибка загрузки.</p>';
  }
}

// === ГЛОБАЛЬНЫЕ ФУНКЦИИ ===
window.confirmAddToCart = (id, name, type, price) => {
  if (confirm(`Добавить "${type}" в корзину за ${price} ₽?`)) {
    cart.push({ id, name, type, price: Number(price) });
    localStorage.setItem('cart', JSON.stringify(cart));
    alert('✅ Товар добавлен в корзину!');
    navigate('cart');
  }
};

window.removeFromCart = (index) => {
  cart.splice(index, 1);
  localStorage.setItem('cart', JSON.stringify(cart));
  navigate('cart');
};

window.placeOrder = (total) => {
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

  // --- ВАЖНО: замените на имя ВАШЕГО бота (того же, что открывает Mini App) ---
  const orderBotUsername = 'gierniugegoieoehhepi_bot'; // ← ЗАМЕНИТЕ НА РЕАЛЬНОЕ ИМЯ!

  // УБРАЛ ЛИШНИЕ ПРОБЕЛЫ:
  const url = `https://t.me/${orderBotUsername}?start=order_${btoa(encodeURIComponent(message))}`;

  window.Telegram.WebApp.openTelegramLink(url);
};

// === СТРАНИЦЫ ===
function renderCart(container) {
  if (cart.length === 0) {
    container.innerHTML = '<h2>🛒 Ваша корзина пуста</h2>';
    return;
  }
  let total = cart.reduce((sum, item) => sum + item.price, 0);
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

// === ЗАПУСК ===
document.addEventListener('DOMContentLoaded', () => {
  navigate('catalog');
});
