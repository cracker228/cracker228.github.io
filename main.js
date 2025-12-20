const API_BASE_URL = 'https://cracker228-github-io.onrender.com';

async function renderCatalogItems(container, catalogId) {
  const res = await fetch(`${API_BASE_URL}/api/catalog${catalogId}.json`);
  const data = await res.json();
  container.innerHTML = '';

  data.items.forEach(item => {
    const img = item.subcategories[0]?.image
      ? `${API_BASE_URL}/tg-image/${item.subcategories[0].image}`
      : null;

    container.innerHTML += `
      <div class="product-card">
        ${img ? `<img src="${img}">` : `<div class="no-photo">Нет фото</div>`}
        <h3>${item.name}</h3>
        <p>${item.description}</p>
      </div>
    `;
  });
}
