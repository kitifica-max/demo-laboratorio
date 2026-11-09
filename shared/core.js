import { CATALOG } from './catalog.js';

export { CATALOG };
export const STORAGE_KEY = 'demolab:v1';
export const CAPACITY = 2;

/* ---------- formato y cálculo ---------- */

export function money(n) {
  const s = Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? '-$' : '$') + s;
}

// IVA 13% sobre el subtotal, redondeado a centavos (aritmética entera).
export function withIVA(subtotal) {
  const c = Math.round(subtotal * 100);
  const iva = Math.floor((c * 13 + 50) / 100);
  return { subtotal: c / 100, iva: iva / 100, total: (c + iva) / 100 };
}

export function flag(value, param) {
  if (value === null || value === undefined || !param) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  const { min, max } = param;
  if (min == null && max == null) return null;
  if (min != null && v < min) return 'bajo';
  if (max != null && v > max) return 'alto';
  return 'normal';
}

// Parámetros de un examen aplicables al sexo ('F'/'M').
export const paramsFor = (exam, sex) => exam.params.filter(p => !p.sex || p.sex === sex);

/* ---------- fechas (ISO 'YYYY-MM-DD', sin depender de zona horaria) ---------- */

const pad = n => String(n).padStart(2, '0');
const utc = iso => new Date(iso + 'T00:00:00Z');
export const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function addDays(iso, n) {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const dow = iso => utc(iso).getUTCDay(); // 0 = domingo

/* ---------- agenda ---------- */

export function slotsFor(dateISO) {
  const d = dow(dateISO);
  if (d === 0) return [];
  const [start, end] = d === 6 ? [7 * 60, 11 * 60 + 30] : [6 * 60 + 30, 15 * 60 + 30];
  const out = [];
  for (let m = start; m <= end; m += 30) out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  return out;
}

export function slotLoad(state, dateISO, time) {
  return state.appointments.filter(a => a.date === dateISO && a.time === time && a.status !== 'cancelada').length;
}

export const canBook = (state, dateISO, time) =>
  slotsFor(dateISO).includes(time) && slotLoad(state, dateISO, time) < CAPACITY;

const nextId = (arr, prefix) => prefix + (arr.reduce((m, x) => Math.max(m, parseInt(String(x.id).slice(prefix.length), 10) || 0), 0) + 1);
const price = (state, exam) => state.catalogPrices?.[exam.id] ?? exam.price;
const examById = id => CATALOG.find(e => e.id === id);

export function bookAppointment(state, req) {
  const { patientId, date, time, examIds = [] } = req;
  if (!slotsFor(date).includes(time)) return { ok: false, error: 'Horario no disponible' };
  if (!canBook(state, date, time)) return { ok: false, error: 'Ese horario se llenó' };
  const appt = { id: nextId(state.appointments, 'a'), patientId, date, time, examIds: [...examIds], status: 'pendiente' };
  state.appointments.push(appt);
  return { ok: true, appt };
}

/* ---------- órdenes ---------- */

export function createOrder(state, patientId, examIds, payMethod, date = toISO(new Date())) {
  const items = examIds.map(id => {
    const ex = examById(id);
    return { examId: id, name: ex.name, price: price(state, ex) };
  });
  const order = {
    id: nextId(state.orders, 'o'), patientId, date, items,
    ...withIVA(items.reduce((s, i) => s + i.price, 0)),
    payMethod, status: 'Pagado', results: null, published: false,
  };
  state.orders.push(order);
  return order;
}

/* ---------- semilla determinista ---------- */

function mulberry32(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_F = ['María', 'Ana', 'Carmen', 'Rosa', 'Gabriela', 'Sofía', 'Lucía', 'Verónica', 'Karla', 'Patricia', 'Daniela', 'Wendy', 'Claudia', 'Marta', 'Jessica', 'Alejandra', 'Yesenia', 'Beatriz', 'Mónica', 'Elena', 'Fátima', 'Ingrid'];
const FIRST_M = ['José', 'Carlos', 'Luis', 'Juan', 'Mario', 'Roberto', 'Miguel', 'Fernando', 'Óscar', 'Jorge', 'Ricardo', 'Eduardo', 'Kevin', 'Walter', 'Ernesto', 'Héctor', 'Rafael', 'Manuel', 'Alexis', 'Nelson', 'Gerardo'];
const LAST = ['Hernández', 'Martínez', 'López', 'García', 'Rodríguez', 'Pérez', 'Ramírez', 'Flores', 'Gómez', 'Menjívar', 'Rivera', 'Alvarado', 'Mejía', 'Cruz', 'Orellana', 'Portillo', 'Argueta', 'Quintanilla', 'Castillo', 'Guzmán', 'Chávez', 'Villalta', 'Amaya', 'Escobar', 'Reyes', 'Henríquez', 'Peña', 'Mendoza', 'Rosales', 'Aguilar'];
const NOTES = ['', '', '', '', '', 'Alergia a la penicilina', 'Hipertensión controlada', 'Diabetes tipo 2', 'Embarazada (2.º trimestre)', 'Alergia al látex', 'Prefiere atención por la mañana'];
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

const SUPPLIERS = [
  { id: 's1', name: 'Distribuidora Médica Cuscatlán', phone: '2222-1040' },
  { id: 's2', name: 'Reactivos y Equipos del Pacífico', phone: '2260-3377' },
  { id: 's3', name: 'Insumos de Laboratorio San Salvador', phone: '2271-5590' },
  { id: 's4', name: 'Servicios Biomédicos Escalón', phone: '2263-8812' },
  { id: 's5', name: 'Suministros La Gran Vía', phone: '2245-9001' },
];

const PURCHASE_TYPES = [
  { category: 'Reactivos', supplier: 's2', min: 120, max: 780, items: ['Reactivos de hematología (kit 500 pruebas)', 'Reactivos de química clínica', 'Tiras reactivas de orina (frasco x100)', 'Pruebas rápidas de embarazo (caja x50)', 'Reactivo de glucosa'] },
  { category: 'Insumos', supplier: 's1', min: 25, max: 260, items: ['Tubos de ensayo con EDTA (caja x100)', 'Agujas y jeringas desechables', 'Guantes de nitrilo (caja)', 'Frascos estériles para orina', 'Alcohol y algodón', 'Torniquetes y gasas'] },
  { category: 'Insumos', supplier: 's5', min: 15, max: 90, items: ['Papel y etiquetas para reportes', 'Artículos de limpieza', 'Bolsas para desechos bioinfecciosos'] },
  { category: 'Equipo', supplier: 's3', min: 150, max: 950, items: ['Pipetas automáticas', 'Repuesto de centrífuga', 'Refrigerador para reactivos (repuesto)', 'Microscopio: lámpara y lentes'] },
  { category: 'Servicios', supplier: 's4', min: 40, max: 380, items: ['Mantenimiento de analizador', 'Calibración de equipos', 'Recolección de desechos bioinfecciosos', 'Servicio de internet y telefonía', 'Energía eléctrica', 'Agua potable'] },
];

const PAY = ['Efectivo', 'Efectivo', 'Tarjeta', 'Tarjeta', 'Transferencia'];

// Genera el valor de un parámetro: dentro del rango (~88%) o fuera (~12%).
function genValue(param, rnd) {
  if (param.min == null && param.max == null) {
    if (param.key === 'grupo') return ['O', 'O', 'A', 'B'][Math.floor(rnd() * 4)];
    if (param.key === 'rh') return 'Positivo';
    if (param.key === 'parasitos') return 'No se observan';
    if (param.key === 'urocultivo') return 'Sin crecimiento';
    return 'Negativo';
  }
  const { min, max } = param;
  const span = max - min;
  let v;
  const r = rnd();
  if (r < 0.06 && min > 0) v = min - span * (0.05 + rnd() * 0.2);
  else if (r < 0.12) v = max + span * (0.05 + rnd() * 0.2);
  else v = min + span * (0.1 + rnd() * 0.8);
  const dec = max < 2 ? 3 : max < 20 ? 1 : 0;
  return Number(v.toFixed(dec));
}

function genResults(exams, sex, rnd) {
  const res = {};
  for (const ex of exams) for (const p of paramsFor(ex, sex)) res[p.key] = genValue(p, rnd);
  return res;
}

export function seed(now) {
  const rnd = mulberry32(20261109);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const today = toISO(now);

  const patients = [];
  for (let i = 1; i <= 42; i++) {
    const sex = i % 5 < 3 ? 'F' : 'M';
    const first = pick(sex === 'F' ? FIRST_F : FIRST_M);
    const l1 = pick(LAST), l2 = pick(LAST);
    const year = 1948 + Math.floor(rnd() * 58);
    patients.push({
      id: 'p' + i,
      name: `${first} ${l1} ${l2}`,
      dui: String(Math.floor(rnd() * 1e8)).padStart(8, '0') + '-' + Math.floor(rnd() * 10),
      birthDate: `${year}-${pad(1 + Math.floor(rnd() * 12))}-${pad(1 + Math.floor(rnd() * 28))}`,
      sex,
      phone: `${pick(['7', '7', '6'])}${Math.floor(rnd() * 1e3).toString().padStart(3, '0')}-${Math.floor(rnd() * 1e4).toString().padStart(4, '0')}`,
      email: `${slug(first)}.${slug(l1)}${i}@example.com`,
      notes: pick(NOTES),
    });
  }
  // Paciente de demo: hemoglobina baja (ver orden destacada abajo).
  Object.assign(patients[0], { name: 'María José Hernández Menjívar', email: 'mariajose.hernandez@example.com', sex: 'F', birthDate: '1991-04-17', notes: 'Fatiga reciente. Sin alergias conocidas.' });

  const catalogPrices = Object.fromEntries(CATALOG.map(e => [e.id, e.price]));
  const state = { patients, appointments: [], orders: [], purchases: [], suppliers: SUPPLIERS.map(s => ({ ...s })), catalogPrices };
  const single = CATALOG.filter(e => e.category !== 'Paquetes');
  const common = ['hemograma', 'glucosa', 'lipidos', 'ego', 'hepatico', 'creatinina', 'tiroideo'].map(examById);

  // 60 días de órdenes (lunes a sábado), hasta hoy inclusive.
  for (let back = 60; back >= 0; back--) {
    const date = addDays(today, -back);
    if (dow(date) === 0) continue;
    const n = (dow(date) === 6 ? 3 : 5) + Math.floor(rnd() * 5);
    for (let k = 0; k < n; k++) {
      const pat = pick(patients);
      let exams;
      const r = rnd();
      if (r < 0.07) exams = [examById('chequeo')];
      else if (r < 0.11 && pat.sex === 'F') exams = [examById('prenatal')];
      else {
        exams = [];
        const cnt = 1 + Math.floor(rnd() * 3);
        while (exams.length < cnt) {
          const ex = rnd() < 0.6 ? pick(common) : pick(single);
          if (!exams.includes(ex)) exams.push(ex);
        }
      }
      const o = createOrder(state, pat.id, exams.map(e => e.id), pick(PAY), date);
      const rr = rnd();
      if (rr < 0.01) o.status = 'Anulado';
      else if (back <= 2 && rr < 0.2) o.status = 'Pendiente';
      if (back > 0 && o.status !== 'Anulado' && (back > 2 || rnd() < 0.5)) {
        o.results = genResults(exams, pat.sex, rnd);
        o.published = true;
      }
    }
  }

  // Orden destacada: hemograma con hemoglobina baja, publicada.
  const hem = examById('hemograma');
  const hemOrder = createOrder(state, patients[0].id, ['hemograma'], 'Tarjeta', addDays(today, -3));
  hemOrder.results = { ...genResults([hem], 'F', mulberry32(7)), hemoglobina: 10.4, hematocrito: 32, leucocitos: 7.2, plaquetas: 265 };
  hemOrder.published = true;
  state.orders.sort((a, b) => a.date.localeCompare(b.date));
  // Reasignar ids secuenciales por fecha.
  state.orders.forEach((o, i) => { o.id = 'o' + (1001 + i); });

  // Compras: ~2-3 por semana durante 60 días.
  for (let back = 60; back >= 0; back--) {
    const date = addDays(today, -back);
    if (dow(date) === 0 || rnd() > 0.38) continue;
    const t = pick(PURCHASE_TYPES);
    state.purchases.push({
      id: 'c' + (state.purchases.length + 1), date, supplierId: t.supplier, category: t.category,
      description: pick(t.items), amount: Math.round((t.min + rnd() * (t.max - t.min)) * 100) / 100,
    });
  }

  // Citas: hoy y próximos 7 días, respetando capacidad.
  const FUTURE = ['pendiente', 'confirmada', 'confirmada'];
  for (let d = 0; d <= 7; d++) {
    const date = addDays(today, d);
    const slots = slotsFor(date);
    if (!slots.length) continue;
    const n = d === 0 ? 7 : 3 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      const time = pick(slots);
      const examIds = [pick(common).id];
      const res = bookAppointment(state, { patientId: pick(patients).id, date, time, examIds });
      if (!res.ok) continue;
      if (d === 0) res.appt.status = time < '09:00' ? pick(['completada', 'muestra tomada']) : pick(['confirmada', 'pendiente']);
      else res.appt.status = pick(FUTURE);
    }
  }
  const cancel = state.appointments.filter(a => a.date > today)[1];
  if (cancel) cancel.status = 'cancelada';

  return state;
}

/* ---------- persistencia ---------- */

const store = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function save(state) {
  try { store()?.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* cuota o modo privado */ }
}

export function load() {
  const ls = store();
  try {
    const raw = ls?.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* datos corruptos: resembrar */ }
  const state = seed(new Date());
  save(state);
  return state;
}

export function reset() {
  try { store()?.removeItem(STORAGE_KEY); } catch { /* nada */ }
  return load();
}

/* ---------- CSV y reportes ---------- */

export function toCSV(rows, columns) {
  const cell = v => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [columns.map(cell).join(','), ...rows.map(r => columns.map(c => cell(r[c])).join(','))];
  return '﻿' + lines.join('\r\n');
}

const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to);
const patientOf = (state, id) => state.patients.find(p => p.id === id) || {};
const supplierName = (state, id) => state.suppliers.find(s => s.id === id)?.name || '';

export function salesRows(state, from, to) {
  return state.orders.filter(o => inRange(o.date, from, to)).map(o => {
    const p = patientOf(state, o.patientId);
    return { fecha: o.date, orden: o.id, paciente: p.name, dui: p.dui, examenes: o.items.map(i => i.name).join('; '),
      subtotal: o.subtotal.toFixed(2), iva: o.iva.toFixed(2), total: o.total.toFixed(2), metodo_pago: o.payMethod, estado: o.status };
  });
}

export function salesDetailRows(state, from, to) {
  return state.orders.filter(o => inRange(o.date, from, to)).flatMap(o => {
    const p = patientOf(state, o.patientId);
    return o.items.map(i => ({ fecha: o.date, orden: o.id, paciente: p.name, dui: p.dui, examen: i.name, precio: i.price.toFixed(2), estado: o.status }));
  });
}

export function purchaseRows(state, from, to) {
  return state.purchases.filter(c => inRange(c.date, from, to)).map(c => ({
    fecha: c.date, compra: c.id, proveedor: supplierName(state, c.supplierId), categoria: c.category,
    descripcion: c.description, monto: c.amount.toFixed(2) }));
}

// Pacientes con al menos una orden (no anulada) en el rango.
export function patientRows(state, from, to) {
  const agg = new Map();
  for (const o of state.orders) {
    if (o.status === 'Anulado' || !inRange(o.date, from, to)) continue;
    const a = agg.get(o.patientId) || { n: 0, total: 0 };
    a.n++; a.total += o.total;
    agg.set(o.patientId, a);
  }
  return state.patients.filter(p => agg.has(p.id)).map(p => ({
    id: p.id, nombre: p.name, dui: p.dui, fecha_nacimiento: p.birthDate, sexo: p.sex, telefono: p.phone, correo: p.email,
    notas: p.notes, ordenes: agg.get(p.id).n, total_gastado: agg.get(p.id).total.toFixed(2) }));
}

/* ---------- sincronización: snapshot y solicitudes de la app ---------- */

// Lo que la app paciente puede ver: ocupación 14 días, pacientes, resultados publicados, precios.
export function snapshot(state, today = toISO(new Date())) {
  const load = {};
  for (const a of state.appointments) {
    if (a.status === 'cancelada' || a.date < today || a.date > addDays(today, 14)) continue;
    (load[a.date] ||= {})[a.time] = (load[a.date][a.time] || 0) + 1;
  }
  return {
    at: Date.now(), load,
    patients: state.patients.map(({ id, name, sex, birthDate, phone, email, dui }) => ({ id, name, sex, birthDate, phone, email, dui })),
    orders: state.orders.filter(o => o.published && o.status !== 'Anulado')
      .map(({ id, patientId, date, items, total, results }) => ({ id, patientId, date, items, total, results })),
    appointments: state.appointments.filter(a => a.date >= today).map(({ id, patientId, date, time, examIds, status }) => ({ id, patientId, date, time, examIds, status })),
    prices: state.catalogPrices,
  };
}

// Atiende una solicitud de la app. Muta state; devuelve la respuesta.
export function handleAppRequest(state, req) {
  if (req.type === 'register') {
    const name = String(req.name || '').trim().slice(0, 80), phone = String(req.phone || '').trim().slice(0, 20);
    if (!name) return { ok: false, error: 'Falta el nombre' };
    const patient = { id: nextId(state.patients, 'p'), name, phone, sex: req.sex === 'M' ? 'M' : 'F', dui: '', birthDate: '', email: '', notes: 'Registrado desde la app' };
    state.patients.push(patient);
    return { ok: true, patient };
  }
  if (req.type === 'book') {
    if (!state.patients.some(p => p.id === req.patientId)) return { ok: false, error: 'Paciente no encontrado' };
    const examIds = (req.examIds || []).filter(examById);
    const res = bookAppointment(state, { patientId: req.patientId, date: req.date, time: req.time, examIds });
    if (res.ok) res.appt.source = 'app';
    return res;
  }
  return { ok: false, error: 'Solicitud desconocida' };
}
