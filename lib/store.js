// Almacén de regalos en Upstash Redis (gratis, no se duerme).
//   hash "gifts"  : id -> { id, icon, title, note, url }
//   hash "claims" : id -> { by, at }      (quién eligió el regalo)
//   "gifts:seq"   : contador de ids
// Vercel crea KV_REST_API_URL y KV_REST_API_TOKEN al conectar la base.
const { Redis } = require('@upstash/redis');

let client = null;

// Busca la URL y el token sin importar el prefijo que Vercel haya puesto
// (KV_, KB_KV_, UPSTASH_, STORAGE_, etc.). Ignora el token de solo lectura.
function findEnv(suffixes, exclude) {
  const names = Object.keys(process.env);
  for (const suf of suffixes) {
    const hit = names.find((n) => n.endsWith(suf) && !(exclude && n.includes(exclude)));
    if (hit && process.env[hit]) return process.env[hit];
  }
  return '';
}

function redis() {
  if (client) return client;
  const url = findEnv(['REST_API_URL', 'REDIS_REST_URL']);
  const token = findEnv(['REST_API_TOKEN', 'REDIS_REST_TOKEN'], 'READ_ONLY');
  if (!url || !token) throw new Error('Falta conectar la base de datos Upstash Redis');
  client = new Redis({ url, token });
  return client;
}

const parse = (v) => {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch (e) { return null; }
};

async function listGifts() {
  const r = redis();
  const [gifts, claims] = await Promise.all([r.hgetall('gifts'), r.hgetall('claims')]);
  return Object.values(gifts || {})
    .map(parse).filter(Boolean)
    .sort((a, b) => a.id - b.id)
    .map((g) => {
      const c = parse((claims || {})[g.id]);
      return { ...g, claimed_by: c ? c.by : null, claimed_at: c ? c.at : null };
    });
}

// Imagen del regalo:
//   - link externo (https://...) -> se guarda tal cual en el regalo
//   - foto subida -> se guarda aparte en el hash "gift_images" (id -> data URL)
//     y el regalo apunta a /api/image?id=ID
async function applyImage(r, id, prev, img) {
  if (!img || img.mode === 'keep' || !img.mode) return prev || null;
  if (img.mode === 'upload') {
    await r.hset('gift_images', { [id]: img.data });
    return '/api/image?id=' + id + '&v=' + Date.now();
  }
  await r.hdel('gift_images', id);
  return img.mode === 'url' ? img.url : null;
}

async function addGift(f, img) {
  const r = redis();
  const id = await r.incr('gifts:seq');
  const image = await applyImage(r, id, null, img);
  await r.hset('gifts', { [id]: { id, ...f, image } });
  return id;
}

// Agrega muchos regalos de una sola vez (importar lista). Reserva los ids con un solo INCRBY.
async function addGifts(list) {
  if (!list.length) return 0;
  const r = redis();
  const last = await r.incrby('gifts:seq', list.length);
  const first = last - list.length + 1;
  const obj = {};
  list.forEach((f, i) => { const id = first + i; obj[id] = { id, ...f, image: f.image || null }; });
  await r.hset('gifts', obj);
  return list.length;
}

// Borra toda la lista (regalos, elecciones y fotos subidas)
async function deleteAll() {
  await redis().del('gifts', 'claims', 'gift_images');
}

async function updateGift(id, f, img) {
  const r = redis();
  const prev = parse(await r.hget('gifts', id));
  if (!prev) return false;
  const image = await applyImage(r, id, prev.image, img);
  await r.hset('gifts', { [id]: { id, ...f, image } });
  return true;
}

async function deleteGift(id) {
  const r = redis();
  await r.hdel('gifts', id);
  await r.hdel('claims', id);
  await r.hdel('gift_images', id);
}

async function getImage(id) {
  const v = await redis().hget('gift_images', id);
  return typeof v === 'string' ? v : null;
}

// HSETNX es atómico: solo uno gana si dos personas eligen a la vez.
async function claimGift(id, name) {
  const r = redis();
  const g = parse(await r.hget('gifts', id));
  if (!g) return { status: 'missing' };
  const won = await r.hsetnx('claims', id, { by: name, at: new Date().toISOString() });
  return won ? { status: 'ok', title: g.title } : { status: 'taken' };
}

async function releaseGift(id) {
  await redis().hdel('claims', id);
}

module.exports = { listGifts, addGift, addGifts, deleteAll, updateGift, deleteGift, claimGift, releaseGift, getImage };
