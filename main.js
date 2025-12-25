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

// === NAV ===
function renderNavbar(active) {
  navbar.innerHTML = `
    <button onclick="navigate('catalog')" class="${active==='catalog'?'active':''}">🛍️</button>
    <button onclick="navigate('cart')" class="${active==='cart'?'active':''}">🛒</button>
    <button onclick="navigate('profile')" class="${active==='profile'?'active':''}">👤</button>
  `;
}

function navigate(page, id=null) {
  renderNavbar(page);
  if (page==='catalog') renderCatalogLine(content);
  if (page==='catalog-items') renderCatalogItems(content,id);
  if (page==='cart') renderCart(content);
  if (page==='profile') renderProfile(content);
}

// === КАТАЛОГИ ===
async function renderCatalogLine(container) {
  container.innerHTML = '<h2>Каталоги</h2>';

  for (let i=1;i<=4;i++) {
    const res = await fetch(`${GITHUB_API}/catalog${i}.json?_=${Date.now()}`);
    if (!res.ok) continue;
    const data = await res.json();

    container.innerHTML += `
      <button onclick="navigate('catalog-items',${i})">
        ${data.name}
      </button>
    `;
  }
}

// === ТОВАРЫ ===
async function renderCatalogItems(container,id) {
  const res = await fetch(`${GITHUB_API}/catalog${id}.json?_=${Date.now()}`);
  const data = await res.json();

  container.innerHTML = `<h2>${data.name}</h2><div id="items"></div>`;
  const itemsDiv = document.getElementById('items');

  data.items.forEach(item=>{
    const img = item.image
      ? `${BACKEND_URL}/tg-image/${item.image}`
      : 'https://via.placeholder.com/160';

    itemsDiv.innerHTML += `
      <div onclick='showVariants(${JSON.stringify(item)},${id})'>
        <img src="${img}">
        <h3>${item.name}</h3>
        <p>${item.description}</p>
      </div>
    `;
  });
}

// === ВАРИАЦИИ ===
async function showVariants(item,id) {
  const res = await fetch(`${GITHUB_API}/catalog${id}.json`);
  const data = await res.json();
  const target = data.items.find(i=>i.id===item.id);

  let html = `<h3>${item.name}</h3>`;
  target.subcategories.forEach(sub=>{
    const img = sub.image
      ? `${BACKEND_URL}/tg-image/${sub.image}`
      : 'https://via.placeholder.com/100';

    html+=`
      <div>
        <img src="${img}">
        <b>${sub.type}</b> — ${sub.price} ₽
        <button onclick="addToCart('${item.name}','${sub.type}',${sub.price})">🛒</button>
      </div>
    `;
  });

  content.innerHTML = html;
}

// === CART ===
window.addToCart = (name,type,price)=>{
  cart.push({name,type,price});
  localStorage.setItem('cart',JSON.stringify(cart));
  alert('Добавлено');
};

function renderCart(container){
  if(!cart.length){container.innerHTML='<h2>Пусто</h2>';return;}
  let total=cart.reduce((s,i)=>s+i.price,0);
  container.innerHTML = cart.map((i,idx)=>`
    ${i.name} (${i.type}) — ${i.price}
    <button onclick="removeFromCart(${idx})">❌</button>
  `).join('')+`<b>Итого ${total} ₽</b>
  <button onclick="placeOrder(${total})">Заказать</button>`;
}

window.removeFromCart=i=>{
  cart.splice(i,1);
  localStorage.setItem('cart',JSON.stringify(cart));
  navigate('cart');
};

// === ORDER ===
window.placeOrder=async total=>{
  if(!deliveryAddress||!phoneNumber){navigate('profile');return;}

  await fetch(`${BACKEND_URL}/order`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      phone:phoneNumber,
      address:deliveryAddress,
      total,
      items:cart
    })
  });

  cart=[];
  localStorage.removeItem('cart');
  alert('Заказ отправлен');
  navigate('catalog');
};

// === PROFILE ===
function renderProfile(container){
  container.innerHTML=`
    <h2>Профиль</h2>
    ${tgUser?`<p>${tgUser.first_name}</p>`:''}
    <textarea id="addr">${deliveryAddress}</textarea>
    <input id="phone" value="${phoneNumber}">
    <button onclick="saveProfile()">Сохранить</button>
  `;
}

window.saveProfile=()=>{
  deliveryAddress=addr.value.trim();
  phoneNumber=phone.value.trim();
  localStorage.setItem('deliveryAddress',deliveryAddress);
  localStorage.setItem('phoneNumber',phoneNumber);
  alert('Сохранено');
};

// === START ===
document.addEventListener('DOMContentLoaded',()=>navigate('catalog'));
