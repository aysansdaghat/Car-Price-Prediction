
const $ = (id) => document.getElementById(id);

let dashboardData = null;

// ========================================
// FORMATTERS
// ========================================

function formatNumber(value) {
  return new Intl.NumberFormat('fa-IR').format(value);
}

function formatToman(value) {
  return new Intl.NumberFormat('fa-IR', {
    maximumFractionDigits: 0
  }).format(value);
}

function formatBillion(value) {
  return new Intl.NumberFormat('fa-IR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value / 1e9);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

// ========================================
// SELECT INPUTS
// ========================================

function fillSelect(id, values, preferred) {
  const select = $(id);
  select.innerHTML = '';

  values.forEach(value => {
    const option = document.createElement('option');

    option.value = value;
    option.textContent = value;

    if (preferred && value === preferred) {
      option.selected = true;
    }

    select.appendChild(option);
  });
}

function updateModels(preferredModel) {
  const brand = $('Brand').value;

  const models =
    dashboardData.options.models_by_brand[brand] || [];

  fillSelect('Model', models, preferredModel);
}

// ========================================
// DARK MODE
// ========================================

function setupTheme() {
  const savedTheme = localStorage.getItem(
    'car-dashboard-theme'
  );

  const prefersDark = window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  const theme = savedTheme ||
    (prefersDark ? 'dark' : 'light');

  applyTheme(theme);

  const themeButton = $('themeToggle');

  if (!themeButton) return;

  themeButton.addEventListener('click', () => {
    const currentTheme = document.body.dataset.theme;

    const nextTheme =
      currentTheme === 'dark' ? 'light' : 'dark';

    applyTheme(nextTheme);

    localStorage.setItem(
      'car-dashboard-theme',
      nextTheme
    );
  });
}

function applyTheme(theme) {
  // هماهنگ‌سازی data-theme و کلاس CSS
  document.body.dataset.theme = theme;

  document.body.classList.toggle(
    'dark',
    theme === 'dark'
  );

  updateThemeButton();
}

function updateThemeButton() {
  const themeButton = $('themeToggle');

  if (!themeButton) return;

  const dark =
    document.body.dataset.theme === 'dark';

  themeButton.textContent = dark
    ? '☀️ حالت روشن'
    : '🌙 حالت تاریک';
}

// ========================================
// VEHICLE SEARCH
// ========================================

function setupVehicleSearch() {
  const input = $('vehicleSearch');
  const list = $('vehicleSuggestions');

  const entries = [];

  Object.entries(
    dashboardData.options.models_by_brand || {}
  ).forEach(([brand, models]) => {

    entries.push({
      label: brand,
      brand,
      model: ''
    });

    models.forEach(model => {
      entries.push({
        label: `${brand} — ${model}`,
        brand,
        model
      });
    });

  });

  list.innerHTML = entries.map(item =>
    `<option value="${escapeHtml(item.label)}"></option>`
  ).join('');

  function applySearch() {
    const query = input.value.trim().toLocaleLowerCase();

    if (!query) return;

    const match = entries.find(
      item => item.label.toLocaleLowerCase() === query
    ) || entries.find(
      item => item.label.toLocaleLowerCase().includes(query)
    );

    if (!match) {
      input.setCustomValidity(
        'برند یا مدل موردنظر در داده‌های پروژه پیدا نشد.'
      );

      input.reportValidity();
      return;
    }

    input.setCustomValidity('');

    $('Brand').value = match.brand;

    updateModels(match.model || undefined);

    if (match.model) {
      $('Model').value = match.model;
    }
  }

  input.addEventListener('change', applySearch);

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applySearch();
    }
  });

  input.addEventListener('input', () => {
    input.setCustomValidity('');
  });
}

// ========================================
// CHART ANIMATIONS
// ========================================

function animateBars() {
  document.querySelectorAll(
    '.bar-fill, .category-fill, .pro-bar-fill, .pro-category-fill, .extra-bar-fill'
  ).forEach(bar => {

    const targetWidth = bar.dataset.width;
    const targetHeight = bar.dataset.height;

    if (targetHeight) bar.style.height = '0%';
    else bar.style.width = '0%';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (targetHeight) bar.style.height = targetHeight;
        else if (targetWidth) bar.style.width = targetWidth;
      });
    });

  });
}

// ========================================
// BRAND PRICE CHART
// ========================================

function renderBrandChart(data) {
  const sorted = [...data.brand_average].sort(
    (a, b) => b.price - a.price
  );

  const max = Math.max(
    ...sorted.map(item => item.price),
    1
  );

  const scale = [0, 25, 50, 75, 100];

  $('brandChart').innerHTML = `
    <div class="chart-unit">
      واحد قیمت: میلیارد تومان
    </div>

    <div class="professional-brand-chart">

      ${sorted.map(item => {

        const width = Math.max(
          1,
          item.price / max * 100
        );

        return `
          <div class="pro-bar-row">

            <div class="pro-bar-label">
              <span>${escapeHtml(item.brand)}</span>
              <strong>${formatBillion(item.price)}</strong>
            </div>

            <div class="pro-bar-track">

              <div
                class="pro-bar-fill"
                data-width="${width}%"
                title="${escapeHtml(item.brand)}: ${formatBillion(item.price)} میلیارد تومان"
              ></div>

            </div>

          </div>
        `;

      }).join('')}

    </div>

    <div class="pro-chart-scale">
      ${scale.map(value =>
        `<span>${formatNumber(value)}</span>`
      ).join('')}
    </div>

    <div class="pro-chart-caption">
      <span>
        <i class="pro-legend"></i>
        میانگین قیمت هر برند
      </span>

      <span>مقادیر به میلیارد تومان</span>
    </div>
  `;
}

// ========================================
// PRICE CATEGORY CHART
// ========================================

function renderCategoryChart(data) {
  const cats = data.category_counts;

  const entries = [
    {
      label: 'اقتصادی',
      count: cats['اقتصادی'] || 0,
      cls: 'economic',
      icon: '◈'
    },
    {
      label: 'میان‌رده',
      count: cats['میان‌رده'] || 0,
      cls: 'middle',
      icon: '◆'
    },
    {
      label: 'گران‌قیمت',
      count: cats['گران‌قیمت'] || 0,
      cls: 'premium',
      icon: '✦'
    }
  ];

  const total = entries.reduce(
    (sum, item) => sum + item.count,
    0
  ) || 1;

  $('categoryChart').innerHTML = `

    <div class="category-summary">
      <strong>${formatNumber(total)}</strong>
      <span>خودرو در مجموعه داده‌ها</span>
    </div>

    <div class="pro-category-list">

      ${entries.map(item => {

        const percent = item.count / total * 100;

        return `
          <div class="pro-category-item">

            <div class="pro-category-heading">

              <span class="pro-category-name">

                <i class="category-symbol ${item.cls}">
                  ${item.icon}
                </i>

                ${item.label}

              </span>

              <strong>
                ${percent.toFixed(1)}٪
              </strong>

            </div>

            <div class="pro-category-track">

              <div
                class="pro-category-fill ${item.cls}"
                data-width="${percent}%"
                title="${formatNumber(item.count)} خودرو"
              ></div>

            </div>

            <div class="pro-category-meta">

              <span>
                ${formatNumber(item.count)} خودرو
              </span>

              <span>
                ${percent.toFixed(1)} درصد
              </span>

            </div>

          </div>
        `;

      }).join('')}

    </div>
  `;
}

// ========================================
// EXTRA DATA ANALYTICS
// ========================================

function renderYearChart(data) {
  const target = $('yearChart');
  const rows = (data.year_average || []).filter(item => Number(item.price) > 0);
  if (!rows.length) {
    target.innerHTML = '<p class="chart-empty">داده‌ای برای نمایش وجود ندارد.</p>';
    return;
  }
  const max = Math.max(...rows.map(item => item.price), 1);
  target.innerHTML = `
    <div class="extra-bars year-bars">
      ${rows.map(item => {
        const width = Math.max(3, item.price / max * 100);
        return `
          <div class="extra-bar-item" title="سال ${formatNumber(item.year)}: ${formatBillion(item.price)} میلیارد تومان">
            <div class="extra-bar-value">${formatBillion(item.price)}</div>
            <div class="extra-bar-track"><span class="extra-bar-fill" data-height="${width}%"></span></div>
            <div class="extra-bar-label">${formatNumber(item.year)}</div>
          </div>`;
      }).join('')}
    </div>
    <div class="extra-chart-note">مبالغ به میلیارد تومان · داده‌های مصنوعی پروژه</div>
  `;
}

function renderMileageChart(data) {
  const target = $('mileageChart');
  const rows = (data.mileage_average || []).filter(item => item.count > 0);
  if (!rows.length) {
    target.innerHTML = '<p class="chart-empty">داده‌ای برای نمایش وجود ندارد.</p>';
    return;
  }
  const max = Math.max(...rows.map(item => item.price), 1);
  target.innerHTML = `
    <div class="mileage-bars">
      ${rows.map(item => {
        const width = Math.max(3, item.price / max * 100);
        return `
          <div class="mileage-row">
            <div class="mileage-row-head">
              <span>${escapeHtml(item.range)}</span>
              <strong>${formatBillion(item.price)} <small>میلیارد تومان</small></strong>
            </div>
            <div class="extra-bar-track"><span class="extra-bar-fill mileage-fill" data-width="${width}%"></span></div>
            <div class="mileage-row-foot"><span>${formatNumber(item.count)} خودرو</span></div>
          </div>`;
      }).join('')}
    </div>
  `;
}

// ========================================
// MODEL PERFORMANCE TABLES
// ========================================

function renderModelTables(data) {

  $('regressionRows').innerHTML =
    data.regression.map((row, index) => `

      <tr class="${index === 0 ? 'best-row' : ''}">

        <td>${escapeHtml(row.model)}</td>

        <td>${formatToman(row.rmse)}</td>

        <td>${formatToman(row.mae)}</td>

        <td>${row.r2.toFixed(3)}</td>

      </tr>

    `).join('');

  $('classificationRows').innerHTML =
    data.classification.map((row, index) => `

      <tr class="${index === 0 ? 'best-row' : ''}">

        <td>${escapeHtml(row.model)}</td>

        <td>${(row.accuracy * 100).toFixed(1)}٪</td>

        <td>${row.f1.toFixed(3)}</td>

      </tr>

    `).join('');
}

// ========================================
// DASHBOARD STATISTICS
// ========================================

function renderMetrics(data) {

  $('rowsCount').textContent =
    formatNumber(data.rows);

  $('brandsCount').textContent =
    formatNumber(data.brands);

  const bestClass = data.classification.find(
    item => item.model === data.best_class_model
  );

  const bestReg = data.regression.find(
    item => item.model === data.best_price_model
  );

  $('accuracy').textContent = bestClass
    ? `${(bestClass.accuracy * 100).toFixed(1)}٪`
    : '—';

  $('r2').textContent = bestReg
    ? bestReg.r2.toFixed(3)
    : '—';

  renderBrandChart(data);

  renderCategoryChart(data);
  renderYearChart(data);
  renderMileageChart(data);

  renderModelTables(data);

  document.querySelectorAll('.stat-card').forEach(
    (card, index) => {

      card.style.setProperty('--card-order', index);

      card.classList.add('animate-in');

    }
  );

  animateBars();
}

// ========================================
// LOAD DASHBOARD DATA
// ========================================

async function loadDashboard() {

  const response = await fetch('/api/dashboard');

  if (!response.ok) {
    throw new Error('دریافت اطلاعات داشبورد ناموفق بود.');
  }

  dashboardData = await response.json();

  fillSelect(
    'Brand',
    dashboardData.options.brands,
    'Saipa'
  );

  fillSelect(
    'Gearbox',
    dashboardData.options.gearboxes,
    'Manual'
  );

  fillSelect(
    'Fuel_Type',
    dashboardData.options.fuel_types,
    'Petrol'
  );

  fillSelect(
    'Body_Condition',
    dashboardData.options.conditions,
    'Good'
  );

  updateModels();

  $('Brand').addEventListener(
    'change',
    () => updateModels()
  );

  setupVehicleSearch();

  renderMetrics(dashboardData.metrics);
}


// ========================================
// PREDICTION HISTORY (browser local storage)
// ========================================

const HISTORY_KEY = 'car-dashboard-prediction-history-v1';

function getPredictionHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    return [];
  }
}

function savePredictionHistory(item) {
  const history = getPredictionHistory();
  history.unshift(item);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 20)));
  renderPredictionHistory();
}

function renderPredictionHistory() {
  const container = $('historyList');
  if (!container) return;
  const history = getPredictionHistory();
  if (!history.length) {
    container.innerHTML = '<div class="history-empty">هنوز پیش‌بینی‌ای ثبت نشده است.</div>';
    return;
  }
  container.innerHTML = history.map(item => `
    <article class="history-item">
      <div class="history-car">
        <strong>${escapeHtml(item.brand)} ${escapeHtml(item.model)}</strong>
        <small>${escapeHtml(item.year)} · ${formatNumber(Number(item.mileage) || 0)} کیلومتر</small>
      </div>
      <div class="history-price">
        <strong>${formatToman(item.price)} تومان</strong>
        <small>${escapeHtml(item.category)}</small>
      </div>
      <time>${escapeHtml(item.date)}</time>
    </article>
  `).join('');
}

function setupPredictionHistory() {
  renderPredictionHistory();
  const clearButton = $('clearHistory');
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      if (!getPredictionHistory().length) return;
      if (window.confirm('تمام سوابق پیش‌بینی این مرورگر پاک شود؟')) {
        localStorage.removeItem(HISTORY_KEY);
        renderPredictionHistory();
      }
    });
  }
}

// ========================================
// VEHICLE PRICE PREDICTION
// ========================================

$('predictionForm').addEventListener(
  'submit',
  async event => {

    event.preventDefault();

    $('errorBox').classList.add('hidden');

    $('result').classList.add('hidden');

    const btn = $('predictBtn');

    btn.disabled = true;

    btn.textContent = 'در حال محاسبه…';

    const payload = {
      Brand: $('Brand').value,
      Model: $('Model').value,
      Year: $('Year').value,
      Mileage: $('Mileage').value,
      Engine_Size: $('Engine_Size').value,
      Gearbox: $('Gearbox').value,
      Fuel_Type: $('Fuel_Type').value,
      Body_Condition: $('Body_Condition').value
    };

    try {

      const response = await fetch('/api/predict', {

        method: 'POST',

        headers: {
          'Content-Type': 'application/json'
        },

        body: JSON.stringify(payload)

      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || 'خطا در پیش‌بینی قیمت'
        );
      }

      $('resultPrice').textContent =
        formatToman(result.predicted_price);

      $('resultCategory').textContent =
        result.category;

      $('resultMeta').textContent =
        `مدل قیمت: ${result.model_price} | مدل دسته‌بندی: ${result.model_class}`;

      $('result').classList.remove('hidden');

      $('result').classList.remove('result-pop');

      void $('result').offsetWidth;

      $('result').classList.add('result-pop');

      savePredictionHistory({
        brand: payload.Brand,
        model: payload.Model,
        year: payload.Year,
        mileage: payload.Mileage,
        price: result.predicted_price,
        category: result.category,
        date: new Date().toLocaleString('fa-IR')
      });

    } catch (error) {

      $('errorBox').textContent = error.message;

      $('errorBox').classList.remove('hidden');

    } finally {

      btn.disabled = false;

      btn.innerHTML =
        '<span>✦</span> محاسبه قیمت هوشمند';

    }

  }
);


// ========================================
// VEHICLE FILTERING & COMPARISON
// ========================================
let vehicleCache = [];


// Studio-style vehicle photos, shared by all dataset rows of the same model.
const VEHICLE_IMAGES = {
  // نگاشت تصاویر استودیویی بر اساس نزدیک‌ترین ظاهر و کلاس بدنه
  "BMW|Series 3": "/static/images/vehicles/vehicle_06.webp",
  "BMW|Series 5": "/static/images/vehicles/vehicle_07.webp",
  "Hyundai|Accent": "/static/images/vehicles/vehicle_05.webp",
  "Hyundai|Elantra": "/static/images/vehicles/vehicle_16.webp",
  "Hyundai|Tucson": "/static/images/vehicles/vehicle_13.webp",
  "Iran Khodro|Dena": "/static/images/vehicles/vehicle_08.webp",
  "Iran Khodro|Peugeot 206": "/static/images/vehicles/vehicle_03.webp",
  "Iran Khodro|Runna": "/static/images/vehicles/vehicle_02.webp",
  "Iran Khodro|Samand": "/static/images/vehicles/vehicle_01.webp",
  "Kia|Cerato": "/static/images/vehicles/vehicle_12.webp",
  "Kia|Rio": "/static/images/vehicles/vehicle_11.webp",
  "Kia|Sportage": "/static/images/vehicles/vehicle_14.webp",
  "Mercedes-Benz|C-Class": "/static/images/vehicles/vehicle_09.webp",
  "Mercedes-Benz|E-Class": "/static/images/vehicles/vehicle_10.webp",
  "Saipa|Quick": "/static/images/vehicles/vehicle_19.webp",
  "Saipa|Saina": "/static/images/vehicles/vehicle_18.webp",
  "Saipa|Tiba": "/static/images/vehicles/vehicle_20.webp",
  "Toyota|Camry": "/static/images/vehicles/vehicle_04.webp",
  "Toyota|Corolla": "/static/images/vehicles/vehicle_17.webp",
  "Toyota|Yaris": "/static/images/vehicles/vehicle_15.webp"
};
function vehicleImage(brand, model) {
  const key = `${brand}|${model}`;
  return VEHICLE_IMAGES[key] || '/static/images/vehicles/vehicle_01.webp';
}

function vehicleLabel(v) {
  return `${v.brand} ${v.model} | ${formatNumber(v.year)} | ${formatNumber(v.mileage)} km`;
}

async function loadVehicles(params = new URLSearchParams()) {
  const response = await fetch(`/api/vehicles?${params.toString()}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'دریافت خودروها ناموفق بود.');
  vehicleCache = data.vehicles;
  renderVehicleRows(data);
  const first = $('compareFirst').value;
  const second = $('compareSecond').value;
  const optionsHtml = data.vehicles.map(v => `<option value="${v.id}">${escapeHtml(vehicleLabel(v))}</option>`).join('');
  $('compareFirst').innerHTML = '<option value="">انتخاب خودروی اول</option>' + optionsHtml;
  $('compareSecond').innerHTML = '<option value="">انتخاب خودروی دوم</option>' + optionsHtml;
  if (first && data.vehicles.some(v => String(v.id) === first)) $('compareFirst').value = first;
  if (second && data.vehicles.some(v => String(v.id) === second)) $('compareSecond').value = second;
  const brandSelect = $('filterBrand');
  const currentBrand = brandSelect.value;
  brandSelect.innerHTML = '<option value="">همه برندها</option>' + data.brands.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
  brandSelect.value = currentBrand;
}

function renderVehicleRows(data) {
  $('filterCount').textContent = `${formatNumber(data.total)} نتیجه (حداکثر ۱۵۰ مورد نمایش)`;
  $('vehicleRows').innerHTML = data.vehicles.length ? data.vehicles.map(v => `
    <tr><td><div class="vehicle-cell"><img class="vehicle-thumb" src="${vehicleImage(v.brand, v.model)}" alt="تصویر ${escapeHtml(v.brand)} ${escapeHtml(v.model)}" loading="lazy"><strong>${escapeHtml(v.brand)} ${escapeHtml(v.model)}</strong></div></td><td>${formatNumber(v.year)}</td><td>${formatNumber(v.mileage)} km</td><td>${formatToman(v.price)} تومان</td><td><button type="button" class="mini-compare" data-vehicle-id="${v.id}">انتخاب برای مقایسه</button></td></tr>
  `).join('') : '<tr><td colspan="5">خودرویی با این فیلترها پیدا نشد.</td></tr>';
}

function collectFilterParams() {
  const p = new URLSearchParams();
  const fields = {brand:'filterBrand', year_from:'filterYearFrom', year_to:'filterYearTo', price_min:'filterPriceMin', price_max:'filterPriceMax', mileage_max:'filterMileage', q:'filterQuery'};
  for (const [key,id] of Object.entries(fields)) {
    const value = $(id).value.trim();
    if (value) p.set(key, key.startsWith('price_') ? String(Number(value) * 1e9) : value);
  }
  return p;
}

async function applyVehicleFilters() {
  try { await loadVehicles(collectFilterParams()); }
  catch (error) { $('vehicleRows').innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`; }
}

async function compareSelectedVehicles() {
  const first = $('compareFirst').value, second = $('compareSecond').value;
  if (!first || !second) { $('compareResult').innerHTML = '<div class="history-empty">لطفاً دو خودرو را انتخاب کنید.</div>'; return; }
  const btn = $('compareBtn'); btn.disabled = true; btn.textContent = 'در حال مقایسه…';
  try {
    const response = await fetch('/api/compare', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({first_id:first, second_id:second})});
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'مقایسه ناموفق بود.');
    $('compareResult').innerHTML = `<div class="compare-cards">${data.vehicles.map((v,i) => `
      <div class="compare-card"><span class="compare-number">خودروی ${i+1}</span><img class="compare-car-image" src="${vehicleImage(v.brand, v.model)}" alt="تصویر ${escapeHtml(v.brand)} ${escapeHtml(v.model)}" loading="lazy"><h3>${escapeHtml(v.brand)} ${escapeHtml(v.model)}</h3><p>سال ${formatNumber(v.year)} · کارکرد ${formatNumber(v.mileage)} کیلومتر</p><div class="compare-price"><small>قیمت تخمینی مدل</small><strong>${formatToman(v.predicted_price)}</strong><small>تومان</small></div><div class="compare-detail">قیمت ثبت‌شده در دیتاست: <b>${formatToman(v.actual_price)} تومان</b></div><div class="compare-detail">دسته‌بندی: <b>${escapeHtml(v.category)}</b></div></div>`).join('')}</div><div class="compare-difference">اختلاف قیمت تخمینی دو خودرو: <strong>${formatToman(data.difference)} تومان</strong></div><p class="compare-note">قیمت‌های تخمینی خروجی مدل آموزشی هستند؛ قیمت ثبت‌شده نیز متعلق به دیتاست مصنوعی پروژه است.</p>`;
  } catch(error) { $('compareResult').innerHTML = `<div class="error-box">${escapeHtml(error.message)}</div>`; }
  finally { btn.disabled = false; btn.textContent = 'مقایسه خودروها'; }
}

function setupVehicleTools() {
  $('applyFilters').addEventListener('click', applyVehicleFilters);
  $('resetFilters').addEventListener('click', () => { ['filterBrand','filterYearFrom','filterYearTo','filterPriceMin','filterPriceMax','filterMileage','filterQuery'].forEach(id => $(id).value = ''); applyVehicleFilters(); });
  $('compareBtn').addEventListener('click', compareSelectedVehicles);
  $('vehicleRows').addEventListener('click', event => {
    const button = event.target.closest('[data-vehicle-id]'); if (!button) return;
    const id = button.dataset.vehicleId;
    if (!$('compareFirst').value) $('compareFirst').value = id;
    else $('compareSecond').value = id;
    document.getElementById('compare').scrollIntoView({behavior:'smooth', block:'center'});
  });
  loadVehicles().catch(error => { $('vehicleRows').innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`; });
}

// ========================================
// INITIALIZE APPLICATION
// ========================================

setupTheme();
setupPredictionHistory();
setupVehicleTools();

loadDashboard().catch(error => {

  $('brandChart').innerHTML = `
    <div class="loading">
      ${escapeHtml(error.message)}
    </div>
  `;

  $('errorBox').textContent = error.message;

  $('errorBox').classList.remove('hidden');

});
