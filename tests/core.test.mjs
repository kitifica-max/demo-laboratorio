import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../shared/catalog.js';
import * as C from '../shared/core.js';

test('withIVA', () => {
  assert.deepEqual(C.withIVA(100), { subtotal: 100, iva: 13, total: 113 });
  assert.equal(C.withIVA(10.05).total, 11.36);
});

test('money', () => {
  assert.equal(C.money(1234.5), '$1,234.50');
  assert.equal(C.money(0), '$0.00');
});

test('flag', () => {
  const p = { min: 12, max: 16 };
  assert.equal(C.flag(11, p), 'bajo');
  assert.equal(C.flag(14, p), 'normal');
  assert.equal(C.flag(17, p), 'alto');
  assert.equal(C.flag('', p), null);
  assert.equal(C.flag('abc', p), null);
  assert.equal(C.flag('11.5', p), 'bajo');
});

test('slotsFor', () => {
  const lun = C.slotsFor('2026-11-09');
  assert.equal(lun[0], '06:30');
  assert.equal(lun.at(-1), '15:30');
  assert.equal(lun.length, 19);
  const sab = C.slotsFor('2026-11-14');
  assert.equal(sab[0], '07:00');
  assert.equal(sab.at(-1), '11:30');
  assert.deepEqual(C.slotsFor('2026-11-15'), []);
});

test('canBook / bookAppointment', () => {
  const st = { appointments: [
    { date: '2026-11-10', time: '08:00', status: 'pendiente' },
    { date: '2026-11-10', time: '08:00', status: 'confirmada' },
    { date: '2026-11-10', time: '08:30', status: 'cancelada' },
    { date: '2026-11-10', time: '08:30', status: 'cancelada' },
  ], patients: [], orders: [] };
  assert.equal(C.slotLoad(st, '2026-11-10', '08:00'), 2);
  assert.equal(C.slotLoad(st, '2026-11-10', '08:30'), 0);
  assert.equal(C.canBook(st, '2026-11-10', '08:00'), false);
  assert.equal(C.canBook(st, '2026-11-10', '08:30'), true);
  assert.equal(C.canBook(st, '2026-11-10', '05:00'), false);
  assert.equal(C.canBook(st, '2026-11-15', '08:00'), false);
  assert.deepEqual(
    C.bookAppointment(st, { patientId: 'p1', date: '2026-11-10', time: '08:00', examIds: [] }),
    { ok: false, error: 'Ese horario se llenó' });
});

test('toCSV', () => {
  assert.equal(C.toCSV([{ a: 'Peña, "J"' }], ['a']), '﻿a\r\n"Peña, ""J"""');
  assert.equal(C.toCSV([{ a: 1, b: 'x' }, { a: 2, b: 'y' }], ['a', 'b']), '﻿a,b\r\n1,x\r\n2,y');
});

test('catalog', () => {
  const cats = new Set(CATALOG.map(e => e.category));
  for (const c of ['Hematología', 'Química', 'Orina y heces', 'Hormonas', 'Infecciosas', 'Paquetes']) assert.ok(cats.has(c), c);
  assert.equal(new Set(CATALOG.map(e => e.id)).size, CATALOG.length);
  assert.equal(CATALOG.length, 24);
  for (const e of CATALOG) assert.ok(e.price > 0 && e.turnaroundH > 0 && Array.isArray(e.params));
});

test('seed determinista y completo', () => {
  const now = new Date('2026-11-09');
  const a = C.seed(now), b = C.seed(now);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.ok(a.patients.length >= 40);
  assert.ok(a.orders.length > 60 && a.purchases.length > 10 && a.suppliers.length >= 4);
  assert.ok(a.appointments.length > 10);
  assert.ok(Object.keys(a.catalogPrices).length === CATALOG.length);
  for (const o of a.orders) {
    const sub = o.items.reduce((s, i) => s + i.price, 0);
    assert.deepEqual({ subtotal: o.subtotal, iva: o.iva, total: o.total }, C.withIVA(sub));
  }
  // hemoglobina baja
  const hem = a.orders.find(o => o.published && o.results && o.results.hemoglobina < 12);
  assert.ok(hem, 'hemoglobina baja publicada');
  // slots nunca exceden capacidad
  for (const ap of a.appointments) if (ap.status !== 'cancelada') assert.ok(C.slotLoad(a, ap.date, ap.time) <= 2);
});

test('createOrder y bookAppointment ok', () => {
  const st = C.seed(new Date('2026-11-09'));
  const n = st.orders.length;
  const o = C.createOrder(st, st.patients[0].id, ['hemograma', 'glucosa'], 'Tarjeta');
  assert.equal(st.orders.length, n + 1);
  assert.equal(o.items.length, 2);
  assert.equal(o.payMethod, 'Tarjeta');
  assert.equal(o.published, false);
  const date = '2026-11-12';
  const slot = C.slotsFor(date).find(t => C.canBook(st, date, t));
  const r = C.bookAppointment(st, { patientId: st.patients[0].id, date, time: slot, examIds: ['hemograma'] });
  assert.equal(r.ok, true);
  assert.equal(r.appt.status, 'pendiente');
  assert.ok(st.appointments.includes(r.appt));
});

test('reports', () => {
  const st = C.seed(new Date('2026-11-09'));
  const s = C.salesRows(st, '2026-10-01', '2026-10-31');
  assert.ok(s.length > 0 && s.every(r => r.fecha >= '2026-10-01' && r.fecha <= '2026-10-31'));
  const d = C.salesDetailRows(st, '2026-10-01', '2026-10-31');
  assert.ok(d.length >= s.length);
  assert.ok(C.purchaseRows(st, '2026-10-01', '2026-10-31').length > 0);
  assert.ok(C.patientRows(st, '2026-01-01', '2026-12-31').length > 0);
});

test('storage sin localStorage', () => {
  assert.equal(globalThis.localStorage, undefined);
  C.save({ x: 1 });
  const st = C.load();
  assert.ok(st.patients.length >= 40);
  C.reset();
});

test('storage con localStorage', () => {
  const m = new Map();
  globalThis.localStorage = { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) };
  const st = C.load();
  st.patients[0].name = 'Cambiado';
  C.save(st);
  assert.ok(m.has('demolab:v1'));
  assert.equal(C.load().patients[0].name, 'Cambiado');
  C.reset();
  assert.notEqual(C.load().patients[0].name, 'Cambiado');
  delete globalThis.localStorage;
});

const { snapshot, handleAppRequest, seed, slotLoad } = C;

test('snapshot: solo resultados publicados y ocupación', () => {
  const s = seed(new Date('2026-11-09T12:00:00'));
  const snap = snapshot(s, '2026-11-09');
  assert.ok(snap.orders.length > 0 && snap.orders.every(o => s.orders.find(x => x.id === o.id).published));
  assert.ok(Object.keys(snap.load).every(d => d >= '2026-11-09'));
  assert.equal(snap.patients[0].notes, undefined);
});

test('handleAppRequest: register y book con cupo', () => {
  const s = seed(new Date('2026-11-09T12:00:00'));
  const r = handleAppRequest(s, { type: 'register', name: 'Ana Prueba', phone: '7000-0000' });
  assert.ok(r.ok && r.patient.id === 'p43');
  const req = { type: 'book', patientId: 'p43', date: '2026-11-14', time: '07:00', examIds: ['glucosa', 'xx'] };
  const free = 2 - slotLoad(s, req.date, req.time);
  for (let i = 0; i < free; i++) assert.ok(handleAppRequest(s, req).ok);
  assert.deepEqual(handleAppRequest(s, req), { ok: false, error: 'Ese horario se llenó' });
  assert.deepEqual(s.appointments.at(-1).examIds, ['glucosa']);
  assert.equal(handleAppRequest(s, { type: 'book', patientId: 'nadie', date: '2026-11-14', time: '07:30' }).ok, false);
});
