import { CATALOG, money, withIVA, flag, paramsFor, toISO, addDays, slotsFor, CAPACITY } from './shared/core.js';
import { assistantStep, explainResult } from './shared/ai.js';
import { connect, getRoom } from './shared/sync.js';
import { icon } from './shared/icons.js';

/* ---------- estado ---------- */
const room = getRoom('app');
const LS = { me: `demolab:me:${room}`, snap: `demolab:snap:${room}` };
const get = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin storage */ } };

let snap = get(LS.snap);
let me = get(LS.me);
const ui = {
  status: 'offline', busy: false,
  book: { exams: [], date: null, time: null },
  chat: [], ctx: {}, listening: false,
  ask: {}, // orderId -> [{who, text}]
};

const sync = room ? connect(room, 'app', {
  onStatus: s => { ui.status = s; renderHeaderStatus(); },
  onSnapshot: s => {
    const prevLoad = JSON.stringify(snap?.load?.[ui.book.date] || {});
    snap = s; put(LS.snap, s);
    const changed = prevLoad !== JSON.stringify(s.load?.[ui.book.date] || {});
    render({ flashSlots: changed });
  },
}) : null;

/* ---------- utilidades ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const examById = id => CATALOG.find(e => e.id === id);
const price = e => snap?.prices?.[e.id] ?? e.price;
const today = () => toISO(new Date());
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const fmtDay = iso => { const d = new Date(iso + 'T00:00:00'); return `${DIA[d.getDay()]} ${d.getDate()} ${MES[d.getMonth()]}`; };
const fmt12 = t => { const [h, m] = t.split(':').map(Number); return `${h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`; };
const myself = () => snap?.patients?.find(p => p.id === me) || null;
const firstName = () => (myself()?.name || '').split(' ')[0];
const load = (d, t) => snap?.load?.[d]?.[t] || 0;
const isPast = (d, t) => { if (d > today()) return false; if (d < today()) return true; const [h, m] = t.split(':').map(Number); const n = new Date(); return h * 60 + m <= n.getHours() * 60 + n.getMinutes(); };

// Estado mínimo para el asistente: citas sintéticas a partir de la ocupación del snapshot.
const assistantState = () => ({
  appointments: Object.entries(snap?.load || {}).flatMap(([date, times]) =>
    Object.entries(times).flatMap(([time, n]) => Array.from({ length: n }, () => ({ date, time, status: 'confirmada' })))),
});

function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: msg });
  t.style.bottom = 'calc(96px + env(safe-area-inset-bottom))';
  document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}

function orderParams(order, sex) {
  const seen = new Set(), out = [];
  for (const it of order.items) for (const p of paramsFor(examById(it.examId) || { params: [] }, sex)) {
    if (!seen.has(p.key) && order.results?.[p.key] !== undefined) { seen.add(p.key); out.push(p); }
  }
  return out;
}

/* ---------- voz ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, spokeLast = false;
function speak(text) {
  if (!spokeLast || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/\$/g, ' dólares '));
  u.lang = 'es-US';
  const v = speechSynthesis.getVoices().find(v => /^es(-|_)(US|MX|419|SV)/i.test(v.lang)) || speechSynthesis.getVoices().find(v => /^es/i.test(v.lang));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
function listen(onText, lang = 'es-SV') {
  if (!SR) return;
  if (rec) { rec.stop(); return; }
  rec = new SR();
  rec.lang = lang; rec.interimResults = false; rec.maxAlternatives = 1;
  rec.onresult = e => { const t = e.results[0][0].transcript; spokeLast = true; onText(t); };
  rec.onerror = e => {
    rec = null; ui.listening = false; updateMic();
    if (e.error === 'language-not-supported' && lang !== 'es-ES') return listen(onText, 'es-ES');
    if (e.error === 'not-allowed') toast('Permita el micrófono para hablar con el asistente');
    else if (e.error === 'network') toast('El dictado necesita internet. Puede escribir.');
  };
  rec.onend = () => { rec = null; ui.listening = false; updateMic(); };
  ui.listening = true; updateMic();
  try { rec.start(); } catch { rec = null; ui.listening = false; updateMic(); }
}
function updateMic() { document.querySelectorAll('.mic').forEach(b => b.classList.toggle('rec', ui.listening)); }

/* ---------- navegación ---------- */
const TABS = [['inicio', 'home', 'Inicio'], ['agendar', 'calendar', 'Agendar'], ['asistente', 'chat', 'Asistente'], ['resultados', 'results', 'Resultados'], ['perfil', 'user', 'Perfil']];
const route = () => { const [v = 'inicio', id] = location.hash.replace(/^#\/?/, '').split('/'); return { v, id }; };

function header(title, sub) {
  return `<div class="hdr"><div class="grow"><div class="muted small">${sub || ''}</div><h1>${title}</h1></div>
    <span class="status" id="hstatus">${statusHtml()}</span></div>`;
}
const statusHtml = () => `<span class="dot ${ui.status}"></span>${{ online: 'Conectado', local: 'Conectado', offline: 'Sin conexión' }[ui.status]}`;
function renderHeaderStatus() { const el = document.getElementById('hstatus'); if (el) el.innerHTML = statusHtml(); }

/* ---------- vistas ---------- */
const V = {};

V.login = () => {
  if (!room) return `<div style="padding-top:12vh" class="stack"><img src="icon.svg" alt="" width="56"><h1>Demo Laboratorio</h1>
    <div class="card">Abra esta app con el enlace que muestra el CRM (botón <b>App paciente</b>). El enlace incluye el código de sala.</div></div>`;
  const pts = snap?.patients || [];
  return `<div style="padding-top:6vh" class="stack">
    <div class="row"><img src="icon.svg" alt="" width="48"><div class="grow"><h1 style="font-size:21px">Demo Laboratorio</h1><div class="muted small">Sus exámenes, citas y resultados</div></div><span class="status" id="hstatus">${statusHtml()}</span></div>
    <div class="card"><h2 style="margin-bottom:4px">Crear cuenta</h2><div class="muted small" style="margin-bottom:12px">Solo nombre y teléfono.</div>
      <form id="register" class="stack"><input class="input" name="name" placeholder="Nombre completo" required autocomplete="name">
      <div class="row"><input class="input" name="phone" placeholder="Teléfono" inputmode="tel" required autocomplete="tel">
      <select class="input" name="sex" style="width:130px" aria-label="Sexo"><option value="F">Femenino</option><option value="M">Masculino</option></select></div>
      <button class="btn" style="width:100%" ${ui.busy ? 'disabled' : ''}>${ui.busy ? 'Creando…' : 'Crear cuenta'}</button></form></div>
    <div class="card"><h2 style="margin-bottom:4px">Paciente de demostración</h2><div class="muted small" style="margin-bottom:6px">Entre como un paciente existente.</div>
      ${pts.length ? `<div class="login-list">${pts.slice(0, 42).map((p, i) => `<a class="list-item" href="#" data-login="${p.id}"><span class="avatar ${i === 0 ? 'dark' : ''}">${esc(p.name.split(' ').slice(0, 2).map(w => w[0]).join(''))}</span>
        <div class="grow"><div style="font-weight:600">${esc(p.name)}</div><div class="muted small">${i === 0 ? 'Recomendado: tiene resultados recientes' : esc(p.phone)}</div></div>${icon('chevR')}</a>`).join('')}</div>`
        : `<div class="empty small">Conectando con el laboratorio…<br>Abra el CRM en la computadora.</div>`}</div></div>`;
};

V.inicio = () => {
  const p = myself();
  const appts = (snap?.appointments || []).filter(a => a.patientId === me && a.status !== 'cancelada').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const next = appts[0];
  const results = (snap?.orders || []).filter(o => o.patientId === me && o.results).sort((a, b) => b.date.localeCompare(a.date));
  const h = new Date().getHours();
  return `${header(`Hola, ${esc(firstName())}`, h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches')}
  <div class="stack">
    <div class="hero">${next ? `<div class="muted small">Próxima cita</div><div style="font-size:24px;font-weight:700;margin:6px 0 2px"><span style="text-transform:capitalize">${fmtDay(next.date)}</span> · ${fmt12(next.time)}</div>
      <div class="muted">${esc(next.examIds.map(id => examById(id)?.name).join(', '))}</div>
      ${next.examIds.map(id => examById(id)?.prep).filter(Boolean).slice(0, 1).map(pr => `<div style="margin-top:14px;background:#ffffff14;border-radius:14px;padding:10px 12px;font-size:13px">${esc(pr)}</div>`).join('')}`
      : `<div class="muted small">Sin citas próximas</div><div style="font-size:22px;font-weight:700;margin:6px 0 14px">¿Necesita un examen?</div><a class="btn accent" href="#/agendar">Agendar cita</a>`}</div>
    <div class="quick">
      <a class="qa dark" href="#/asistente"><span class="ic">${icon('mic')}</span><div style="font-weight:700">Agendar hablando</div><div class="small">Diga qué examen y cuándo</div></a>
      <a class="qa" href="#/resultados"><span class="ic">${icon('results')}</span><div style="font-weight:700">Mis resultados</div><div class="small muted">${results.length} disponibles</div></a>
    </div>
    ${results[0] ? `<div class="card"><div class="card-head" style="margin-bottom:4px"><h2>Último resultado</h2><a class="small" href="#/resultados" style="color:#2f6db3">Ver todos</a></div>${resultItem(results[0], p)}</div>` : ''}
    ${appts.length > 1 ? `<div class="card"><h2 style="margin-bottom:4px">Otras citas</h2>${appts.slice(1, 4).map(a => `<div class="list-item"><span class="num" style="font-weight:700;text-transform:capitalize">${fmtDay(a.date)}</span><span class="muted">${fmt12(a.time)}</span></div>`).join('')}</div>` : ''}
  </div>`;
};

function resultItem(o, p) {
  const bad = orderParams(o, p?.sex).filter(pr => ['bajo', 'alto'].includes(flag(o.results[pr.key], pr))).length;
  return `<a class="list-item" href="#/resultados/${o.id}"><span class="avatar">${icon('results', 'svg-i')}</span>
    <div class="grow"><div style="font-weight:600">${esc(o.items.map(i => i.name).join(', '))}</div><div class="muted small" style="text-transform:capitalize">${fmtDay(o.date)}</div></div>
    ${bad ? `<span class="pill warn">${bad} fuera de rango</span>` : '<span class="pill ok">Normal</span>'}</a>`;
}

V.agendar = () => {
  const b = ui.book;
  const days = Array.from({ length: 14 }, (_, i) => addDays(today(), i)).filter(d => slotsFor(d).length);
  if (!b.date || !days.includes(b.date)) b.date = days.find(d => slotsFor(d).some(t => !isPast(d, t))) || days[0];
  const slots = slotsFor(b.date);
  if (b.time && (load(b.date, b.time) >= CAPACITY || isPast(b.date, b.time))) b.time = null;
  const sel = b.exams.map(examById);
  const tot = withIVA(sel.reduce((s, e) => s + price(e), 0));
  const cats = [...new Set(CATALOG.map(e => e.category))];
  return `${header('Agendar cita', 'Elija examen, día y hora')}
  <div class="sec-title" style="margin-top:0">Exámenes</div>
  ${cats.map(c => `<div class="muted small" style="margin:10px 0 6px">${c}</div><div class="chips">${CATALOG.filter(e => e.category === c).map(e => `<button class="chip ${b.exams.includes(e.id) ? 'on' : ''}" data-exam="${e.id}">${e.name}</button>`).join('')}</div>`).join('')}
  ${sel.length ? `<div class="prep"><b>Preparación</b>${[...new Set(sel.map(e => e.prep))].map(pr => `<div>${esc(pr)}</div>`).join('')}</div>` : ''}
  <div class="sec-title">Día</div>
  <div class="days">${days.map(d => { const dt = new Date(d + 'T00:00:00'); return `<button class="day ${d === b.date ? 'on' : ''}" data-date="${d}"><span>${DIA[dt.getDay()]}</span><b>${dt.getDate()}</b><span>${MES[dt.getMonth()]}</span></button>`; }).join('')}</div>
  <div class="sec-title row" style="justify-content:space-between"><span>Hora</span><span class="row small" style="text-transform:none;letter-spacing:0;gap:6px"><span class="dot online"></span>en vivo</span></div>
  <div class="slotgrid" id="slotgrid">${slots.map(t => { const full = load(b.date, t) >= CAPACITY, past = isPast(b.date, t); return `<button class="sl ${t === b.time ? 'on' : ''}" data-time="${t}" ${full || past ? 'disabled' : ''} aria-label="${t}${full ? ' ocupado' : ''}">${t}</button>`; }).join('')}</div>
  <div class="row small muted" style="margin:10px 0 18px;gap:14px"><span class="row" style="gap:6px"><i style="width:12px;height:12px;border-radius:4px;background:#fff;display:inline-block"></i>Libre</span><span class="row" style="gap:6px"><i style="width:12px;height:12px;border-radius:4px;box-shadow:inset 0 0 0 1px #ccc;display:inline-block"></i>Ocupado</span></div>
  <div class="sumbar"><div class="grow"><div class="muted small">${sel.length ? `${sel.length} examen${sel.length > 1 ? 'es' : ''} · IVA incluido` : 'Seleccione exámenes'}</div><div style="font-weight:700;font-size:18px" class="num">${money(tot.total)}</div></div>
    <button class="btn" data-act="book" ${sel.length && b.time && !ui.busy ? '' : 'disabled'}>${ui.busy ? 'Enviando…' : b.time ? `Confirmar ${b.time}` : 'Elija hora'}</button></div>`;
};

const SUGGEST = ['Quiero un hemograma mañana a las 8', 'Glucosa el viernes 7 y media', 'Perfil lipídico pasado mañana', '¿Qué horarios hay el sábado?'];

V.asistente = () => {
  if (!ui.chat.length) ui.chat.push({ who: 'bot', text: `Hola${firstName() ? ' ' + firstName() : ''}, soy el asistente del laboratorio. Dígame qué examen necesita y para cuándo. Por ejemplo: “quiero un hemograma mañana a las 8”.` });
  return `${header('Asistente', SR ? 'Hable o escriba' : 'Escriba su mensaje')}
  <div class="chat" id="chat">${ui.chat.map(m => `<div class="msg ${m.who} ${m.ok ? 'ok' : ''}">${esc(m.text)}</div>`).join('')}</div>
  ${ui.chat.length < 3 ? `<div class="suggest">${SUGGEST.map(s => `<button class="chip" data-say="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
  <form class="composer" id="chatform">
    ${SR ? `<button type="button" class="btn icon-btn mic ${ui.listening ? 'rec' : ''}" data-act="mic" aria-label="Hablar">${icon('mic')}</button>` : ''}
    <input class="input grow" name="t" id="chatin" placeholder="Escriba aquí…" autocomplete="off">
    <button class="btn icon-btn" aria-label="Enviar">${icon('send')}</button></form>`;
};

V.resultados = id => {
  const p = myself();
  const mine = (snap?.orders || []).filter(o => o.patientId === me && o.results).sort((a, b) => b.date.localeCompare(a.date));
  if (!id) return `${header('Mis resultados', `${mine.length} disponibles`)}
    <div class="card">${mine.length ? mine.map(o => resultItem(o, p)).join('') : '<div class="empty">Aún no tiene resultados publicados. Le avisaremos aquí cuando estén listos.</div>'}</div>`;
  const o = mine.find(x => x.id === id);
  if (!o) return `${header('Resultado')}<div class="card empty">No encontrado.</div>`;
  const params = orderParams(o, p?.sex);
  const qa = ui.ask[o.id] ||= [];
  const bar = (pr, v) => {
    if (pr.min == null && pr.max == null) return '';
    const n = Number(v); if (!Number.isFinite(n)) return '';
    const lo = Math.min(pr.min ?? 0, n), hi = Math.max(pr.max, n), pad = (hi - lo) * 0.25 || 1;
    const a = lo - pad < 0 && (pr.min ?? 0) >= 0 ? 0 : lo - pad, z = hi + pad;
    const pct = x => ((x - a) / (z - a) * 100).toFixed(1);
    const f = flag(v, pr);
    return `<div class="range"><div class="band" style="left:${pct(pr.min ?? 0)}%;right:${100 - pct(pr.max)}%"></div><div class="mark ${f === 'normal' ? '' : 'bad'}" style="left:${pct(n)}%"></div></div>
      <div class="row small muted" style="justify-content:space-between"><span>Referencia ${pr.min ?? 0} – ${pr.max} ${esc(pr.unit)}</span></div>`;
  };
  return `<div class="hdr"><a class="btn ghost icon-btn" href="#/resultados" aria-label="Volver">${icon('chevL')}</a><div class="grow"><div class="muted small" style="text-transform:capitalize">${fmtDay(o.date)} · Orden ${o.id}</div><h1 style="font-size:19px">${esc(o.items.map(i => i.name).join(', '))}</h1></div></div>
  <div class="card">${params.map(pr => { const v = o.results[pr.key], f = flag(v, pr); return `<div class="param">
    <div class="row"><div class="grow" style="font-weight:600">${esc(pr.name)}</div><div class="num" style="font-weight:700;font-size:16px">${esc(v ?? '—')} <span class="muted small">${esc(pr.unit)}</span></div>
    ${f ? `<span class="pill ${f === 'normal' ? 'ok' : 'bad'}">${f}</span>` : ''}</div>${bar(pr, v)}</div>`; }).join('')}</div>
  <div class="sec-title">Pregúntale a la IA</div>
  <div class="chat" style="min-height:0">${qa.length ? qa.map(m => `<div class="msg ${m.who}">${esc(m.text)}</div>`).join('') : `<div class="msg bot">Puedo explicarle qué significa cada valor. ¿Qué le gustaría saber?</div>`}</div>
  ${qa.length < 2 ? `<div class="suggest">${[...params.filter(pr => ['bajo', 'alto'].includes(flag(o.results[pr.key], pr))).map(pr => `¿Qué significa un valor ${flag(o.results[pr.key], pr)} de ${pr.name.toLowerCase()}?`), '¿Mis resultados están bien?'].slice(0, 3).map(s => `<button class="chip" data-ask="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
  <form class="composer" id="askform" style="position:static" data-id="${o.id}">
    ${SR ? `<button type="button" class="btn icon-btn mic" data-act="micask" aria-label="Hablar">${icon('mic')}</button>` : ''}
    <input class="input grow" name="t" id="askin" placeholder="Escriba su pregunta…" autocomplete="off"><button class="btn icon-btn" aria-label="Enviar">${icon('send')}</button></form>`;
};

V.perfil = () => {
  const p = myself() || {};
  const f = (k, v) => `<div class="list-item"><span class="muted grow">${k}</span><span style="font-weight:600;text-align:right">${esc(v || '—')}</span></div>`;
  return `${header('Mi perfil')}
  <div class="card row" style="margin-bottom:14px"><span class="avatar dark" style="width:52px;height:52px;font-size:16px">${esc((p.name || '').split(' ').slice(0, 2).map(w => w[0]).join(''))}</span>
    <div><h2>${esc(p.name)}</h2><div class="muted small">Paciente ${esc((p.id || '').toUpperCase())}</div></div></div>
  <div class="card">${f('DUI', p.dui)}${f('Fecha de nacimiento', p.birthDate)}${f('Sexo', p.sex === 'M' ? 'Masculino' : 'Femenino')}${f('Teléfono', p.phone)}${f('Correo', p.email)}</div>
  <div class="card" style="margin-top:14px">${f('Laboratorio', 'Demo Laboratorio')}${f('Horario', 'Lun–vie 6:30–16:00 · Sáb 7:00–12:00')}${f('Sala', room.toUpperCase())}</div>
  <button class="btn ghost" data-act="logout" style="width:100%;margin-top:14px">${icon('logout')}Cerrar sesión</button>
  <p class="muted small" style="text-align:center;margin-top:16px">Datos ficticios para demostración.</p>`;
};

/* ---------- render ---------- */
function render({ flashSlots } = {}) {
  const root = document.getElementById('root');
  const loggedIn = me && myself();
  const { v, id } = route();
  // Conservar texto en edición y foco al re-renderizar por un snapshot nuevo.
  const active = document.activeElement?.id;
  const drafts = Object.fromEntries([...root.querySelectorAll('input[id]')].map(i => [i.id, i.value]));
  root.innerHTML = loggedIn ? (V[v] || V.inicio)(id) : V.login();
  for (const [k, val] of Object.entries(drafts)) { const el = document.getElementById(k); if (el) el.value = val; }
  if (active) document.getElementById(active)?.focus();
  if (flashSlots) document.querySelectorAll('.sl:disabled').forEach(b => b.classList.add('flash'));
  const tb = document.getElementById('tabbar');
  tb.hidden = !loggedIn;
  const cur = v === 'resultados' ? 'resultados' : v;
  tb.innerHTML = TABS.map(([k, ic, name]) => `<a class="tab ${cur === k ? 'on' : ''}" href="#/${k}">${icon(ic)}${name}</a>`).join('');
  const chat = document.getElementById('chat');
  if (chat && (v === 'asistente' || id)) chat.lastElementChild?.scrollIntoView({ block: 'nearest' });
}

/* ---------- acciones ---------- */
async function sendBook(req) {
  if (!sync) return { ok: false, error: 'Sin conexión con el laboratorio' };
  return sync.sendRequest({ type: 'book', patientId: me, ...req });
}

async function chatSay(text) {
  text = text.trim();
  if (!text) return;
  ui.chat.push({ who: 'me', text });
  const step = assistantStep(ui.ctx, text, assistantState(), new Date());
  ui.ctx = step.ctx;
  ui.chat.push({ who: 'bot', text: step.done ? 'Enviando su solicitud al laboratorio…' : step.reply });
  render();
  if (!step.done) return speak(step.reply);
  const r = await sendBook({ date: step.done.date, time: step.done.time, examIds: step.done.exams });
  ui.chat.pop();
  if (r.ok) { ui.chat.push({ who: 'bot', ok: true, text: step.reply }); speak(step.reply); }
  else {
    const msg = `${r.error || 'No se pudo agendar'}. ¿Le busco otra hora?`;
    ui.ctx = { exams: step.done.exams, date: step.done.date, stage: 'time' };
    ui.chat.push({ who: 'bot', text: msg }); speak(msg);
  }
  render();
}

function askAI(orderId, text) {
  text = text.trim();
  if (!text) return;
  const o = snap.orders.find(x => x.id === orderId);
  const reply = explainResult(o, text, myself()?.sex);
  (ui.ask[orderId] ||= []).push({ who: 'me', text }, { who: 'bot', text: reply });
  render(); speak(reply);
}

const actions = {
  async book() {
    const b = ui.book;
    ui.busy = true; render();
    const r = await sendBook({ date: b.date, time: b.time, examIds: b.exams });
    ui.busy = false;
    if (r.ok) { toast(`Cita confirmada: ${fmtDay(b.date)}, ${fmt12(b.time)}`); ui.book = { exams: [], date: null, time: null }; location.hash = '#/inicio'; }
    else { toast(r.error || 'No se pudo agendar'); b.time = null; }
    render();
  },
  mic() { listen(t => chatSay(t)); },
  micask() { const f = document.getElementById('askform'); listen(t => askAI(f.dataset.id, t)); },
  logout() { me = null; put(LS.me, null); ui.chat = []; ui.ctx = {}; location.hash = ''; render(); },
};

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-exam],[data-date],[data-time],[data-login],[data-say],[data-ask]');
  if (!t) return;
  e.preventDefault();
  const d = t.dataset;
  if (d.act) return actions[d.act]?.();
  if (d.login) { me = d.login; put(LS.me, me); location.hash = '#/inicio'; return render(); }
  if (d.exam) { const ex = ui.book.exams; ui.book.exams = ex.includes(d.exam) ? ex.filter(x => x !== d.exam) : [...ex, d.exam]; }
  if (d.date) { ui.book.date = d.date; ui.book.time = null; }
  if (d.time) ui.book.time = d.time;
  if (d.say) { spokeLast = false; return chatSay(d.say); }
  if (d.ask) { spokeLast = false; return askAI(document.getElementById('askform').dataset.id, d.ask); }
  render();
});

document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  if (f.id === 'chatform') { spokeLast = false; const t = f.t.value; f.t.value = ''; return chatSay(t); }
  if (f.id === 'askform') { spokeLast = false; const t = f.t.value; f.t.value = ''; return askAI(f.dataset.id, t); }
  if (f.id === 'register') {
    if (!sync) return;
    const fd = new FormData(f);
    ui.busy = true; render();
    const r = await sync.sendRequest({ type: 'register', name: fd.get('name'), phone: fd.get('phone'), sex: fd.get('sex') });
    ui.busy = false;
    if (r.ok) {
      me = r.patient.id; put(LS.me, me);
      // El snapshot con el paciente nuevo llega enseguida; mientras, lo agregamos localmente.
      snap = { ...(snap || {}), patients: [...(snap?.patients || []), r.patient] };
      location.hash = '#/inicio'; toast('Cuenta creada');
    } else toast(r.error || 'No se pudo crear la cuenta');
    render();
  }
});

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
render();
