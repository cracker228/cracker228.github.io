// Защита от запуска вне Telegram
if (typeof window.Telegram === 'undefined') {
  document.body.innerHTML = `
    <div style="padding:20px; text-align:center; font-family:sans-serif;">
      <h2>⚠️ Этот сайт работает только внутри Telegram</h2>
      <p>Откройте его через Mini App в боте</p>
    </div>
  `;
  throw new Error('Not running in Telegram Web App');
}

// === ГЛОБАЛЬНЫЕ ДАННЫЕ ===
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let deliveryAddress = localStorage.getItem('deliveryAddress') || '';
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
                    style="width:100%; padding:12px; margin:8px 0; background:#f0f0f0; border:none; border-radius:8px; text-align:left;">
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
      card.innerHTML = `<strong>${item.name}</strong><br><small>${item.description}</small>`;
      card.onclick = () => showVariants(item, catalogId);
      itemsDiv.appendChild(card);
    });
  } catch (e) {
    container.innerHTML = `<p style="color:red;">Ошибка загрузки каталога</p>`;
  }
}

// === ПОКАЗАТЬ ВАРИАЦИИ ТОВАРА ===
async function showVariants(item, catalogId) {
  try {
    const res = await fetch(`api/catalog${catalogId}.json`);
    const data = await res.json();
    const targetItem = data.items.find(it => it.id === item.id);

    let html = `<h3>${item.name}</h3>`;
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
    document.getElementById('content').innerHTML = '<p style="color:red;">Ошибка загрузки.</p>';
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

window.placeOrder = async (total) => {
  const paymentMethod = document.getElementById('payment-method')?.value || 'cash';
  const address = deliveryAddress.trim();

  if (!address) {
    alert('Укажите адрес доставки в личном кабинете!');
    navigate('profile');
    return;
  }

  const itemsText = cart.map(i => `- ${i.name} (${i.type}) — ${i.price} ₽`).join('\n');
  const paymentText = paymentMethod === 'cash' ? 'Наличными' : 'Переводом';
  const message = `📦 НОВЫЙ ЗАКАЗ\n\nАдрес: ${address}\nОплата: ${paymentText}\nСумма: ${total} ₽\n\nТовары:\n${itemsText}`;

  try {
    const res = await fetch('https://98336acf-01d5-468f-8e37-12c8dfdecc91-00-3lkm6n8epp37w.worf.replit.dev/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    if (res.ok) {
      alert('✅ Заказ отправлен!');
      cart = [];
      localStorage.setItem('cart', JSON.stringify(cart));
      navigate('catalog');
    } else {
      alert('Ошибка отправки заказа');
    }
  } catch (e) {
    alert('Ошибка сети');
  }
};

window.saveAddress = () => {
  const addr = document.getElementById('delivery-address')?.value?.trim();
  if (addr) {
    deliveryAddress = addr;
    localStorage.setItem('deliveryAddress', addr);
    alert('✅ Адрес сохранён!');
  } else {
    alert('Введите адрес.');
  }
};

// === СТРАНИЦЫ ===
function renderCart(container) {
  if (cart.length === 0) {
    container.innerHTML = '<h2>🛒 Ваша корзина пуста</h2>';
    return;
  }
  let total = cart.reduce((sum, item) => sum + item.price, 0);
  let html = `<h2>🛒 Корзина</h2><ul>`;
  cart.forEach((item, index) => {
    html += `<li>${item.name} (${item.type}) — ${item.price} ₽
      <button onclick="removeFromCart(${index})" style="float:right; background:#dc3545; border:none; color:white; border-radius:4px;">❌</button>
    </li>`;
  });
  html += `</ul><p><strong>Итого: ${total} ₽</strong></p>`;
  html += `
    <label>Способ оплаты:
      <select id="payment-method">
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
    <label>Адрес доставки:
      <textarea id="delivery-address" rows="4" placeholder="Улица, дом, квартира...">${deliveryAddress}</textarea>
    </label><br>
    <button onclick="saveAddress()">💾 Сохранить адрес</button>
  `;
}

// === ЗАПУСК ===
document.addEventListener('DOMContentLoaded', () => {
  navigate('catalog');
});
