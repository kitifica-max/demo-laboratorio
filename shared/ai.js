// IA simulada: parser de intención, máquina de citas y explicación de resultados.
// Módulo puro (sin DOM ni Node APIs): importable en navegador y Node.
import { CATALOG, flag, paramsFor, slotsFor, canBook, toISO, addDays } from './core.js';

export const DISCLAIMER = 'Esto no sustituye una consulta médica.';

/* ---------- normalización ---------- */

// minúsculas, sin acentos ni puntuación (la salida de voz llega así o peor).
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9: ]/g, ' ').replace(/\s+/g, ' ').trim();

// Sinónimos ya normalizados; plural opcional. Orden = prioridad (lo específico primero).
const EXAM_SYN = [
  ['urocultivo', ['urocultivo', 'cultivo de orina']],
  ['hba1c', ['hba1c', 'hemoglobina glicosilada', 'glicosilada', 'hemoglobina glicada']],
  ['prenatal', ['prenatal', 'control prenatal']],
  ['chequeo', ['chequeo', 'chequeo general', 'check up', 'checkeo', 'paquete completo']],
  ['egh', ['examen de heces', 'general de heces', 'egh', 'heces', 'coprologico', 'parasitos']],
  ['ego', ['examen de orina', 'general de orina', 'ego', 'orina', 'uroanalisis']],
  ['tipeo', ['tipeo', 'tipo de sangre', 'grupo sanguineo', 'tipado', 'factor rh']],
  ['hemograma', ['hemograma', 'biometria hematica', 'biometria', 'hematologia', 'cuenta sanguinea', 'hemoglobina']],
  ['vsg', ['vsg', 'sedimentacion']],
  ['coagulacion', ['coagulacion', 'tiempos de coagulacion', 'tp tpt']],
  ['glucosa', ['glucosa', 'azucar', 'glicemia', 'glucemia']],
  ['lipidos', ['perfil lipidico', 'lipidos', 'colesterol', 'trigliceridos']],
  ['creatinina', ['creatinina']],
  ['acido_urico', ['acido urico']],
  ['hepatico', ['perfil hepatico', 'hepatico', 'higado', 'tgo', 'tgp', 'transaminasas']],
  ['bun', ['nitrogeno ureico', 'bun', 'urea']],
  ['tiroideo', ['perfil tiroideo', 'tiroideo', 'tiroides', 'tsh']],
  ['psa', ['psa', 'prostata']],
  ['embarazo', ['prueba de embarazo', 'embarazo', 'bhcg']],
  ['vih', ['vih']],
  ['vdrl', ['vdrl']],
  ['pcr', ['pcr', 'proteina c reactiva']],
  ['covid', ['covid', 'coronavirus']],
  ['dengue', ['dengue']],
];

// Busca sinónimos con límites de palabra; quita lo encontrado para que no se reutilice.
function matchSyn(text, table) {
  let t = ' ' + text + ' ';
  const found = [];
  for (const [id, syns] of table) {
    for (const s of syns) {
      const re = new RegExp(`(?<= )${s}s?(?= )`);
      if (re.test(t)) { found.push(id); t = t.replace(new RegExp(`(?<= )${s}s?(?= )`, 'g'), ' '); break; }
    }
  }
  return found;
}

/* ---------- fechas y horas ---------- */

const DAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const DAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const NUM_WORDS = { una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12 };
const pad = n => String(n).padStart(2, '0');
const dowOf = iso => new Date(iso + 'T00:00:00Z').getUTCDay();

export function parseIntent(text, today = new Date()) {
  let n = norm(text);
  const out = {};

  const exams = matchSyn(n, EXAM_SYN);
  if (exams.length) out.exams = exams;

  // Franja del día: se detecta y se quita antes de buscar "mañana" como fecha.
  let pm = false, am = false;
  n = n.replace(/\b(?:de|por|en|a) la (manana|tarde|noche)\b/g, (_, p) => { if (p === 'manana') am = true; else pm = true; return ' '; });
  n = n.replace(/\b(pm|p m)\b/g, () => { pm = true; return ' '; }).replace(/\b(am|a m)\b/g, () => { am = true; return ' '; });
  n = n.replace(/\s+/g, ' ');

  // Fecha
  const base = toISO(today);
  if (/\bpasado manana\b/.test(n)) out.date = addDays(base, 2);
  else if (/\bmanana\b/.test(n)) out.date = addDays(base, 1);
  else if (/\bhoy\b/.test(n)) out.date = base;
  else {
    const i = DAYS.findIndex(d => new RegExp(`\\b${d}s?\\b`).test(n));
    if (i >= 0) out.date = addDays(base, ((i - dowOf(base) + 7) % 7) || 7);
  }

  // Hora
  const w = n.replace(/\b(?:a )?(las?) (una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\b/g, (_, a, word) => `${a} ${NUM_WORDS[word]}`);
  let h, m = 0, mm;
  if ((mm = w.match(/\b(\d{1,2}):(\d{2})\b/))) { h = +mm[1]; m = +mm[2]; }
  else if ((mm = w.match(/\bla?s? (\d{1,2})(?: y (media|cuarto)| con (\d{1,2}))?(?= |$)/))) {
    h = +mm[1]; m = mm[2] === 'media' ? 30 : mm[2] === 'cuarto' ? 15 : mm[3] ? +mm[3] : 0;
  } else if ((mm = w.match(/\b(\d{1,2}) y (media|cuarto)\b/))) { h = +mm[1]; m = mm[2] === 'media' ? 30 : 15; }
  if (h !== undefined && h <= 23 && m <= 59) {
    if (pm && h < 12) h += 12;
    else if (!pm && !am && h >= 1 && h <= 5) h += 12; // el laboratorio abre 6:30; "a las 2" es la tarde
    out.time = `${pad(h)}:${pad(m)}`;
  }
  return out;
}

/* ---------- explicación de resultados ---------- */

// [qué mide, qué puede significar si está bajo, si está alto]
const INFO = {
  hemoglobina: ['la proteína de la sangre que transporta el oxígeno', 'puede indicar anemia, por ejemplo por falta de hierro o pérdida de sangre', 'puede verse con deshidratación, tabaquismo o vivir en altura'],
  hematocrito: ['el porcentaje de la sangre ocupado por glóbulos rojos', 'puede acompañar a una anemia', 'puede verse con deshidratación'],
  leucocitos: ['los glóbulos blancos, que son las defensas del cuerpo', 'puede relacionarse con algunas infecciones virales o con defensas bajas', 'suele aparecer con infecciones o inflamación'],
  plaquetas: ['las células que ayudan a coagular la sangre', 'puede aumentar el riesgo de sangrado', 'puede asociarse a inflamación o a deficiencia de hierro'],
  vsg: ['un indicador general de inflamación', null, 'sugiere inflamación o infección, sin decir cuál'],
  tp: ['qué tan rápido coagula la sangre', null, 'indica que la sangre tarda más en coagular, algo común con anticoagulantes'],
  tpt: ['qué tan rápido coagula la sangre', null, 'indica que la sangre tarda más en coagular, algo común con anticoagulantes'],
  glucosa: ['el azúcar en la sangre en ayunas', 'puede causar mareo y debilidad, y a veces se debe a ayuno prolongado', 'puede sugerir prediabetes o diabetes, sobre todo si se repite'],
  hba1c: ['el promedio del azúcar en la sangre de los últimos tres meses', null, 'sugiere un control del azúcar por encima de lo ideal, como prediabetes o diabetes'],
  colesterol: ['la grasa total circulando en la sangre', null, 'aumenta el riesgo cardiovascular con el tiempo'],
  hdl: ['el colesterol bueno, que protege las arterias', 'ofrece menos protección para el corazón', null],
  ldl: ['el colesterol malo, que puede acumularse en las arterias', null, 'aumenta el riesgo cardiovascular con el tiempo'],
  trigliceridos: ['un tipo de grasa de la sangre ligada a la dieta', null, 'suele subir con exceso de azúcares, grasas o alcohol'],
  creatinina: ['un desecho que filtran los riñones', null, 'puede indicar que los riñones filtran menos, o deshidratación'],
  acido_urico: ['un desecho que se elimina por el riñón', null, 'puede asociarse a gota o a piedras en el riñón'],
  tgo: ['una enzima del hígado y los músculos', null, 'puede indicar irritación del hígado o esfuerzo muscular reciente'],
  tgp: ['una enzima propia del hígado', null, 'puede indicar irritación del hígado, por ejemplo por grasa, alcohol o medicamentos'],
  bilirrubina: ['un pigmento que procesa el hígado', null, 'puede dar color amarillento a la piel y relacionarse con el hígado o las vías biliares'],
  bun: ['un desecho de las proteínas que eliminan los riñones', 'puede verse con poca ingesta de proteínas', 'puede verse con deshidratación o menor función del riñón'],
  ph_orina: ['qué tan ácida o alcalina es la orina', 'es una orina más ácida de lo habitual', 'es una orina más alcalina, a veces por dieta o infección'],
  densidad: ['qué tan concentrada está la orina', 'indica orina muy diluida, por tomar mucha agua', 'indica orina concentrada, a menudo por poca hidratación'],
  leuco_orina: ['los glóbulos blancos en la orina', null, 'puede sugerir una infección urinaria'],
  pcr: ['un marcador de inflamación en el cuerpo', null, 'sugiere inflamación o infección activa'],
  tsh: ['la hormona que regula la tiroides', 'puede indicar una tiroides que trabaja de más', 'puede indicar una tiroides que trabaja de menos'],
  t4l: ['la hormona principal de la tiroides', 'puede indicar una tiroides que trabaja de menos', 'puede indicar una tiroides que trabaja de más'],
  psa: ['una proteína de la próstata', null, 'puede deberse a inflamación o agrandamiento de la próstata, y requiere valoración médica'],
  grupo: ['su grupo sanguíneo'], rh: ['su factor Rh'], nitritos: ['una señal de bacterias en la orina'],
  parasitos: ['la presencia de parásitos en las heces'], sangre_oculta: ['sangre no visible en las heces'],
  urocultivo: ['si crecen bacterias en la orina'], bhcg: ['la hormona del embarazo'],
  vih: ['la presencia de anticuerpos contra el VIH'], vdrl: ['una prueba de detección de sífilis'],
  covid: ['el antígeno del virus SARS-CoV-2'], dengue: ['el antígeno del virus del dengue'],
};

// Sinónimos de pregunta por parámetro (normalizados). Orden = prioridad.
const PARAM_SYN = [
  ['hba1c', ['hba1c', 'hemoglobina glicosilada', 'glicosilada']],
  ['hdl', ['hdl', 'colesterol bueno']],
  ['ldl', ['ldl', 'colesterol malo']],
  ['hemoglobina', ['hemoglobina', 'anemia', 'hierro']],
  ['hematocrito', ['hematocrito']],
  ['leucocitos', ['leucocitos', 'globulos blancos', 'defensas']],
  ['plaquetas', ['plaquetas']],
  ['vsg', ['vsg', 'sedimentacion']],
  ['glucosa', ['glucosa', 'azucar', 'diabetes']],
  ['colesterol', ['colesterol']],
  ['trigliceridos', ['trigliceridos']],
  ['creatinina', ['creatinina', 'rinon', 'rinones']],
  ['acido_urico', ['acido urico', 'gota']],
  ['tgo', ['tgo']], ['tgp', ['tgp']],
  ['bilirrubina', ['bilirrubina']],
  ['bun', ['bun', 'urea', 'nitrogeno ureico']],
  ['tsh', ['tsh', 'tiroides']], ['t4l', ['t4l', 't4 libre', 't4']],
  ['psa', ['psa', 'prostata']], ['pcr', ['pcr', 'proteina c reactiva']],
  ['tp', ['tp', 'protrombina']], ['tpt', ['tpt']],
  ['ph_orina', ['ph']], ['densidad', ['densidad']],
  ['grupo', ['grupo sanguineo', 'tipo de sangre']], ['rh', ['rh']],
  ['nitritos', ['nitritos']], ['parasitos', ['parasitos']], ['sangre_oculta', ['sangre oculta']],
  ['urocultivo', ['urocultivo', 'cultivo']], ['bhcg', ['bhcg', 'embarazo']],
  ['vih', ['vih']], ['vdrl', ['vdrl', 'sifilis']], ['covid', ['covid']], ['dengue', ['dengue']],
];

const examById = id => CATALOG.find(e => e.id === id);
const num = v => (typeof v === 'number' ? String(v) : String(v));
const rangeText = p => (p.min == null ? `hasta ${p.max}` : p.min === 0 ? `hasta ${p.max}` : p.max == null ? `desde ${p.min}` : `de ${p.min} a ${p.max}`);
const lc = s => s.charAt(0).toLowerCase() + s.slice(1);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// Parámetros con resultado en la orden: [{param, value}] (sin duplicar claves).
function resultParams(order, sex) {
  const seen = new Set(), out = [];
  const res = order?.results;
  if (!res) return out;
  for (const it of order.items || []) {
    const ex = examById(it.examId);
    if (!ex) continue;
    const list = sex ? paramsFor(ex, sex) : ex.params;
    for (const p of list) {
      if (seen.has(p.key) || res[p.key] === undefined || res[p.key] === null) continue;
      seen.add(p.key);
      out.push({ param: p, value: res[p.key] });
    }
  }
  return out;
}

const qualAbnormal = (key, value) => {
  const v = norm(value);
  if (['vih', 'vdrl', 'covid', 'dengue', 'nitritos', 'sangre_oculta'].includes(key)) return /positiv|reactiv/.test(v);
  if (key === 'parasitos') return !/^no /.test(v);
  if (key === 'urocultivo') return !/^sin /.test(v);
  return false;
};

function status({ param, value }) {
  const f = flag(value, param);
  if (f) return f;
  return qualAbnormal(param.key, value) ? 'alterado' : 'normal';
}

const withUnit = ({ param, value }) => `${num(value)} ${param.unit}`.trim();

function explainOne(item) {
  const { param } = item;
  const info = INFO[param.key] || [param.name.toLowerCase()];
  const st = status(item);
  const parts = [`${cap(param.name)} mide ${info[0]}.`];
  if (param.min == null && param.max == null) {
    parts.push(`Su resultado fue: ${item.value}.`);
    parts.push(st === 'alterado'
      ? 'Este resultado merece revisión; conviene comentarlo con su médico o repetir la prueba.'
      : 'No muestra alteraciones.');
  } else if (st === 'normal') {
    parts.push(`Su resultado fue ${withUnit(item)}, dentro del rango de referencia (${rangeText(param)}).`);
    parts.push('No requiere ninguna acción especial.');
  } else {
    const idx = st === 'bajo' ? 1 : 2;
    parts.push(`Su resultado fue ${withUnit(item)}, ${st === 'bajo' ? 'por debajo' : 'por encima'} del rango de referencia (${rangeText(param)}).`);
    parts.push(info[idx] ? `Un valor ${st} ${info[idx]}.` : `Un valor ${st} puede tener varias causas.`);
    parts.push('Conviene repetir la prueba y comentarlo con su médico.');
  }
  return parts.join(' ');
}

export function explainResult(order, question, sex) {
  const items = resultParams(order, sex);
  if (!items.length) return `Este resultado todavía no está disponible. ${DISCLAIMER}`;

  const q = norm(question);
  const keys = new Set(matchSyn(q, PARAM_SYN));
  const mentioned = items.filter(i => keys.has(i.param.key));

  let body;
  if (mentioned.length === 1) body = explainOne(mentioned[0]);
  else {
    const pool = mentioned.length ? mentioned : items;
    const bad = pool.filter(i => status(i) !== 'normal');
    if (!bad.length) body = mentioned.length
      ? 'Los valores que menciona están dentro del rango de referencia. Si tiene síntomas, coméntelo con su médico.'
      : 'Todos sus valores están dentro del rango de referencia. Si tiene síntomas, coméntelo con su médico.';
    else {
      const shown = bad.slice(0, 3).map(i => {
        const st = status(i);
        return i.param.min == null && i.param.max == null ? `${lc(i.param.name)} ${i.value}` : `${lc(i.param.name)} ${withUnit(i)} (${st})`;
      });
      const extra = bad.length > 3 ? ` y ${bad.length - 3} más` : '';
      body = `Estos valores salieron fuera del rango de referencia: ${shown.join(', ')}${extra}. ` +
        'Pueden tener varias causas y no siempre son graves. Conviene repetir la prueba y comentarlo con su médico.';
    }
  }
  return `${body} ${DISCLAIMER}`;
}

/* ---------- asistente de citas ---------- */

const fmtTime = t => {
  const [h, m] = t.split(':').map(Number);
  const part = h < 12 ? 'de la mañana' : h === 12 ? 'del mediodía' : 'de la tarde';
  return `${h > 12 ? h - 12 : h}:${pad(m)} ${part}`;
};
const fmtDate = iso => {
  const d = new Date(iso + 'T00:00:00Z');
  return `${DAYS_ES[d.getUTCDay()]} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`;
};
const listOr = a => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' o ' + a[a.length - 1]);
const examNames = ids => ids.map(id => examById(id)?.name || id).join(' y ');

const YES = /\b(si|sip|claro|dale|ok|okay|confirmo|confirmado|correcto|perfecto|exacto|adelante|de acuerdo|esta bien|listo)\b/;
const NO = /\b(no|nop|cambiar|otra|otro)\b/;
const ORDINALS = [[/\b(primer[ao]?|opcion 1)\b/, 0], [/\b(segund[ao]|opcion 2)\b/, 1], [/\b(tercer[ao]?|opcion 3)\b/, 2], [/\bultim[ao]\b/, -1]];

// Horas libres (reservables y futuras si es hoy) de un día.
function freeSlots(state, iso, today) {
  const now = toISO(today) === iso ? today.getHours() * 60 + today.getMinutes() : -1;
  return slotsFor(iso).filter(t => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m > now && canBook(state, iso, t);
  });
}

const minutes = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

function suggest(free, near) {
  const sorted = near
    ? [...free].sort((a, b) => Math.abs(minutes(a) - minutes(near)) - Math.abs(minutes(b) - minutes(near)) || minutes(a) - minutes(b))
    : [...free];
  return sorted.slice(0, 3).sort();
}

function advance(ctx, state, today, prefix = '') {
  const lead = prefix ? prefix + ' ' : '';
  if (!ctx.exams?.length) {
    return { reply: `${lead}¿Qué examen necesita? Por ejemplo hemograma, glucosa o perfil lipídico.`, ctx: { ...ctx, stage: 'exams' } };
  }
  if (!ctx.date) {
    return { reply: `${lead}Perfecto, ${examNames(ctx.exams)}. ¿Para qué día le gustaría la cita?`, ctx: { ...ctx, stage: 'date' } };
  }
  const { date, time } = ctx;
  const { time: _t, ...rest } = ctx;
  const askDay = msg => ({ reply: `${lead}${msg} ¿Qué otro día le queda bien?`, ctx: (({ date: _d, ...r }) => ({ ...r, stage: 'date', suggested: undefined }))(rest) });
  if (date < toISO(today)) return askDay('Esa fecha ya pasó.');
  if (!slotsFor(date).length) return askDay('Los domingos estamos cerrados.');
  const free = freeSlots(state, date, today);
  if (!free.length) return askDay(`Para ${fmtDate(date)} ya no hay horarios libres.`);

  if (time && free.includes(time)) {
    return {
      reply: `${lead}Muy bien. ${examNames(ctx.exams)}, el ${fmtDate(date)} a las ${fmtTime(time)}. ¿Lo confirmo?`,
      ctx: { ...ctx, stage: 'confirm', suggested: undefined },
    };
  }
  const sug = suggest(free, time);
  const miss = time ? `A las ${fmtTime(time)} no tengo espacio. ` : '';
  return {
    reply: `${lead}${miss}Para ${fmtDate(date)} tengo libre a las ${listOr(sug.map(fmtTime))}. ¿A qué hora le gustaría?`,
    ctx: { ...rest, stage: 'time', suggested: sug },
  };
}

export function assistantStep(ctx0, text, state, today = new Date()) {
  let ctx = ctx0 && ctx0.stage !== 'done' ? { ...ctx0 } : {};
  const n = norm(text);
  const intent = parseIntent(text, today);

  if (ctx.stage === 'confirm' && !intent.date && !intent.time && !intent.exams) {
    if (/^(no|nop)\b/.test(n) || (NO.test(n) && !YES.test(n))) {
      delete ctx.time;
      return advance(ctx, state, today, 'Está bien.');
    }
    if (YES.test(n)) {
      if (!freeSlots(state, ctx.date, today).includes(ctx.time)) {
        delete ctx.time;
        return advance(ctx, state, today, 'Ese horario se acaba de llenar.');
      }
      return { reply: `Listo, su cita quedó solicitada para el ${fmtDate(ctx.date)} a las ${fmtTime(ctx.time)}. Le esperamos.`, ctx: {}, done: { exams: [...ctx.exams], date: ctx.date, time: ctx.time } };
    }
    return { reply: '¿Confirmo la cita? Diga sí para confirmar o no para cambiar la hora.', ctx };
  }

  // Hora suelta respondiendo a "¿a qué hora?": "8", "8 y media".
  if (!intent.time && ctx.stage === 'time' && /^\d{1,2}( y (media|cuarto))?( (de|por|en) la \w+)?$/.test(n)) {
    Object.assign(intent, parseIntent('a las ' + text, today), { exams: intent.exams, date: intent.date });
    if (!intent.exams) delete intent.exams;
    if (!intent.date) delete intent.date;
  }
  // Elegir una de las horas sugeridas por ordinal.
  if (!intent.time && ctx.suggested?.length) {
    for (const [re, i] of ORDINALS) {
      if (re.test(n)) { intent.time = ctx.suggested.at(i) ?? ctx.suggested[0]; break; }
    }
  }

  if (intent.exams) ctx.exams = [...new Set([...(ctx.exams || []), ...intent.exams])];
  if (intent.date) ctx.date = intent.date;
  if (intent.time) ctx.time = intent.time;

  if (!ctx.exams?.length && !Object.keys(intent).length && /^(hola|buen|saludos|hey|buenas)/.test(n)) {
    return { reply: 'Hola, soy el asistente del laboratorio. ¿Qué examen necesita?', ctx: { ...ctx, stage: 'exams' } };
  }
  if (!ctx.exams?.length && n && !Object.keys(intent).length) {
    return advance(ctx, state, today, 'No logré identificar el examen.');
  }
  return advance(ctx, state, today);
}
