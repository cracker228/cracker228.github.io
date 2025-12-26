// === БАЗОВАЯ ПРОВЕРКА TELEGRAM ===
if (!window.Telegram || !window.Telegram.WebApp) {
  document.body.innerHTML = `
    <div style="padding: 20px; text-align: center; font-family: Arial;">
      <h2>❌ Telegram WebApp не доступен</h2>
      <p>Откройте приложение только через Telegram</p>
      <button onclick="location.reload()" style="padding: 10px 20px; background: #3390ec; color: white; border: none; border-radius: 5px; margin-top: 15px;">
        Попробовать снова
      </button>
    </div>
  `;
  throw new Error('Not Telegram environment');
}

// === ИНИЦИАЛИЗАЦИЯ ===
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();
tg.enableClosingConfirmation();

console.log('✅ Telegram WebApp инициализирован');
console.log('🔹 Параметры:', {
  version: tg.version,
  platform: tg.platform,
  themeParams: tg.themeParams,
  initDataUnsafe: tg.initDataUnsafe
});

const tgUser = tg.initDataUnsafe?.user;
console.log('👤 Пользователь:', tgUser);

// === ДАННЫЕ ===
let cart = [];
try {
  cart = JSON.parse(localStorage.getItem('cart') || '[]');
  if (!Array.isArray(cart)) cart = [];
} catch (e) {
  console.error('Ошибка загрузки корзины:', e);
  cart = [];
}

let deliveryAddress = localStorage.getItem('deliveryAddress') || '';
let phoneNumber = localStorage.getItem('phoneNumber') || '';

console.log('🛒 Корзина при загрузке:', cart);
console.log('🏠 Адрес:', deliveryAddress);
console.log('📞 Телефон:', phoneNumber);

// === URL (ГАРАНТИРОВАННО БЕЗ ПРОБЕЛОВ) ===
const BACKEND_URL = 'https://cracker228-github-io.onrender.com';
const API = 'https://cracker228.github.io/catalogs';

console.log('🔗 BACKEND_URL:', BACKEND_URL);
console.log('🔗 API:', API);

// DOM
const content = document.getElementById('content');
const navbar = document.getElementById('navbar');

// === NAV ===
function renderNavbar(active) {
  if (!navbar) {
    console.error('Элемент navbar не найден');
    return;
  }
  
  navbar.innerHTML = `
    <button onclick="navigate('catalog')" class="${active === 'catalog' ? 'active' : ''}">🛍️</button>
    <button onclick="navigate('cart')" class="${active === 'cart' ? 'active' : ''}">🛒</button>
    <button onclick="navigate('profile')" class="${active === 'profile' ? 'active' : ''}">👤</button>
  `;
}

window.navigate = function(page, id = null) {
  renderNavbar(page);
  if (page === 'catalog') renderCatalogLine(content);
  if (page === 'catalog-items') renderCatalogItems(content, id);
  if (page === 'cart') renderCart(content);
  if (page === 'profile') renderProfile(content);
};

// === КАТАЛОГИ ===
async function renderCatalogLine(container) {
  if (!container) {
    console.error('Контейнер не найден');
    return;
  }
  
  container.innerHTML = '<h2>🛍 Каталоги</h2><div id="catalogs-container"></div>';
  const catalogsContainer = document.getElementById('catalogs-container');
  
  try {
    let found = false;

    for (let i = 1; i <= 4; i++) {
      try {
        console.log(`📡 Запрос каталога ${i}`);
        const res = await fetch(`${API}/catalog${i}.json?_=${Date.now()}`, {
          mode: 'cors',
          cache: 'no-cache'
        });
        
        console.log(`📄 Ответ каталога ${i}:`, res.status);
        
        if (!res.ok) {
          console.warn(`Каталог ${i} недоступен. Статус: ${res.status}`);
          continue;
        }

        const data = await res.json();
        console.log(`✅ Каталог ${i} загружен:`, data);
        
        found = true;

        const catalogBtn = document.createElement('button');
        catalogBtn.innerHTML = data.name || `Каталог ${i}`;
        catalogBtn.onclick = () => navigate('catalog-items', i);
        catalogBtn.style.margin = '10px 0';
        catalogBtn.style.width = '100%';
        catalogsContainer.appendChild(catalogBtn);
      } catch (e) {
        console.warn(`❌ Ошибка загрузки каталога ${i}:`, e);
      }
    }

    if (!found) {
      catalogsContainer.innerHTML = '<p style="color: #d32f2f;">Нет доступных каталогов. Попробуйте позже.</p>';
    }
  } catch (e) {
    console.error('❌ Критическая ошибка загрузки каталогов:', e);
    catalogsContainer.innerHTML = `
      <p style="color: #d32f2f;">Ошибка загрузки каталогов</p>
      <button onclick="renderCatalogLine(document.getElementById('content'))" 
              style="margin-top: 10px; background: #d32f2f; color: white; border: none; padding: 8px 16px; border-radius: 4px;">
        Повторить попытку
      </button>
    `;
  }
}

// === ТОВАРЫ ===
async function renderCatalogItems(container, id) {
  if (!container) return;
  
  try {
    container.innerHTML = `<h2>Загрузка...</h2>`;
    
    console.log(`📡 Запрос товаров для каталога ${id}`);
    const res = await fetch(`${API}/catalog${id}.json?_=${Date.now()}`, {
      mode: 'cors',
      cache: 'no-cache'
    });
    
    console.log(`📄 Ответ товаров:`, res.status);
    
    if (!res.ok) throw new Error(`Статус: ${res.status}`);
    
    const data = await res.json();
    console.log(`✅ Товары загружены:`, data);
    
    container.innerHTML = `<h2>${data.name || 'Каталог ' + id}</h2><div id="items-list"></div>`;
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
      card.style.border = '1px solid #ccc';
      card.style.borderRadius = '8px';
      card.style.padding = '15px';
      card.style.margin = '10px 0';
      card.style.cursor = 'pointer';
      card.innerHTML = `
        <div style="text-align: center; margin-bottom: 10px;">
          <img src="${img}" alt="${item.name}" style="width: 100%; max-height: 200px; object-fit: contain;" 
               onerror="this.src='https://via.placeholder.com/300x200?text=Ошибка+загрузки'">
        </div>
        <h3>${item.name}</h3>
        <p>${item.description || 'Описание отсутствует'}</p>
      `;
      card.onclick = () => showVariants(item.id, id, item.name, item.description);
      itemsDiv.appendChild(card);
    });
  } catch (e) {
    console.error('❌ Ошибка загрузки товаров:', e);
    container.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <h3>❌ Ошибка загрузки товаров</h3>
        <p>${e.message || 'Неизвестная ошибка'}</p>
        <button onclick="renderCatalogItems(document.getElementById('content'), ${id})" 
                style="margin-top: 15px; background: #d32f2f; color: white; border: none; padding: 8px 16px; border-radius: 4px;">
          Повторить попытку
        </button>
        <button onclick="navigate('catalog')" 
                style="margin-top: 10px; background: #3390ec; color: white; border: none; padding: 8px 16px; border-radius: 4px;">
          К каталогам
        </button>
      </div>
    `;
  }
}

// === ВАРИАЦИИ ===
async function showVariants(itemId, catalogId, itemName, itemDesc) {
  try {
    console.log(`📡 Запрос вариаций для товара ${itemName} (ID: ${itemId})`);
    const res = await fetch(`${API}/catalog${catalogId}.json?_=${Date.now()}`, {
      mode: 'cors',
      cache: 'no-cache'
    });
    
    if (!res.ok) throw new Error('Каталог не найден');
    
    const data = await res.json();
    const item = data.items.find(i => i.id === itemId);
    if (!item) throw new Error('Товар не найден');

    let html = `
      <button onclick="navigate('catalog-items', ${catalogId})" 
              style="margin-bottom: 15px; background: #666; color: white; border: none; padding: 8px 16px; border-radius: 4px;">
        ← Назад к товарам
      </button>
      <h3>${itemName}</h3>
      <p>${itemDesc || ''}</p>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px; margin-top: 15px;">
    `;

    if (!item.subcategories || !item.subcategories.length) {
      html += '<p style="color: #d32f2f;">Нет доступных вариаций</p>';
    } else {
      item.subcategories.forEach((sub, idx) => {
        const img = sub.image
          ? `${BACKEND_URL}/tg-image/${sub.image}`
          : 'https://via.placeholder.com/100?text=Нет+фото';

        html += `
          <div style="border: 1px solid #ccc; border-radius: 8px; padding: 15px; text-align: center;">
            <img src="${img}" style="width: 80px; height: 80px; object-fit: contain; margin: 0 auto; display: block;"
                 onerror="this.src='https://via.placeholder.com/100?text=Ошибка'">
            <div style="font-weight: bold; margin: 8px 0;">${sub.type || 'Без названия'}</div>
            <div style="color: #3390ec; font-size: 18px; margin: 4px 0;">${sub.price || 0} ₽</div>
            <button onclick="addToCart('${itemName.replace(/'/g, "\\'")}', 
                                     '${(sub.type || '').replace(/'/g, "\\'")}', 
                                     ${sub.price || 0})"
                    style="background: #4CAF50; color: white; border: none; padding: 8px; border-radius: 4px; width: 100%; margin-top: 8px;">
              🛒 В корзину
            </button>
          </div>
        `;
      });
    }

    html += '</div>';
    content.innerHTML = html;
  } catch (e) {
    console.error('❌ Ошибка загрузки вариаций:', e);
    content.innerHTML = `
      <button onclick="navigate('catalog-items', ${catalogId})" 
              style="margin-bottom: 15px; background: #666; color: white; border: none; padding: 8px 16px; border-radius: 4px;">
        ← Назад к товарам
      </button>
      <div style="text-align: center; padding: 20px; color: #d32f2f;">
        <h3>❌ Ошибка загрузки вариаций</h3>
        <p>${e.message || 'Неизвестная ошибка'}</p>
      </div>
    `;
  }
}

// === CART ===
window.addToCart = (name, type, price) => {
  try {
    console.log('🛒 Добавление в корзину:', { name, type, price });
    
    if (!price || price <= 0) {
      tg.showAlert('❌ Некорректная цена товара');
      return;
    }

    const item = {
      name: name.toString().trim(),
      type: type.toString().trim(),
      price: Number(price)
    };
    
    cart.push(item);
    localStorage.setItem('cart', JSON.stringify(cart));
    
    console.log('✅ Товар добавлен:', item);
    console.log('🛒 Текущая корзина:', cart);
    
    tg.showAlert('✅ Товар добавлен в корзину');
    
    // Автоматически обновляем отображение корзины, если мы на странице корзины
    if (window.currentView === 'cart') {
      renderCart(content);
    }
    
  } catch (e) {
    console.error('❌ Ошибка добавления в корзину:', e);
    tg.showAlert('❌ Ошибка добавления товара: ' + e.message);
  }
};

function renderCart(container) {
  window.currentView = 'cart';
  
  if (!container) return;
  
  if (!cart.length) {
    container.innerHTML = `
      <h2>🛒 Корзина пуста</h2>
      <p>Добавьте товары для оформления заказа</p>
      <button onclick="navigate('catalog')" 
              style="margin-top: 15px; background: #3390ec; color: white; border: none; padding: 10px 20px; border-radius: 5px;">
        Выбрать товары
      </button>
    `;
    return;
  }

  let total = cart.reduce((s, i) => s + Number(i.price || 0), 0);
  let html = `
    <button onclick="navigate('catalog')" 
            style="margin-bottom: 15px; background: #666; color: white; border: none; padding: 8px 16px; border-radius: 4px;">
      ← Продолжить покупки
    </button>
    <h2>🛒 Корзина (${cart.length} товаров)</h2>
  `;

  cart.forEach((i, idx) => {
    html += `
      <div style="border-bottom: 1px solid #eee; padding: 10px 0; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong>${i.name}</strong>
          ${i.type ? `<div style="color: #666; font-size: 14px;">${i.type}</div>` : ''}
          <div style="color: #3390ec; font-weight: bold;">${i.price || 0} ₽</div>
        </div>
        <button onclick="removeFromCart(${idx})" 
                style="background: #ff5c5c; color: white; border: none; width: 30px; height: 30px; border-radius: 50%; font-weight: bold;">
          ×
        </button>
      </div>
    `;
  });

  html += `
    <div style="text-align: right; padding: 15px 0; font-size: 20px; font-weight: bold; border-top: 2px solid #3390ec; margin-top: 15px;">
      Итого: ${total} ₽
    </div>
    <button onclick="placeOrder()" 
            style="width: 100%; padding: 15px; background: #4CAF50; color: white; border: none; border-radius: 5px; font-size: 18px; margin-top: 15px;">
      Оформить заказ
    </button>
    
    <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
      <h4>📋 Для оформления заказа:</h4>
      <ul style="color: #666; margin-left: 20px;">
        <li>Заполните профиль (адрес и телефон)</li>
        <li>Убедитесь, что корзина не пуста</li>
        <li>Нажмите "Оформить заказ"</li>
      </ul>
      <button onclick="navigate('profile')" 
              style="margin-top: 10px; background: #2196F3; color: white; border: none; padding: 8px 16px; border-radius: 4px; width: 100%;">
        Перейти в профиль
      </button>
    </div>
  `;

  container.innerHTML = html;
}

window.removeFromCart = (i) => {
  console.log('🗑️ Удаление из корзины, индекс:', i);
  
  if (i >= 0 && i < cart.length) {
    const removedItem = cart.splice(i, 1)[0];
    localStorage.setItem('cart', JSON.stringify(cart));
    console.log('✅ Удален товар:', removedItem);
    console.log('🛒 Обновленная корзина:', cart);
    renderCart(content);
    tg.showAlert('✅ Товар удален из корзины');
  } else {
    console.error('❌ Неверный индекс для удаления:', i);
  }
};

// === ORDER (СУПЕР-ДЕТАЛЬНАЯ ОТЛАДКА) ===
window.placeOrder = async () => {
  console.log('🚀 Начало процесса оформления заказа');
  console.log('📊 Текущие данные:');
  console.log('🛒 Корзина:', cart);
  console.log('🏠 Адрес:', deliveryAddress);
  console.log('📞 Телефон:', phoneNumber);
  console.log('👤 Пользователь Telegram:', tgUser);
  
  try {
    // 1. Проверка корзины
    if (!Array.isArray(cart) || cart.length === 0) {
      console.error('❌ Корзина пуста или не является массивом');
      tg.showAlert('⚠️ Корзина пуста');
      return;
    }

    console.log('✅ Корзина проверена, товаров:', cart.length);

    // 2. Проверка профиля
    if (!deliveryAddress.trim() || !phoneNumber.trim()) {
      console.error('❌ Профиль не заполнен');
      tg.showAlert('⚠️ Заполните профиль (адрес и телефон)');
      navigate('profile');
      return;
    }

    console.log('✅ Профиль проверен');

    // 3. Создаем безопасные данные заказа
    const safeItems = cart.map(item => ({
      name: (item.name || 'Товар без названия').toString().trim(),
      variant: (item.type || 'Без вариации').toString().trim(),
      price: Number(item.price) || 0
    }));

    console.log('✅ Обработанные товары:', safeItems);

    // 4. Рассчитываем итог
    const total = safeItems.reduce((sum, item) => sum + item.price, 0);
    console.log('💰 Итоговая сумма:', total);

    // 5. Формируем заказ
    const orderData = {
      items: safeItems,
      contact: phoneNumber.trim(),
      address: deliveryAddress.trim(),
      total: total,
      timestamp: new Date().toISOString(),
      userId: tgUser?.id || 'unknown',
      userName: tgUser?.first_name || 'Пользователь'
    };

    console.log('📦 Сформированный заказ:', orderData);

    // 6. Сериализуем и проверяем
    let orderJson = '';
    try {
      orderJson = JSON.stringify(orderData);
      console.log('🔤 Сериализованный JSON:', orderJson);
    } catch (e) {
      console.error('❌ Ошибка сериализации:', e);
      tg.showAlert('❌ Ошибка формирования заказа: ' + e.message);
      return;
    }

    if (!orderJson || orderJson === 'undefined' || orderJson === '{}') {
      console.error('❌ Пустой или некорректный JSON');
      tg.showAlert('❌ Ошибка формирования данных заказа');
      return;
    }

    // 7. ДЕТАЛЬНАЯ ОТЛАДКА ПЕРЕД ОТПРАВКОЙ
    console.log('🔍 Предотправочная проверка:');
    console.log('📱 tg:', tg);
    console.log('📱 tg.WebApp:', tg.WebApp);
    console.log('📱 tg.WebApp.sendData:', typeof tg.WebApp.sendData);
    
    if (typeof tg.WebApp.sendData !== 'function') {
      console.error('❌ tg.WebApp.sendData не является функцией!');
      tg.showAlert('❌ Ошибка: sendData не доступен');
      return;
    }

    // 8. Отправляем в Telegram
    console.log('📤 Отправка данных в Telegram...');
    
    // Для максимальной отладки - показываем что отправляем
    tg.showAlert('📤 Отправка заказа...\nСумма: ' + total + ' ₽');
    
    try {
      tg.WebApp.sendData(orderJson);
      console.log('✅ Данные успешно отправлены в Telegram');
      
      // 9. Очищаем корзину и закрываем
      cart = [];
      localStorage.setItem('cart', JSON.stringify(cart));
      
      tg.showAlert('✅ Заказ успешно оформлен!');
      console.log('✅ Заказ оформлен, корзина очищена');
      
      // Даем время на показ алерта перед закрытием
      setTimeout(() => {
        tg.close();
      }, 1500);
      
    } catch (sendError) {
      console.error('❌ Ошибка отправки через sendData:', sendError);
      tg.showAlert('❌ Ошибка отправки заказа: ' + sendError.message);
    }
    
  } catch (error) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА при оформлении заказа:', error);
    console.error('❌ Стек ошибки:', error.stack);
    tg.showAlert('❌ Критическая ошибка: ' + (error.message || 'Неизвестная ошибка'));
  }
};

// === PROFILE ===
function renderProfile(container) {
  window.currentView = 'profile';
  
  if (!container) return;
  
  container.innerHTML = `
    <button onclick="navigate('catalog')" 
            style="margin-bottom: 15px; background: #666; color: white; border: none; padding: 8px 16px; border-radius: 4px;">
      ← Назад к каталогам
    </button>
    <h2>👤 Профиль</h2>
    ${tgUser ? `<p>Привет, <strong>${tgUser.first_name || ''} ${tgUser.last_name || ''}</strong></p>` : ''}
    <div style="margin: 15px 0;">
      <label style="display: block; margin-bottom: 5px; font-weight: bold;">Адрес доставки</label>
      <textarea id="addr" placeholder="Укажите полный адрес" 
                style="width: 100%; padding: 12px; border: 1px solid #ccc; border-radius: 5px; box-sizing: border-box; min-height: 80px;">${deliveryAddress}</textarea>
    </div>
    <div style="margin: 15px 0;">
      <label style="display: block; margin-bottom: 5px; font-weight: bold;">Телефон</label>
      <input id="phone" placeholder="+7 (999) 123-45-67" type="tel" 
             style="width: 100%; padding: 12px; border: 1px solid #ccc; border-radius: 5px; box-sizing: border-box;" 
             value="${phoneNumber}">
    </div>
    <button onclick="saveProfile()" 
            style="width: 100%; padding: 12px; background: #2196F3; color: white; border: none; border-radius: 5px; font-size: 16px; margin-top: 10px;">
      Сохранить профиль
    </button>
    
    <div style="margin-top: 25px; padding: 15px; background: #e3f2fd; border-radius: 8px;">
      <h4>ℹ️ Важно для оформления заказа</h4>
      <p style="color: #1565c0; margin: 10px 0;">
        Заполните адрес и телефон — без этого заказ не сможет быть оформлен.
      </p>
      <button onclick="navigate('cart')" 
              style="margin-top: 10px; background: #4CAF50; color: white; border: none; padding: 8px 16px; border-radius: 4px; width: 100%;">
        Перейти в корзину
      </button>
    </div>
  `;
}

window.saveProfile = () => {
  const newAddress = document.getElementById('addr')?.value.trim() || '';
  const newPhone = document.getElementById('phone')?.value.trim() || '';

  console.log('💾 Сохранение профиля:', { address: newAddress, phone: newPhone });
  
  if (!newPhone || !/^\+?[0-9\s\-()]{10,}$/.test(newPhone)) {
    console.error('❌ Некорректный телефон:', newPhone);
    tg.showAlert('⚠️ Укажите корректный телефон (не менее 10 цифр)');
    return;
  }

  if (newAddress.length < 5) {
    console.error('❌ Слишком короткий адрес:', newAddress);
    tg.showAlert('⚠️ Адрес должен быть не менее 5 символов');
    return;
  }

  deliveryAddress = newAddress;
  phoneNumber = newPhone;
  
  localStorage.setItem('deliveryAddress', deliveryAddress);
  localStorage.setItem('phoneNumber', phoneNumber);
  
  console.log('✅ Профиль сохранен:', { address: deliveryAddress, phone: phoneNumber });
  tg.showAlert('✅ Профиль успешно сохранен!');
};

// === START ===
document.addEventListener('DOMContentLoaded', () => {
  console.log('监听页面 загружена');
  
  // Устанавливаем тему
  const theme = tg.colorScheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.body.className = theme;
  document.documentElement.style.setProperty('--tg-theme', theme);
  
  console.log('🎨 Тема установлена:', theme);
  
  // Инициализация кнопки "Назад"
  try {
    tg.BackButton.show();
    tg.onEvent('backButtonClicked', () => {
      console.log('🔙 Кнопка "Назад" нажата');
      const currentView = window.currentView || 'catalog';
      
      if (currentView === 'catalog-items') {
        navigate('catalog');
      } else if (currentView === 'cart' || currentView === 'profile') {
        navigate('catalog');
      } else {
        tg.close();
      }
    });
    console.log('✅ Кнопка "Назад" настроена');
  } catch (e) {
    console.warn('⚠️ Кнопка "Назад" недоступна:', e);
  }
  
  // Стартуем с каталога
  console.log('🚀 Запуск приложения, начальная страница: каталог');
  navigate('catalog');
  
  // Добавляем тестовую кнопку для отладки
  const debugBtn = document.createElement('button');
  debugBtn.innerHTML = '🔧 Тест отправки';
  debugBtn.style.position = 'fixed';
  debugBtn.style.bottom = '90px';
  debugBtn.style.right = '10px';
  debugBtn.style.padding = '5px 10px';
  debugBtn.style.backgroundColor = '#ff9800';
  debugBtn.style.color = 'white';
  debugBtn.style.border = 'none';
  debugBtn.style.borderRadius = '20px';
  debugBtn.style.fontSize = '12px';
  debugBtn.style.zIndex = '1000';
  debugBtn.onclick = testOrderSend;
  document.body.appendChild(debugBtn);
  
  console.log('✅ Приложение полностью инициализировано');
});

// === ТЕСТОВАЯ ФУНКЦИЯ ДЛЯ ОТЛАДКИ ===
function testOrderSend() {
  console.log('🔧 Запуск тестовой отправки заказа');
  
  const testOrder = {
    items: [{name: "Тестовый товар", variant: "Тестовая вариация", price: 999}],
    contact: "+79991234567",
    address: "г. Тестовый, ул. Тестовая, д. 1",
    total: 999,
    timestamp: new Date().toISOString(),
    userId: tgUser?.id || 'test-user',
    testMode: true
  };
  
  const testJson = JSON.stringify(testOrder);
  console.log('🔧 Тестовые данные:', testJson);
  
  try {
    if (typeof tg.WebApp.sendData === 'function') {
      tg.WebApp.sendData(testJson);
      console.log('✅ Тестовые данные успешно отправлены');
      tg.showAlert('✅ Тест отправлен успешно!');
    } else {
      console.error('❌ sendData не является функцией');
      tg.showAlert('❌ Ошибка: sendData недоступен');
    }
  } catch (e) {
    console.error('❌ Ошибка тестовой отправки:', e);
    tg.showAlert('❌ Ошибка теста: ' + e.message);
  }
}
