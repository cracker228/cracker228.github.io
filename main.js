// Защита от запуска вне Telegram
if (typeof window.Telegram === 'undefined') {
  document.body.innerHTML = `
    <div style="padding:20px; text-align:center; font-family:sans-serif;">
      <h2>⚠️ Этот сайт работает только внутри Telegram</h2>
      <p>Откройте его через Mini App в боте @shop_bot</p>
    </div>
  `;
  throw new Error('Not running in Telegram Web App');
}

// === ГЛОБАЛЬНЫЕ ДАННЫЕ ===
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let deliveryAddress = localStorage.getItem('deliveryAddress') || '';

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
function navigate(page) {
  renderNavbar(page);
  const content = document.getElementById('content');
  if (!content) return;

  switch (page) {
    case 'catalog':
      renderCatalog(content);
      break;
    case 'cart':
      renderCart(content);
      break;
    case 'profile':
      renderProfile(content);
      break;
    default:
      renderCatalog(content);
  }
}

// === КАТАЛОГ ===
async function renderCatalog(container) {
  container.innerHTML = '<h2>Добро пожаловать в магазин!</h2>';
  for (let i = 1; i <= 4; i++) {
    try {
      // ← Все файлы должны быть в одной папке! Выберите ОДИН вариант:
      const res = await fetch(`catalog${i}.json`); // ← рекомендуется
      // const res = await fetch(`catalog${i}.json`); // ← если файлы в корне
      if (!res.ok) throw new Error('404');
      const data = await res.json();
      container.innerHTML += `<h3>${data.name}</h3><div id="cat-${i}"></div>`;
      const catDiv = container.querySelector(`#cat-${i}`);
      data.items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.dataset.id = item.id;
        card.dataset.name = item.name;
        card.dataset.cat = i;
        card.innerHTML = `<strong>${item.name}</strong><br><small>${item.description}</small>`;
        card.onclick = () => showSubcategories(item, i);
        catDiv.appendChild(card);
      });
    } catch (e) {
      console.error(`Ошибка загрузки catalog${i}.json:`, e);
      container.innerHTML += `<p style="color:red;">❌ Каталог ${i} недоступен</p>`;
    }
  }
}

async function showSubcategories(item, catIndex) {
  try {
    const res = await fetch(`catalog${catIndex}.json`);
    if (!res.ok) throw new Error();
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
      html += '<p>Подкатегории не найдены.</p>';
    }
    document.getElementById('content').innerHTML = html;
  } catch (e) {
    document.getElementById('content').innerHTML = '<p style="color:red;">Ошибка загрузки подкатегорий.</p>';
  }
}

// === ГЛОБАЛЬНЫЕ ФУНКЦИИ (доступны из onclick) ===
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

  if (!address) {
    alert('❗ Укажите адрес доставки в личном кабинете!');
    navigate('profile');
    return;
  }

  const itemsText = cart.map(i => `- ${i.name} (${i.type}) — ${i.price} ₽`).join('\n');
  const paymentText = paymentMethod === 'cash' ? 'Наличными' : 'Переводом';
  let message = `📦 НОВЫЙ ЗАКАЗ\n\nАдрес: ${address}\nОплата: ${paymentText}\nСумма: ${total} ₽\n\nТовары:\n${itemsText}`;

  const encoded = btoa(encodeURIComponent(message));
  const orderBotUsername = 'gierniugegoieoehhepi_bot'; // ← Убедитесь, что имя верное!

  const url = `https://t.me/${orderBotUsername}?start=order_${encoded}`; // ← УБРАЛ ПРОБЕЛЫ!
  window.Telegram.WebApp.openTelegramLink(url);
};

window.saveAddress = () => {
  const addr = document.getElementById('delivery-address')?.value?.trim();
  if (addr) {
    deliveryAddress = addr;
    localStorage.setItem('deliveryAddress', addr);
    alert('✅ Адрес сохранён!');
  } else {
    alert('❗ Пожалуйста, введите адрес.');
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
