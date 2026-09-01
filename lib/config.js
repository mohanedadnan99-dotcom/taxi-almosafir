const { storageConfigured, getOrder, saveOrder } = require('./orders');

const CONFIG_REFERENCE = 'SYS-CONFIG';

const DEFAULT_CONFIG = Object.freeze({
  version: 1,
  company: {
    nameAr: 'تكسي المسافر',
    nameEn: 'Almosafir Taxi',
    cityAr: 'بغداد',
    cityEn: 'Baghdad',
    supportPhone: '',
    operationsPhone: '',
    email: '',
    timezone: 'Asia/Baghdad',
    defaultLanguage: 'ar',
  },
  vehicles: [
    { id: 'tucson', name: 'Tucson', labelAr: 'Tucson', labelEn: 'Tucson', className: 'SUV', capacity: 4, bags: 3, image: '/assets/cars/tucson-black-final.jpg?v=20260901-4', descriptionAr: 'خيار عملي ومريح للتنقل.', descriptionEn: 'A practical and comfortable choice for everyday travel.', active: true, sort: 10 },
    { id: 'fortuner', name: 'Fortuner', labelAr: 'Fortuner', labelEn: 'Fortuner', className: 'SUV', capacity: 5, bags: 4, image: '/assets/cars/fortuner.webp', descriptionAr: 'مساحة أكبر للعائلة والأمتعة.', descriptionEn: 'More space for families and luggage.', active: true, sort: 20 },
    { id: 'pajero', name: 'Pajero', labelAr: 'Pajero', labelEn: 'Pajero', className: 'SUV', capacity: 5, bags: 4, image: '/assets/cars/pajero.webp', descriptionAr: 'مريحة ومناسبة للطرق والمسافات.', descriptionEn: 'Comfortable and well-suited for longer trips.', active: true, sort: 30 },
    { id: 'gmc-vvip', name: 'GMC VVIP', labelAr: 'GMC VVIP', labelEn: 'GMC VVIP', className: 'VVIP', capacity: 6, bags: 6, image: '/assets/cars/gmc-vvip.webp', descriptionAr: 'الخيار الأوسع والأفخم.', descriptionEn: 'Our most spacious and premium option.', active: true, sort: 40 },
  ],
  pricing: {
    enabled: false,
    currency: 'IQD',
    zones: [],
  },
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function text(value, max = 180) {
  return String(value ?? '').trim().slice(0, max);
}

function int(value, fallback, min = 0, max = 99) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

function bool(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function safeId(value, fallback) {
  const id = text(value, 60).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return id || fallback;
}

function sanitizeVehicle(raw, index) {
  const name = text(raw?.name, 60);
  if (!name) return null;
  return {
    id: safeId(raw?.id, `vehicle-${index + 1}`),
    name,
    labelAr: text(raw?.labelAr, 80) || name,
    labelEn: text(raw?.labelEn, 80) || name,
    className: text(raw?.className, 30) || 'SUV',
    capacity: int(raw?.capacity, 4, 1, 20),
    bags: int(raw?.bags, 3, 0, 50),
    image: text(raw?.image, 300),
    descriptionAr: text(raw?.descriptionAr, 220),
    descriptionEn: text(raw?.descriptionEn, 220),
    active: bool(raw?.active, true),
    sort: int(raw?.sort, (index + 1) * 10, 0, 9999),
  };
}

function sanitizeZone(raw, index) {
  const nameAr = text(raw?.nameAr, 100);
  const nameEn = text(raw?.nameEn, 100);
  const price = Number(raw?.price);
  if ((!nameAr && !nameEn) || !Number.isFinite(price) || price < 0) return null;
  return {
    id: safeId(raw?.id, `zone-${index + 1}`),
    nameAr: nameAr || nameEn,
    nameEn: nameEn || nameAr,
    price: Math.round(price),
    active: bool(raw?.active, true),
    note: text(raw?.note, 180),
  };
}

function sanitizeConfig(input) {
  const base = clone(DEFAULT_CONFIG);
  const company = input?.company || {};
  base.company = {
    nameAr: text(company.nameAr, 100) || base.company.nameAr,
    nameEn: text(company.nameEn, 100) || base.company.nameEn,
    cityAr: text(company.cityAr, 80) || base.company.cityAr,
    cityEn: text(company.cityEn, 80) || base.company.cityEn,
    supportPhone: text(company.supportPhone, 40),
    operationsPhone: text(company.operationsPhone, 40),
    email: text(company.email, 120),
    timezone: text(company.timezone, 80) || 'Asia/Baghdad',
    defaultLanguage: company.defaultLanguage === 'en' ? 'en' : 'ar',
  };

  const vehicles = Array.isArray(input?.vehicles) ? input.vehicles.map(sanitizeVehicle).filter(Boolean) : base.vehicles;
  const unique = [];
  const seen = new Set();
  for (const vehicle of vehicles) {
    const key = vehicle.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(vehicle);
  }
  base.vehicles = (unique.length ? unique : clone(DEFAULT_CONFIG.vehicles)).sort((a, b) => a.sort - b.sort);

  const pricing = input?.pricing || {};
  const zones = Array.isArray(pricing.zones) ? pricing.zones.map(sanitizeZone).filter(Boolean) : [];
  base.pricing = {
    enabled: bool(pricing.enabled, false),
    currency: text(pricing.currency, 12) || 'IQD',
    zones,
  };
  return base;
}

async function loadConfig() {
  if (!storageConfigured()) return clone(DEFAULT_CONFIG);
  try {
    const row = await getOrder(CONFIG_REFERENCE);
    if (!row || row.source !== 'system' || !row.notes) return clone(DEFAULT_CONFIG);
    return sanitizeConfig(JSON.parse(row.notes));
  } catch (error) {
    console.warn('Config load fallback', error?.message || error);
    return clone(DEFAULT_CONFIG);
  }
}

async function saveConfig(input, actor = 'admin') {
  if (!storageConfigured()) {
    const error = new Error('التخزين الدائم غير مفعّل؛ لا يمكن حفظ الإعدادات.');
    error.code = 'STORAGE_NOT_CONFIGURED';
    throw error;
  }
  const config = sanitizeConfig(input);
  const existing = await getOrder(CONFIG_REFERENCE).catch(() => null);
  const now = new Date().toISOString();
  const row = {
    reference: CONFIG_REFERENCE,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    status: 'completed',
    statusHistory: [...(Array.isArray(existing?.statusHistory) ? existing.statusHistory : []), { type: 'config', at: now, actor: text(actor, 80) || 'admin' }].slice(-100),
    name: 'System Configuration',
    phone: 'system',
    car: 'SYSTEM',
    tripType: '',
    tripLabel: '',
    passengers: 1,
    bags: 0,
    address: '',
    notes: JSON.stringify(config),
    lat: null,
    lng: null,
    maps: '',
    source: 'system',
    telegram: 'not-applicable',
  };
  await saveOrder(row);
  return config;
}

function publicConfig(config) {
  const safe = sanitizeConfig(config || DEFAULT_CONFIG);
  return {
    version: safe.version,
    company: safe.company,
    vehicles: safe.vehicles.filter((v) => v.active),
    pricing: safe.pricing,
  };
}

function activeVehicleNames(config) {
  return new Set(sanitizeConfig(config || DEFAULT_CONFIG).vehicles.filter((v) => v.active).map((v) => v.name));
}

module.exports = { DEFAULT_CONFIG, sanitizeConfig, loadConfig, saveConfig, publicConfig, activeVehicleNames };
