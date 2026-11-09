import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent, explainResult, assistantStep } from '../shared/ai.js';
import { canBook } from '../shared/core.js';

const LUNES = new Date(2026, 10, 9, 7, 0); // lunes 2026-11-09 07:00
const DISCLAIMER = 'Esto no sustituye una consulta médica.';
const noEmoji = s => !/\p{Extended_Pictographic}/u.test(s);

/* ---------- parseIntent ---------- */

test('parseIntent: hemograma mañana a las 8', () => {
  assert.deepEqual(parseIntent('quiero un hemograma mañana a las 8', LUNES),
    { exams: ['hemograma'], date: '2026-11-10', time: '08:00' });
});

test('parseIntent: glucosa el viernes 7 y media', () => {
  assert.deepEqual(parseIntent('glucosa el viernes 7 y media', LUNES),
    { exams: ['glucosa'], date: '2026-11-13', time: '07:30' });
});

test('parseIntent: voz en minúsculas sin acentos ni puntuación', () => {
  const r = parseIntent('necesito sacarme el azucar y la biometria hoy a las 10 de la manana', LUNES);
  assert.deepEqual(r.exams.sort(), ['glucosa', 'hemograma']);
  assert.equal(r.date, '2026-11-09');
  assert.equal(r.time, '10:00');
});

test('parseIntent: pasado mañana, tarde, hh:mm', () => {
  assert.equal(parseIntent('pasado mañana', LUNES).date, '2026-11-11');
  assert.equal(parseIntent('a las 2 de la tarde', LUNES).time, '14:00');
  assert.equal(parseIntent('a las 7:30', LUNES).time, '07:30');
  assert.equal(parseIntent('mañana por la mañana', LUNES).date, '2026-11-10');
  assert.equal(parseIntent('mañana por la mañana', LUNES).time, undefined);
  assert.equal(parseIntent('el lunes', LUNES).date, '2026-11-16');
});

test('parseIntent: sinónimos y exámenes múltiples', () => {
  assert.deepEqual(parseIntent('perfil lipidico y examen de orina', LUNES).exams.sort(), ['ego', 'lipidos']);
  assert.deepEqual(parseIntent('cultivo de orina', LUNES).exams, ['urocultivo']);
  assert.deepEqual(parseIntent('hemoglobina glicosilada', LUNES).exams, ['hba1c']);
  assert.deepEqual(parseIntent('hola buenas', LUNES), {});
});

/* ---------- explainResult ---------- */

const order = {
  id: 'o1', patientId: 'p1', date: '2026-11-06',
  items: [{ examId: 'hemograma', name: 'Hemograma completo', price: 8 }],
  results: { hemoglobina: 10.5, hematocrito: 40, leucocitos: 7, plaquetas: 250 },
  published: true,
};

test('explainResult: hemoglobina baja menciona anemia y aviso', () => {
  const t = explainResult(order, '¿qué significa hemoglobina baja?', 'F');
  assert.match(t, /anemia/);
  assert.match(t, /no sustituye una consulta médica/);
  assert.ok(t.endsWith(DISCLAIMER));
  assert.ok(noEmoji(t));
  const sentences = t.split(/(?<=\.)\s+/).length;
  assert.ok(sentences >= 2 && sentences <= 5, `frases: ${sentences}`);
});

test('explainResult: sinónimo azúcar → glucosa', () => {
  const o = { ...order, items: [{ examId: 'glucosa', name: 'Glucosa en ayunas', price: 4 }], results: { glucosa: 130 } };
  const t = explainResult(o, 'mi azucar esta alta?', 'M');
  assert.match(t, /glucosa/i);
  assert.match(t, /diabetes|alta/i);
  assert.ok(t.endsWith(DISCLAIMER));
});

test('explainResult: sin mención resume fuera de rango; todo normal; sin resultados', () => {
  const t = explainResult(order, 'explícame mi resultado', 'F');
  assert.match(t, /hemoglobina/i);
  assert.ok(t.endsWith(DISCLAIMER));
  const ok = explainResult({ ...order, results: { hemoglobina: 13.5, hematocrito: 40, leucocitos: 7, plaquetas: 250 } }, 'cómo salí', 'F');
  assert.match(ok, /dentro del rango/);
  assert.ok(ok.endsWith(DISCLAIMER));
  assert.ok(explainResult({ ...order, results: null }, 'hola', 'F').endsWith(DISCLAIMER));
});

test('explainResult: rango por sexo', () => {
  const o = { ...order, results: { hemoglobina: 13, hematocrito: 40, leucocitos: 7, plaquetas: 250 } };
  assert.match(explainResult(o, 'hemoglobina', 'F'), /dentro del rango/);
  assert.match(explainResult(o, 'hemoglobina', 'M'), /anemia/);
});

/* ---------- assistantStep ---------- */

function run(texts, state, today = LUNES) {
  let ctx = {}, last;
  for (const t of texts) {
    last = assistantStep(ctx, t, state, today);
    ctx = last.ctx;
    assert.ok(noEmoji(last.reply) && !/[*#_`]/.test(last.reply), last.reply);
  }
  return last;
}

test('assistantStep: flujo de 4 turnos produce done válido', () => {
  const state = { appointments: [] };
  let ctx = {};
  let r = assistantStep(ctx, 'quiero un hemograma', state, LUNES);
  assert.equal(r.done, undefined);
  assert.match(r.reply, /día/);
  r = assistantStep(r.ctx, 'mañana', state, LUNES);
  assert.equal(r.done, undefined);
  assert.match(r.reply, /hora|7:|6:/);
  r = assistantStep(r.ctx, 'a las 8', state, LUNES);
  assert.equal(r.done, undefined);
  assert.match(r.reply, /confirm/i);
  r = assistantStep(r.ctx, 'sí', state, LUNES);
  assert.deepEqual(r.done, { exams: ['hemograma'], date: '2026-11-10', time: '08:00' });
  assert.ok(canBook(state, r.done.date, r.done.time));
});

test('assistantStep: todo en una frase va directo a confirmar', () => {
  const r = run(['quiero un hemograma mañana a las 8'], { appointments: [] });
  assert.match(r.reply, /confirm/i);
  assert.equal(r.done, undefined);
});

test('assistantStep: domingo cerrado', () => {
  const r = run(['glucosa el domingo'], { appointments: [] });
  assert.match(r.reply, /cerrado/i);
  assert.match(r.reply, /otro día/i);
  assert.equal(r.ctx.date, undefined);
});

test('assistantStep: "no" en confirmación vuelve a pedir hora', () => {
  const r = run(['hemograma mañana a las 8', 'no'], { appointments: [] });
  assert.equal(r.done, undefined);
  assert.match(r.reply, /hora/i);
  assert.equal(r.ctx.time, undefined);
  const r2 = assistantStep(r.ctx, 'a las 9', { appointments: [] }, LUNES);
  assert.match(r2.reply, /confirm/i);
  assert.equal(assistantStep(r2.ctx, 'sí', { appointments: [] }, LUNES).done.time, '09:00');
});

test('assistantStep: horario lleno sugiere 3 libres cercanos', () => {
  const full = [{ date: '2026-11-10', time: '08:00', status: 'pendiente' }, { date: '2026-11-10', time: '08:00', status: 'confirmada' }];
  const r = run(['hemograma mañana a las 8'], { appointments: full });
  assert.equal(r.done, undefined);
  assert.equal(r.ctx.time, undefined);
  assert.equal(r.ctx.suggested.length, 3);
  assert.ok(!r.ctx.suggested.includes('08:00'));
  assert.ok(r.ctx.suggested.every(t => canBook({ appointments: full }, '2026-11-10', t)));
  assert.ok(r.ctx.suggested.includes('07:30') && r.ctx.suggested.includes('08:30'));
  // elegir por ordinal
  const r2 = assistantStep(r.ctx, 'la primera', { appointments: full }, LUNES);
  assert.match(r2.reply, /confirm/i);
});

test('assistantStep: hoy sólo sugiere horas posteriores a la actual', () => {
  const now = new Date(2026, 10, 9, 10, 10);
  const r = run(['glucosa hoy'], { appointments: [] }, now);
  assert.ok(r.ctx.suggested.length > 0 && r.ctx.suggested.every(t => t > '10:10'));
  const early = assistantStep({ exams: ['glucosa'] }, 'hoy a las 8', { appointments: [] }, now);
  assert.equal(early.ctx.time, undefined);
  assert.ok(early.ctx.suggested.every(t => t > '10:10'));
});

test('assistantStep: sin examen reconocido pide examen', () => {
  const r = run(['hola'], { appointments: [] });
  assert.match(r.reply, /examen/i);
  assert.equal(r.done, undefined);
});

test('assistantStep: negaciones en confirmación no agendan', () => {
  const st = { appointments: [] };
  const c = assistantStep({}, 'hemograma mañana a las 8', st, LUNES).ctx;
  for (const t of ['no esta bien asi', 'no, mejor otro', 'no, ok']) {
    const r = assistantStep(c, t, st, LUNES);
    assert.equal(r.done, undefined, t);
    assert.equal(r.ctx.time, undefined, t);
    assert.match(r.reply, /hora/i);
  }
});

test('assistantStep: slot lleno entre confirmar y sí ofrece alternativas', () => {
  const c = assistantStep({}, 'hemograma mañana a las 8', { appointments: [] }, LUNES).ctx;
  const full = { appointments: [{ date: '2026-11-10', time: '08:00', status: 'pendiente' }, { date: '2026-11-10', time: '08:00', status: 'confirmada' }] };
  const r = assistantStep(c, 'sí', full, LUNES);
  assert.equal(r.done, undefined);
  assert.match(r.reply, /llenó|llenar/);
  assert.equal(r.ctx.suggested.length, 3);
  assert.ok(!r.ctx.suggested.includes('08:00'));
});
