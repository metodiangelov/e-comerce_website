const express = require('express');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
const DELIVERY_FEES = Object.freeze({ econt: 0, speedy: 0, boxnow: 0 });
const ORDER_STATUSES = new Set(['new', 'processing', 'shipped', 'delivered']);

const DATA_DIR = path.join(__dirname, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PRODUCTS_FILE)) fs.writeFileSync(PRODUCTS_FILE, '[]\n');
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]\n');

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`Could not read ${path.basename(file)}:`, error.message);
    return fallback;
  }
}

function writeJSON(file, data) {
  const temporaryFile = `${file}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(temporaryFile, file);
}

function newId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function text(value, maxLength = 500) {
  return String(value ?? '').trim().slice(0, maxLength);
}

async function fetchJSON(url, options, serviceName) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch (_) {}

    if (!response.ok) {
      const detail = data?.error?.message || data?.message || `HTTP ${response.status}`;
      throw new Error(`${serviceName}: ${detail}`);
    }
    if (data?.error) {
      throw new Error(`${serviceName}: ${data.error.message || data.error.code || 'API error'}`);
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'Админ паролата не е конфигурирана на сървъра' });
  }
  if (req.headers['x-admin-password'] !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Невалидна парола' });
  }
  next();
}

app.post('/api/admin/verify', (req, res) => {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'Админ паролата не е конфигурирана' });
  }
  if (text(req.body?.password, 200) === ADMIN_PASSWORD) return res.json({ ok: true });
  return res.status(401).json({ ok: false });
});

// ---- Products ----
app.get('/api/products', (req, res) => {
  const products = readJSON(PRODUCTS_FILE, []);
  products.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  res.json(products);
});

app.put('/api/products/reorder', requireAdmin, (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'Невалиден списък за подредба' });
  const products = readJSON(PRODUCTS_FILE, []);
  order.forEach((id, index) => {
    const product = products.find(item => item.id === id);
    if (product) product.sortOrder = index;
  });
  writeJSON(PRODUCTS_FILE, products);
  products.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  res.json(products);
});

app.post('/api/products', requireAdmin, (req, res) => {
  const products = readJSON(PRODUCTS_FILE, []);
  const name = text(req.body?.name, 160);
  const price = Number(req.body?.price);
  if (!name || !Number.isFinite(price) || price <= 0) {
    return res.status(400).json({ error: 'Липсва име или цената е невалидна' });
  }

  const maxOrder = products.reduce((max, product) => Math.max(max, product.sortOrder ?? 0), -1);
  const product = {
    id: newId('p'),
    name,
    price,
    category: text(req.body?.category, 80),
    stock: Math.max(0, Math.floor(Number(req.body?.stock) || 0)),
    emoji: text(req.body?.emoji, 20) || '🛍️',
    desc: text(req.body?.desc, 4000),
    images: Array.isArray(req.body?.images) ? req.body.images.map(item => text(item, 1000)).filter(Boolean).slice(0, 12) : [],
    video: text(req.body?.video, 1000),
    sortOrder: maxOrder + 1
  };
  products.push(product);
  writeJSON(PRODUCTS_FILE, products);
  res.status(201).json(product);
});

app.put('/api/products/:id', requireAdmin, (req, res) => {
  const products = readJSON(PRODUCTS_FILE, []);
  const index = products.findIndex(product => product.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Продуктът не е намерен' });

  const current = products[index];
  const nextPrice = req.body?.price == null ? current.price : Number(req.body.price);
  if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
    return res.status(400).json({ error: 'Цената е невалидна' });
  }

  products[index] = {
    ...current,
    name: req.body?.name == null ? current.name : text(req.body.name, 160),
    price: nextPrice,
    category: req.body?.category == null ? current.category : text(req.body.category, 80),
    stock: req.body?.stock == null ? current.stock : Math.max(0, Math.floor(Number(req.body.stock) || 0)),
    emoji: req.body?.emoji == null ? current.emoji : (text(req.body.emoji, 20) || '🛍️'),
    desc: req.body?.desc == null ? current.desc : text(req.body.desc, 4000),
    images: req.body?.images == null
      ? current.images
      : (Array.isArray(req.body.images) ? req.body.images.map(item => text(item, 1000)).filter(Boolean).slice(0, 12) : current.images),
    video: req.body?.video == null ? current.video : text(req.body.video, 1000)
  };

  if (!products[index].name) return res.status(400).json({ error: 'Името е задължително' });
  writeJSON(PRODUCTS_FILE, products);
  res.json(products[index]);
});

app.delete('/api/products/:id', requireAdmin, (req, res) => {
  const products = readJSON(PRODUCTS_FILE, []);
  const filtered = products.filter(product => product.id !== req.params.id);
  if (filtered.length === products.length) return res.status(404).json({ error: 'Продуктът не е намерен' });
  writeJSON(PRODUCTS_FILE, filtered);
  res.status(204).end();
});

// ---- Courier lookups ----
const deliveryCache = new Map();
const CACHE_TTL = 12 * 60 * 60 * 1000;
function cacheGet(key) {
  const hit = deliveryCache.get(key);
  if (hit && Date.now() - hit.time < CACHE_TTL) return hit.data;
  deliveryCache.delete(key);
  return null;
}
function cacheSet(key, data) {
  deliveryCache.set(key, { data, time: Date.now() });
}

async function econtRequest(method, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.ECONT_USERNAME && process.env.ECONT_PASSWORD) {
    headers.Authorization = 'Basic ' + Buffer.from(`${process.env.ECONT_USERNAME}:${process.env.ECONT_PASSWORD}`).toString('base64');
  }
  return fetchJSON(
    `https://ee.econt.com/services/Nomenclatures/NomenclaturesService.${method}.json`,
    { method: 'POST', headers, body: JSON.stringify(body) },
    `Econt ${method}`
  );
}

app.get('/api/delivery/econt/cities', async (req, res) => {
  const cached = cacheGet('econt:cities');
  if (cached) return res.json(cached);
  try {
    const data = await econtRequest('getCities', { countryCode: 'BGR' });
    const cities = (data.cities || [])
      .filter(city => city.id && city.name)
      .map(city => ({ id: city.id, name: city.name }));
    cacheSet('econt:cities', cities);
    res.json(cities);
  } catch (error) {
    console.error('Econt getCities failed:', error.message);
    res.status(502).json({ error: 'Econt е временно недостъпен' });
  }
});

app.get('/api/delivery/econt/offices', async (req, res) => {
  const cityId = Number(req.query.cityId);
  if (!Number.isInteger(cityId) || cityId <= 0) return res.status(400).json({ error: 'Липсва валиден cityId' });
  const cacheKey = `econt:offices:${cityId}`;
  const cached = cacheGet(cacheKey);
  if (cached) return res.json(cached);
  try {
    const data = await econtRequest('getOffices', { countryCode: 'BGR', cityID: cityId });
    const offices = (data.offices || []).map(office => ({
      id: office.id,
      name: office.name || '',
      address: office.address
        ? (office.address.fullAddress || [office.address.street, office.address.num].filter(Boolean).join(' '))
        : ''
    }));
    cacheSet(cacheKey, offices);
    res.json(offices);
  } catch (error) {
    console.error('Econt getOffices failed:', error.message);
    res.status(502).json({ error: 'Econt е временно недостъпен' });
  }
});

function speedyConfigured() {
  return Boolean(process.env.SPEEDY_API_USERNAME && process.env.SPEEDY_API_PASSWORD);
}

async function speedyRequest(endpoint, body) {
  return fetchJSON(
    `https://api.speedy.bg/v1/${endpoint}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName: process.env.SPEEDY_API_USERNAME,
        password: process.env.SPEEDY_API_PASSWORD,
        language: 'BG',
        ...body
      })
    },
    `Speedy ${endpoint}`
  );
}

app.get('/api/delivery/speedy/sites', async (req, res) => {
  if (!speedyConfigured()) return res.json({ configured: false, sites: [] });
  const name = text(req.query.name, 100);
  if (name.length < 2) return res.status(400).json({ error: 'Въведете поне 2 букви' });
  const cacheKey = `speedy:sites:${name.toLocaleLowerCase('bg-BG')}`;
  const cached = cacheGet(cacheKey);
  if (cached) return res.json({ configured: true, sites: cached });

  try {
    const data = await speedyRequest('location/site/', { countryId: 100, name });
    const sites = (data.sites || []).map(site => ({
      id: site.id,
      name: site.name,
      type: site.type || '',
      postCode: site.postCode || '',
      municipality: site.municipality || '',
      region: site.region || ''
    }));
    cacheSet(cacheKey, sites);
    res.json({ configured: true, sites });
  } catch (error) {
    console.error('Speedy sites failed:', error.message);
    res.status(502).json({ error: 'Speedy е временно недостъпен' });
  }
});

app.get('/api/delivery/speedy/offices', async (req, res) => {
  if (!speedyConfigured()) return res.json({ configured: false, offices: [] });
  const siteId = Number(req.query.siteId);
  if (!Number.isInteger(siteId) || siteId <= 0) return res.status(400).json({ error: 'Липсва валиден siteId' });
  const cacheKey = `speedy:offices:${siteId}`;
  const cached = cacheGet(cacheKey);
  if (cached) return res.json({ configured: true, offices: cached });

  try {
    const data = await speedyRequest('location/office/', { siteId });
    const offices = (data.offices || []).map(office => ({
      id: office.id,
      name: office.name || '',
      type: office.type || '',
      address: office.address?.fullAddressString || office.address?.fullAddress || ''
    }));
    cacheSet(cacheKey, offices);
    res.json({ configured: true, offices });
  } catch (error) {
    console.error('Speedy offices failed:', error.message);
    res.status(502).json({ error: 'Speedy е временно недостъпен' });
  }
});

// BOX NOW locker selection is handled by the official browser widget in public/index.html.
// No BOX NOW API secret is needed merely to select a locker.

// ---- Orders ----
app.post('/api/orders', (req, res) => {
  const customer = req.body?.customer || {};
  const delivery = req.body?.delivery || {};
  const items = req.body?.items;

  const customerName = text(customer.name, 160);
  const customerPhone = text(customer.phone, 40);
  if (!customerName || !customerPhone) {
    return res.status(400).json({ error: 'Липсват име или телефон на клиента' });
  }

  const courier = text(delivery.courier, 20).toLowerCase();
  const city = text(delivery.city, 160);
  const office = text(delivery.office, 700);
  if (!Object.prototype.hasOwnProperty.call(DELIVERY_FEES, courier) || !city || !office) {
    return res.status(400).json({ error: 'Липсва или е невалидна точката за получаване' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Количката е празна' });
  }

  const products = readJSON(PRODUCTS_FILE, []);
  let subtotal = 0;
  const orderItems = [];

  for (const item of items.slice(0, 100)) {
    const product = products.find(candidate => candidate.id === item.id);
    if (!product) continue;
    const requestedQuantity = Math.max(0, Math.floor(Number(item.qty) || 0));
    const quantity = Math.min(requestedQuantity, Math.max(0, Number(product.stock) || 0));
    if (quantity <= 0) continue;
    product.stock -= quantity;
    subtotal += Number(product.price) * quantity;
    orderItems.push({ id: product.id, name: product.name, price: Number(product.price), qty: quantity });
  }

  if (orderItems.length === 0) {
    return res.status(400).json({ error: 'Избраните продукти вече не са налични' });
  }

  writeJSON(PRODUCTS_FILE, products);
  const orders = readJSON(ORDERS_FILE, []);
  const deliveryFee = DELIVERY_FEES[courier];
  const order = {
    id: newId('ORD-').toUpperCase(),
    date: new Date().toISOString(),
    customer: {
      name: customerName,
      phone: customerPhone,
      email: text(customer.email, 254)
    },
    delivery: {
      courier,
      city,
      siteId: text(delivery.siteId, 80),
      office,
      locationId: text(delivery.locationId, 80),
      postalCode: text(delivery.postalCode, 30),
      note: text(delivery.note, 2000)
    },
    items: orderItems,
    subtotal: Number(subtotal.toFixed(2)),
    deliveryFee,
    total: Number((subtotal + deliveryFee).toFixed(2)),
    status: 'new'
  };

  orders.unshift(order);
  writeJSON(ORDERS_FILE, orders);
  res.status(201).json(order);
});

app.get('/api/orders', requireAdmin, (req, res) => {
  res.json(readJSON(ORDERS_FILE, []));
});

app.patch('/api/orders/:id', requireAdmin, (req, res) => {
  const status = text(req.body?.status, 30);
  if (!ORDER_STATUSES.has(status)) return res.status(400).json({ error: 'Невалиден статус' });

  const orders = readJSON(ORDERS_FILE, []);
  const index = orders.findIndex(order => order.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Поръчката не е намерена' });
  orders[index].status = status;
  writeJSON(ORDERS_FILE, orders);
  res.json(orders[index]);
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), speedyConfigured: speedyConfigured() });
});

// Hidden admin entry. The panel is still protected by ADMIN_PASSWORD.
app.get(['/admin', '/admin/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'Вътрешна грешка на сървъра' });
});

app.listen(PORT, () => {
  if (!ADMIN_PASSWORD) console.warn('WARNING: ADMIN_PASSWORD is empty; admin actions are disabled.');
  console.log(`Кошница shop running on http://localhost:${PORT}`);
});
