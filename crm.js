import {
  CATALOG, money, withIVA, flag, paramsFor, toISO, addDays, slotsFor, slotLoad, CAPACITY,
  bookAppointment, createOrder, load, save, reset, toCSV, salesRows, salesDetailRows, purchaseRows, patientRows,
  snapshot, handleAppRequest,
} from './shared/core.js';
import { connect, getRoom } from './shared/sync.js';
import { icon } from './shared/icons.js';

/* ---------- estado ---------- */
let state = load();
state.activity ||= [];
const room = getRoom('crm');
const ui = { q: '', agendaDate: toISO(new Date()), status: 'offline', freshAppt: new Set(), freshFeed: 0,
  ventas: { from: monthStart(), to: toISO(new Date()) }, compras: { from: monthStart(), to: toISO(new Date()) },
  exp: { from: monthStart(), to: toISO(new Date()) }, resTab: 'pendientes' };

const sync = connect(room, 'crm', {
  onStatus: s => { ui.status = s; renderTop(); renderAside(); },
  onRequest: req => {
    const res = handleAppRequest(state, req);
    if (res.ok && req.type === 'book') {
      const p = patient(res.appt.patientId);
      ui.freshAppt.add(res.appt.id);
      log('app', 'calendar', `${p.name} agendó desde la app`, `${fmtDay(res.appt.date)} · ${res.appt.time} · ${examNames(res.appt.examIds)}`);
      toast(`Nueva cita desde la app: ${p.name.split(' ')[0]}, ${res.appt.time}`);
    } else if (res.ok && req.type === 'register') {
      log('app', 'user', `${res.patient.name} se registró en la app`, res.patient.phone);
    } else if (!res.ok && req.type === 'book') {
      log('app', 'clock', 'Solicitud rechazada', `${req.date} ${req.time}: ${res.error}`);
    }
    commit();
    return res;
  },
});

function commit() {
  state.activity = state.activity.slice(0, 40);
  save(state);
  sync.publishSnapshot(snapshot(state, toISO(new Date())));
  render();
}

function log(kind, ic, title, sub) {
  state.activity.unshift({ at: Date.now(), kind, ic, title, sub });
  ui.freshFeed = Date.now();
}

/* ---------- utilidades ---------- */
function monthStart(d = new Date()) { return toISO(new Date(d.getFullYear(), d.getMonth(), 1)); }
const today = () => toISO(new Date());
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const examById = id => CATALOG.find(e => e.id === id);
const examNames = ids => ids.map(id => examById(id)?.name || id).join(', ');
const patient = id => state.patients.find(p => p.id === id) || { name: 'Paciente', sex: 'F' };
const initials = n => n.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const fmtDay = iso => { const d = new Date(iso + 'T00:00:00'); return `${DIA[d.getDay()]} ${d.getDate()} ${MES[d.getMonth()]}`; };
const fmtShort = iso => { const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${MES[d.getMonth()]}`; };
const age = b => { if (!b) return '—'; const d = new Date(b), n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--; return a; };
const ago = t => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'ahora' : s < 3600 ? `hace ${Math.floor(s / 60)} min` : s < 86400 ? `hace ${Math.floor(s / 3600)} h` : `hace ${Math.floor(s / 86400)} d`; };
const price = ex => state.catalogPrices?.[ex.id] ?? ex.price;
const STATUS_PILL = { Pagado: 'ok', Pendiente: 'warn', Anulado: 'bad' };
const APPT_STATES = ['pendiente', 'confirmada', 'muestra tomada', 'completada', 'cancelada'];
const APPT_PILL = { pendiente: 'warn', confirmada: 'info', 'muestra tomada': '', completada: 'ok', cancelada: 'bad' };
const FLAG_PILL = { bajo: 'bad', alto: 'bad', normal: 'ok' };
const appUrl = () => new URL(`app.html?sala=${room}`, location.href).href;

// Parámetros únicos (por clave) de una orden para el sexo del paciente.
function orderParams(order, sex) {
  const seen = new Set(), out = [];
  for (const it of order.items) for (const p of paramsFor(examById(it.examId) || { params: [] }, sex)) {
    if (!seen.has(p.key)) { seen.add(p.key); out.push(p); }
  }
  return out;
}

function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: msg });
  document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}

function modal(html, onSubmit) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<form class="modal">${html}</form>`;
  const close = () => bg.remove();
  bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-close]')) close(); });
  bg.querySelector('form').addEventListener('submit', e => { e.preventDefault(); if (onSubmit(new FormData(e.target), bg) !== false) close(); });
  document.body.append(bg);
  bg.querySelector('input, select')?.focus();
  return bg;
}

function download(name, csv) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- marco: barra lateral, encabezado, actividad ---------- */
const NAV = [
  ['dashboard', 'dashboard', 'Panel'], ['pacientes', 'users', 'Pacientes'], ['agenda', 'calendar', 'Agenda'],
  ['resultados', 'results', 'Resultados'], ['catalogo', 'flask', 'Catálogo'], ['ventas', 'sales', 'Ventas'],
  ['compras', 'cart', 'Compras'], ['exportar', 'download', 'Exportar'],
];

function route() { const [v = 'dashboard', id] = location.hash.replace(/^#\/?/, '').split('/'); return { v, id }; }

function renderSide() {
  const { v } = route();
  const cur = v === 'paciente' ? 'pacientes' : v;
  const pend = state.orders.some(o => !o.results && o.status !== 'Anulado');
  document.getElementById('side').innerHTML = `
    <div class="logo" title="Demo Laboratorio">DL</div>
    ${NAV.map(([id, ic, name]) => `<a class="nav ${cur === id ? 'on' : ''}" href="#/${id}" aria-label="${name}">${icon(ic)}<span class="tip">${name}</span>${id === 'resultados' && pend ? '<i class="badge"></i>' : ''}</a>`).join('')}
    <div class="spacer"></div>
    <button class="nav" data-act="reset" style="border:0;background:none;cursor:pointer" aria-label="Reiniciar demo">${icon('reset')}<span class="tip">Reiniciar demo</span></button>`;
}

function renderTop() {
  const h = new Date().getHours();
  const hi = h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches';
  const label = { online: 'En vivo', local: 'Solo esta computadora', offline: 'Sin conexión' }[ui.status];
  const d = new Date();
  document.getElementById('top').innerHTML = `
    <div class="grow"><h1>${hi}, Jess</h1><div class="muted">${DIA[d.getDay()].replace(/^./, c => c.toUpperCase())} ${d.getDate()} de ${['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][d.getMonth()]}</div></div>
    <label class="search">${icon('search')}<input class="input" id="gsearch" placeholder="Buscar paciente, DUI o teléfono" value="${esc(ui.q)}"></label>
    <div class="conn" title="${label}"><span class="dot ${ui.status}"></span>Sala <span class="num">${room.toUpperCase()}</span>
      <button class="btn sm accent" data-act="applink">${icon('phone')}App paciente</button></div>
    <div class="account"><span class="avatar dark">JS</span>Mi cuenta</div>`;
}

function renderAside() {
  const items = state.activity.slice(0, 25);
  document.getElementById('aside').innerHTML = `
    <div class="card-head" style="margin-bottom:6px"><h2>Actividad</h2><span class="pill plain ${ui.status === 'online' ? 'ok' : ''}">${ui.status === 'online' ? 'En vivo' : 'Local'}</span></div>
    ${items.length ? `<ul class="feed">${items.map((a, i) => `
      <li class="${a.kind}${i === 0 && Date.now() - ui.freshFeed < 1500 ? ' fresh' : ''}"><span class="ic">${icon(a.ic)}</span>
        <div class="grow"><div style="font-weight:600">${esc(a.title)}</div><div class="muted small">${esc(a.sub || '')}</div></div>
        <span class="muted small" style="white-space:nowrap">${ago(a.at)}</span></li>`).join('')}</ul>`
      : `<div class="empty small">Aquí aparecerán las citas y registros que lleguen desde la app del paciente.<br><br>Abra la app con el botón <b>App paciente</b>.</div>`}`;
}

/* ---------- vistas ---------- */
const V = {};

V.dashboard = () => {
  const t = today(), ms = monthStart();
  const monthOrders = state.orders.filter(o => o.date >= ms && o.date <= t && o.status !== 'Anulado');
  const income = monthOrders.filter(o => o.status === 'Pagado').reduce((s, o) => s + o.total, 0);
  const pending = monthOrders.filter(o => o.status === 'Pendiente').reduce((s, o) => s + o.total, 0);
  const spend = state.purchases.filter(c => c.date >= ms && c.date <= t).reduce((s, c) => s + c.amount, 0);
  const todays = state.appointments.filter(a => a.date === t && a.status !== 'cancelada').sort((a, b) => a.time.localeCompare(b.time));

  // Ventas por categoría (mes)
  const byCat = {};
  for (const o of monthOrders) for (const it of o.items) { const c = examById(it.examId)?.category || 'Otros'; byCat[c] = (byCat[c] || 0) + it.price; }
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const COLORS = ['#3a3a3a', '#8ab8ec', '#b9b9b9', '#c9def6', '#6b6b6b', '#e0e0e0'];
  const sum = cats.reduce((s, [, v]) => s + v, 0) || 1;
  let acc = 0;
  const C = 2 * Math.PI * 52;
  const donut = cats.map(([, v], i) => { const len = v / sum * C; const seg = `<circle r="52" cx="70" cy="70" fill="none" stroke="${COLORS[i % 6]}" stroke-width="18" stroke-dasharray="${Math.max(len - 2, 0)} ${C}" stroke-dashoffset="${-acc}" transform="rotate(-90 70 70)"/>`; acc += len; return seg; }).join('');

  // Ingresos vs gastos 14 días
  const days = Array.from({ length: 14 }, (_, i) => addDays(t, i - 13));
  const inc = days.map(d => state.orders.filter(o => o.date === d && o.status === 'Pagado').reduce((s, o) => s + o.total, 0));
  const exp = days.map(d => state.purchases.filter(c => c.date === d).reduce((s, c) => s + c.amount, 0));
  const max = Math.max(...inc, ...exp, 1), H = 150, W = 560, bw = 12, step = W / 14;
  const bars = days.map((d, i) => {
    const x = i * step + step / 2 - bw - 1, hi = inc[i] / max * H, he = exp[i] / max * H;
    return `<g><title>${fmtShort(d)}: ingresos ${money(inc[i])} · gastos ${money(exp[i])}</title>
      <rect x="${x}" y="${H - hi}" width="${bw}" height="${hi}" rx="4" fill="#3a3a3a"/>
      <rect x="${x + bw + 2}" y="${H - he}" width="${bw}" height="${he}" rx="4" fill="#8ab8ec"/>
      <text x="${i * step + step / 2}" y="${H + 18}" text-anchor="middle" font-size="10" fill="#8a8a8a">${new Date(d + 'T00:00:00').getDate()}</text></g>`;
  }).join('');
  const grid = [0.25, 0.5, 0.75, 1].map(f => `<line x1="0" x2="${W}" y1="${H - f * H}" y2="${H - f * H}" stroke="#f0f0f0"/>`).join('');

  const recent = [...state.orders].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 6);

  return `
  <div class="stack">
    <div class="kpis">
      <div class="kpi dark"><div class="muted">Ingresos del mes</div><div class="val num">${money(income)}</div><div class="small muted">${monthOrders.length} órdenes · ${money(pending)} pendiente</div></div>
      <div class="kpi"><div class="muted">Gastos del mes</div><div class="val num">${money(spend)}</div><div class="small muted">Reactivos, insumos y servicios</div></div>
      <div class="kpi"><div class="muted">Utilidad</div><div class="val num" style="color:${income - spend >= 0 ? 'var(--ok)' : 'var(--bad)'}">${money(income - spend)}</div><div class="small muted">Ingresos pagados menos gastos</div></div>
      <div class="kpi"><div class="muted">Citas de hoy</div><div class="val num">${todays.length}</div><div class="small muted">${todays.filter(a => a.status === 'completada').length} completadas</div></div>
    </div>
    <div class="grid2">
      <div class="card"><div class="card-head"><h2>Ventas por categoría</h2><span class="muted small">Este mes</span></div>
        <div class="row" style="gap:20px;align-items:center">
          <svg viewBox="0 0 140 140" width="150" height="150" role="img" aria-label="Ventas por categoría">${donut}
            <text x="70" y="66" text-anchor="middle" font-size="11" fill="#8a8a8a">Total</text>
            <text x="70" y="84" text-anchor="middle" font-size="15" font-weight="700" fill="#1f1f1f">${money(sum === 1 && !cats.length ? 0 : sum).replace('.00', '')}</text></svg>
          <div class="legend grow">${cats.map(([c, v], i) => `<div><i style="background:${COLORS[i % 6]}"></i>${c}<b class="num">${Math.round(v / sum * 100)}%</b></div>`).join('')}</div>
        </div></div>
      <div class="card"><div class="card-head"><h2>Ingresos vs gastos</h2>
        <div class="row small muted"><i style="width:10px;height:10px;border-radius:3px;background:#3a3a3a;display:inline-block"></i>Ingresos <i style="width:10px;height:10px;border-radius:3px;background:#8ab8ec;display:inline-block;margin-left:8px"></i>Gastos · 14 días</div></div>
        <svg viewBox="0 0 ${W} ${H + 24}" width="100%" role="img" aria-label="Ingresos y gastos por día">${grid}${bars}</svg></div>
    </div>
    <div class="grid-even">
      <div class="card"><div class="card-head"><h2>Citas de hoy</h2><a class="btn sm ghost" href="#/agenda">Ver agenda</a></div>
        ${todays.length ? `<table class="tbl"><tbody>${todays.slice(0, 7).map(a => { const p = patient(a.patientId); return `
          <tr class="click" data-go="#/paciente/${p.id}"><td class="num" style="font-weight:700;width:60px">${a.time}</td>
          <td><div class="row"><span class="avatar">${initials(p.name)}</span><div><div style="font-weight:600">${esc(p.name)}</div><div class="muted small">${examNames(a.examIds)}</div></div></div></td>
          <td class="r"><span class="pill ${APPT_PILL[a.status]}">${a.status}</span></td></tr>`; }).join('')}</tbody></table>` : '<div class="empty">Sin citas hoy.</div>'}</div>
      <div class="card"><div class="card-head"><h2>Órdenes recientes</h2><a class="btn sm ghost" href="#/ventas">Ver ventas</a></div>
        <table class="tbl"><tbody>${recent.map(o => { const p = patient(o.patientId); return `
          <tr class="click" data-go="#/paciente/${p.id}"><td><div style="font-weight:600">${esc(p.name)}</div><div class="muted small">${o.id} · ${fmtShort(o.date)} · ${esc(o.items.map(i => i.name).join(', '))}</div></td>
          <td class="r num" style="font-weight:600">${money(o.total)}</td><td class="r"><span class="pill ${STATUS_PILL[o.status]}">${o.status}</span></td></tr>`; }).join('')}</tbody></table></div>
    </div>
  </div>`;
};

function patientTable(q) {
  const n = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const qq = n(q);
  const rows = state.patients.filter(p => !qq || n(p.name).includes(qq) || n(p.dui).includes(qq) || n(p.phone).includes(qq));
  const last = id => state.orders.filter(o => o.patientId === id).map(o => o.date).sort().at(-1);
  const count = id => state.orders.filter(o => o.patientId === id).length;
  return rows.length ? rows.map(p => `
    <tr class="click" data-go="#/paciente/${p.id}"><td><div class="row"><span class="avatar">${initials(p.name)}</span><div><div style="font-weight:600">${esc(p.name)}</div><div class="muted small">${esc(p.email || '')}</div></div></div></td>
    <td class="num">${esc(p.dui || '—')}</td><td class="num">${esc(p.phone || '—')}</td><td class="num">${age(p.birthDate)}</td><td>${p.sex === 'M' ? 'M' : 'F'}</td>
    <td class="num">${last(p.id) ? fmtShort(last(p.id)) : '—'}</td><td class="r num">${count(p.id)}</td></tr>`).join('')
    : `<tr><td colspan="7" class="empty">Sin resultados para “${esc(q)}”.</td></tr>`;
}

V.pacientes = () => `
  <div class="page-head"><div><h1>Pacientes</h1><div class="muted">${state.patients.length} registrados</div></div>
    <div class="row"><input class="input" id="psearch" placeholder="Buscar por nombre, DUI o teléfono" value="${esc(ui.q)}" style="width:280px">
    <button class="btn" data-act="newPatient">${icon('plus')}Nuevo paciente</button></div></div>
  <div class="card"><table class="tbl"><thead><tr><th>Paciente</th><th>DUI</th><th>Teléfono</th><th>Edad</th><th>Sexo</th><th>Última visita</th><th class="r">Órdenes</th></tr></thead>
    <tbody id="ptbody">${patientTable(ui.q)}</tbody></table></div>`;

V.paciente = id => {
  const p = state.patients.find(x => x.id === id);
  if (!p) return '<div class="card empty">Paciente no encontrado.</div>';
  const orders = state.orders.filter(o => o.patientId === id).sort((a, b) => b.date.localeCompare(a.date));
  const appts = state.appointments.filter(a => a.patientId === id && a.date >= today() && a.status !== 'cancelada').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const total = orders.filter(o => o.status !== 'Anulado').reduce((s, o) => s + o.total, 0);
  const field = (k, v) => `<div><div class="muted small">${k}</div><div style="font-weight:600">${esc(v || '—')}</div></div>`;
  return `
  <div class="page-head"><div class="row"><a class="btn ghost icon-btn" href="#/pacientes" aria-label="Volver">${icon('chevL')}</a>
    <span class="avatar dark" style="width:48px;height:48px;font-size:15px">${initials(p.name)}</span>
    <div><h1>${esc(p.name)}</h1><div class="muted">${p.id.toUpperCase()} · ${age(p.birthDate)} años · ${p.sex === 'M' ? 'Masculino' : 'Femenino'}</div></div></div>
    <button class="btn" data-act="newOrder" data-id="${p.id}">${icon('plus')}Nueva orden</button></div>
  <div class="grid2">
    <div class="stack">
      <div class="card"><h2 style="margin-bottom:14px">Datos personales</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">${field('DUI', p.dui)}${field('Nacimiento', p.birthDate)}${field('Teléfono', p.phone)}${field('Correo', p.email)}</div>
        <div style="margin-top:14px">${field('Alergias / notas', p.notes)}</div></div>
      <div class="card"><h2 style="margin-bottom:10px">Próximas citas</h2>
        ${appts.length ? appts.map(a => `<div class="row" style="padding:6px 0"><span class="num" style="font-weight:700">${fmtDay(a.date)} · ${a.time}</span><span class="grow muted small">${examNames(a.examIds)}</span><span class="pill ${APPT_PILL[a.status]}">${a.status}</span></div>`).join('') : '<div class="muted">Sin citas próximas.</div>'}</div>
      <div class="kpi dark"><div class="muted">Total histórico</div><div class="val num">${money(total)}</div><div class="small muted">${orders.length} órdenes</div></div>
    </div>
    <div class="card"><h2 style="margin-bottom:10px">Órdenes y resultados</h2>
      ${orders.length ? orders.map(o => {
        const params = o.results ? orderParams(o, p.sex) : [];
        const bad = params.filter(pr => ['bajo', 'alto'].includes(flag(o.results[pr.key], pr)));
        return `<div style="padding:12px 0;border-bottom:1px solid #f0f0f0">
          <div class="row"><div class="grow"><div style="font-weight:600">${esc(o.items.map(i => i.name).join(', '))}</div><div class="muted small">${o.id} · ${fmtDay(o.date)} · ${money(o.total)} · ${o.payMethod}</div></div>
          ${o.results ? (o.published ? '<span class="pill ok">Publicado</span>' : '<span class="pill warn">Sin publicar</span>') : (o.status === 'Anulado' ? '' : `<a class="btn sm accent" href="#/resultados/${o.id}">Cargar resultados</a>`)}
          <span class="pill ${STATUS_PILL[o.status]}">${o.status}</span></div>
          ${bad.length ? `<div class="row wrap" style="margin-top:8px;gap:6px">${bad.map(pr => `<span class="pill bad plain">${pr.name}: ${o.results[pr.key]} ${pr.unit} (${flag(o.results[pr.key], pr)})</span>`).join('')}</div>` : ''}
          ${o.results ? `<a class="small" href="#/resultados/${o.id}" style="display:inline-block;margin-top:6px;color:#2f6db3">Ver ${params.length} parámetros</a>` : ''}
        </div>`; }).join('') : '<div class="muted">Sin órdenes.</div>'}</div>
  </div>`;
};

V.agenda = () => {
  const d = ui.agendaDate, t = today();
  const slots = slotsFor(d);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const appts = state.appointments.filter(a => a.date === d);
  const booked = appts.filter(a => a.status !== 'cancelada').length;
  return `
  <div class="page-head"><div><h1>Agenda</h1><div class="muted">${fmtDay(d)} · ${booked} citas · capacidad ${CAPACITY} por horario</div></div>
    <div class="row"><button class="btn ghost icon-btn" data-act="day" data-n="-1" aria-label="Día anterior">${icon('chevL')}</button>
      <input type="date" class="input" id="adate" value="${d}" style="width:160px">
      <button class="btn ghost icon-btn" data-act="day" data-n="1" aria-label="Día siguiente">${icon('chevR')}</button>
      <button class="btn ghost" data-act="day" data-n="0">Hoy</button>
      <button class="btn" data-act="newAppt">${icon('plus')}Nueva cita</button></div></div>
  ${slots.length ? `<div class="slots">${slots.map(time => {
    const list = appts.filter(a => a.time === time);
    const load = slotLoad(state, d, time);
    const [h, m] = time.split(':').map(Number);
    const past = d < t || (d === t && h * 60 + m + 30 <= nowMin);
    return `<div class="slot ${past ? 'past' : ''}"><div class="time">${time}</div>
      <div><div class="meter ${load >= CAPACITY ? 'full' : ''}">${Array.from({ length: CAPACITY }, (_, i) => `<i class="${i < load ? 'on' : ''}"></i>`).join('')}</div><div class="muted small">${load}/${CAPACITY}</div></div>
      <div class="appts">${list.map(a => { const p = patient(a.patientId); return `
        <div class="appt ${a.source === 'app' ? 'app' : ''} ${ui.freshAppt.has(a.id) ? 'new' : ''}" style="${a.status === 'cancelada' ? 'opacity:.5' : ''}">
          <span class="avatar">${initials(p.name)}</span>
          <div class="grow"><a href="#/paciente/${p.id}" style="font-weight:600;text-decoration:none">${esc(p.name)}</a><div class="muted small">${examNames(a.examIds)}${a.source === 'app' ? ' · desde la app' : ''}</div></div>
          <select data-appt="${a.id}" class="pill ${APPT_PILL[a.status]}" aria-label="Estado">${APPT_STATES.map(s => `<option ${s === a.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
        </div>`; }).join('')}</div></div>`; }).join('')}</div>`
    : '<div class="card empty">Domingo: el laboratorio está cerrado.</div>'}`;
};

V.catalogo = () => {
  const cats = [...new Set(CATALOG.map(e => e.category))];
  return `
  <div class="page-head"><div><h1>Catálogo de exámenes</h1><div class="muted">${CATALOG.length} exámenes · precios en USD sin IVA, editables</div></div></div>
  <div class="stack">${cats.map(c => `
    <div class="card"><h2 style="margin-bottom:10px">${c}</h2><table class="tbl"><thead><tr><th>Examen</th><th>Preparación</th><th>Entrega</th><th>Parámetros</th><th class="r">Precio</th></tr></thead><tbody>
    ${CATALOG.filter(e => e.category === c).map(e => `<tr><td style="font-weight:600">${e.name}</td><td class="muted small" style="max-width:340px">${e.prep}</td>
      <td class="num">${e.turnaroundH < 24 ? e.turnaroundH + ' h' : e.turnaroundH / 24 + ' d'}</td>
      <td class="small muted">${[...new Set(e.params.map(p => p.name))].join(', ')}</td>
      <td class="r"><input class="input price-in num" type="number" min="0" step="0.5" value="${price(e)}" data-price="${e.id}" aria-label="Precio de ${e.name}"></td></tr>`).join('')}
    </tbody></table></div>`).join('')}</div>`;
};

V.resultados = id => {
  if (id) return resultForm(id);
  const pend = state.orders.filter(o => !o.results && o.status !== 'Anulado').sort((a, b) => b.date.localeCompare(a.date));
  const unpub = state.orders.filter(o => o.results && !o.published).sort((a, b) => b.date.localeCompare(a.date));
  const done = state.orders.filter(o => o.published).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  const list = { pendientes: pend, borradores: unpub, publicados: done }[ui.resTab];
  return `
  <div class="page-head"><div><h1>Resultados</h1><div class="muted">${pend.length} órdenes esperan resultados</div></div>
    <div class="tabs">${[['pendientes', `Pendientes (${pend.length})`], ['borradores', `Sin publicar (${unpub.length})`], ['publicados', 'Publicados']].map(([k, l]) => `<button data-act="resTab" data-k="${k}" class="${ui.resTab === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
  <div class="card">${list.length ? `<table class="tbl"><thead><tr><th>Orden</th><th>Paciente</th><th>Exámenes</th><th>Fecha</th><th></th></tr></thead><tbody>
    ${list.map(o => `<tr class="click" data-go="#/resultados/${o.id}"><td class="num" style="font-weight:600">${o.id}</td><td>${esc(patient(o.patientId).name)}</td>
    <td class="small">${esc(o.items.map(i => i.name).join(', '))}</td><td class="num">${fmtShort(o.date)}</td>
    <td class="r"><span class="btn sm ${ui.resTab === 'pendientes' ? 'accent' : 'ghost'}">${ui.resTab === 'pendientes' ? 'Cargar' : 'Abrir'}</span></td></tr>`).join('')}</tbody></table>`
    : '<div class="empty">Nada por aquí.</div>'}</div>`;
};

function resultForm(id) {
  const o = state.orders.find(x => x.id === id);
  if (!o) return '<div class="card empty">Orden no encontrada.</div>';
  const p = patient(o.patientId);
  const params = orderParams(o, p.sex);
  const r = o.results || {};
  const range = pr => pr.min == null && pr.max == null ? 'Cualitativo' : `${pr.min ?? 0} – ${pr.max} ${pr.unit}`;
  const pill = (pr, v) => { const f = flag(v, pr); return f ? `<span class="pill ${FLAG_PILL[f]}">${f}</span>` : '<span class="muted">—</span>'; };
  return `
  <div class="page-head"><div class="row"><a class="btn ghost icon-btn" href="#/resultados" aria-label="Volver">${icon('chevL')}</a>
    <div><h1>Orden ${o.id}</h1><div class="muted">${esc(p.name)} · ${p.sex === 'M' ? 'M' : 'F'} · ${age(p.birthDate)} años · ${fmtDay(o.date)}</div></div></div>
    ${o.published ? '<span class="pill ok">Publicado al paciente</span>' : ''}</div>
  <form class="card" id="resform" data-id="${o.id}">
    <div class="param-row muted small" style="padding-top:0"><div>Parámetro</div><div>Resultado</div><div>Referencia</div><div>Estado</div></div>
    ${params.map(pr => `<div class="param-row"><div style="font-weight:600">${pr.name}</div>
      <div><input class="input num" name="${pr.key}" value="${esc(r[pr.key] ?? '')}" ${pr.min == null && pr.max == null ? 'list="qual"' : 'inputmode="decimal"'} data-key="${pr.key}" autocomplete="off"></div>
      <div class="muted small">${range(pr)}</div><div data-flag="${pr.key}">${pill(pr, r[pr.key])}</div></div>`).join('')}
    <datalist id="qual"><option>Negativo</option><option>Positivo</option><option>No reactivo</option><option>Reactivo</option><option>No se observan</option><option>Sin crecimiento</option></datalist>
    <div class="row" style="justify-content:flex-end;margin-top:18px">
      <button class="btn ghost" type="submit" name="act" value="save">Guardar borrador</button>
      <button class="btn accent" type="submit" name="act" value="publish">${icon('send')}Publicar al paciente</button></div>
  </form>`;
}

function periodBar(key) {
  return `<div class="row"><label class="field"><span>Desde</span><input type="date" class="input" data-period="${key}" data-k="from" value="${ui[key].from}"></label>
    <label class="field"><span>Hasta</span><input type="date" class="input" data-period="${key}" data-k="to" value="${ui[key].to}"></label></div>`;
}
const inP = (d, { from, to }) => (!from || d >= from) && (!to || d <= to);

V.ventas = () => {
  const list = state.orders.filter(o => inP(o.date, ui.ventas)).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const ok = list.filter(o => o.status !== 'Anulado');
  const tot = k => ok.reduce((s, o) => s + o[k], 0);
  return `
  <div class="page-head"><div><h1>Ventas</h1><div class="muted">${list.length} órdenes · IVA 13% incluido en el total</div></div>${periodBar('ventas')}</div>
  <div class="kpis" style="margin-bottom:14px">
    <div class="kpi dark"><div class="muted">Total</div><div class="val num">${money(tot('total'))}</div></div>
    <div class="kpi"><div class="muted">Subtotal</div><div class="val num">${money(tot('subtotal'))}</div></div>
    <div class="kpi"><div class="muted">IVA</div><div class="val num">${money(tot('iva'))}</div></div>
    <div class="kpi"><div class="muted">Pendiente de cobro</div><div class="val num">${money(ok.filter(o => o.status === 'Pendiente').reduce((s, o) => s + o.total, 0))}</div></div></div>
  <div class="card"><table class="tbl"><thead><tr><th>Fecha</th><th>Orden</th><th>Paciente</th><th>Exámenes</th><th>Pago</th><th class="r">Subtotal</th><th class="r">IVA</th><th class="r">Total</th><th>Estado</th></tr></thead><tbody>
    ${list.slice(0, 300).map(o => `<tr><td class="num">${fmtShort(o.date)}</td><td class="num">${o.id}</td><td>${esc(patient(o.patientId).name)}</td>
    <td class="small">${esc(o.items.map(i => i.name).join(', '))}</td><td class="small">${o.payMethod}</td>
    <td class="r num">${money(o.subtotal)}</td><td class="r num">${money(o.iva)}</td><td class="r num" style="font-weight:600">${money(o.total)}</td>
    <td>${o.status === 'Pendiente' ? `<button class="pill warn" style="border:0;cursor:pointer" data-act="markPaid" data-id="${o.id}" title="Marcar como pagado">Pendiente</button>` : `<span class="pill ${STATUS_PILL[o.status]}">${o.status}</span>`}</td></tr>`).join('')}
  </tbody></table></div>`;
};

V.compras = () => {
  const list = state.purchases.filter(c => inP(c.date, ui.compras)).sort((a, b) => b.date.localeCompare(a.date));
  const byCat = {};
  for (const c of list) byCat[c.category] = (byCat[c.category] || 0) + c.amount;
  const sup = id => state.suppliers.find(s => s.id === id)?.name || '';
  return `
  <div class="page-head"><div><h1>Compras</h1><div class="muted">${list.length} compras · ${money(list.reduce((s, c) => s + c.amount, 0))}</div></div>
    <div class="row" style="align-items:flex-end">${periodBar('compras')}<button class="btn" data-act="newPurchase">${icon('plus')}Registrar compra</button></div></div>
  <div class="kpis" style="margin-bottom:14px">${['Reactivos', 'Insumos', 'Equipo', 'Servicios'].map((c, i) => `<div class="kpi ${i ? '' : 'dark'}"><div class="muted">${c}</div><div class="val num">${money(byCat[c] || 0)}</div></div>`).join('')}</div>
  <div class="card"><table class="tbl"><thead><tr><th>Fecha</th><th>Proveedor</th><th>Categoría</th><th>Descripción</th><th class="r">Monto</th></tr></thead><tbody>
    ${list.map(c => `<tr><td class="num">${fmtShort(c.date)}</td><td>${esc(sup(c.supplierId))}</td><td><span class="pill plain">${c.category}</span></td><td>${esc(c.description)}</td><td class="r num" style="font-weight:600">${money(c.amount)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Sin compras en el periodo.</td></tr>'}
  </tbody></table></div>`;
};

const EXPORTS = {
  ventas: ['Ventas (una fila por orden)', salesRows, ['fecha', 'orden', 'paciente', 'dui', 'examenes', 'subtotal', 'iva', 'total', 'metodo_pago', 'estado']],
  detalle: ['Detalle de ventas (una fila por examen)', salesDetailRows, ['fecha', 'orden', 'paciente', 'dui', 'examen', 'precio', 'estado']],
  compras: ['Compras', purchaseRows, ['fecha', 'compra', 'proveedor', 'categoria', 'descripcion', 'monto']],
  pacientes: ['Pacientes atendidos', patientRows, ['id', 'nombre', 'dui', 'fecha_nacimiento', 'sexo', 'telefono', 'correo', 'notas', 'ordenes', 'total_gastado']],
};

V.exportar = () => `
  <div class="page-head"><div><h1>Exportar</h1><div class="muted">Archivos CSV listos para abrir en Excel (con tildes y ñ)</div></div>${periodBar('exp')}</div>
  <div class="grid-even">${Object.entries(EXPORTS).map(([k, [name, fn]]) => {
    const n = fn(state, ui.exp.from, ui.exp.to).length;
    return `<div class="card row"><div class="ic" style="width:46px;height:46px;border-radius:14px;background:var(--accent-soft);display:grid;place-items:center;color:#2f6db3">${icon('download')}</div>
      <div class="grow"><h3>${name}</h3><div class="muted small">${n} filas · ${fmtShort(ui.exp.from)} – ${fmtShort(ui.exp.to)}</div></div>
      <button class="btn" data-act="export" data-k="${k}" ${n ? '' : 'disabled'}>Descargar CSV</button></div>`; }).join('')}</div>`;

/* ---------- render ---------- */
function render() {
  const { v, id } = route();
  const view = V[v] ? V[v](id) : V.dashboard();
  const el = document.getElementById('view');
  const keepScroll = el.dataset.route === location.hash ? el.scrollTop : 0;
  el.innerHTML = `<div class="view">${view}</div>`;
  if (el.dataset.route === location.hash) el.firstElementChild.style.animation = 'none';
  el.dataset.route = location.hash;
  el.scrollTop = keepScroll;
  renderSide(); renderAside();
}

/* ---------- acciones ---------- */
const actions = {
  reset() {
    if (!confirm('¿Reiniciar el demo? Se borran los cambios y se vuelve a los datos de ejemplo.')) return;
    state = reset(); state.activity = []; commit(); toast('Demo reiniciado');
  },
  applink() {
    const url = appUrl();
    modal(`<div class="card-head"><h2>App del paciente</h2><button type="button" class="btn ghost icon-btn" data-close aria-label="Cerrar">${icon('close')}</button></div>
      <p class="muted" style="margin-top:0">Abra este enlace en el celular. La sala <b>${room.toUpperCase()}</b> conecta la app con este CRM.</p>
      <input class="input num" readonly value="${esc(url)}" onclick="this.select()">
      <div class="modal-foot"><a class="btn ghost" href="${esc(url)}" target="_blank" rel="noopener">Abrir aquí</a>
      <button type="button" class="btn" id="copyurl">${icon('copy')}Copiar enlace</button></div>`, () => {});
    document.getElementById('copyurl').onclick = () => navigator.clipboard?.writeText(url).then(() => toast('Enlace copiado'), () => toast('No se pudo copiar; selecciónelo manualmente'));
  },
  day(btn) { const n = +btn.dataset.n; ui.agendaDate = n ? addDays(ui.agendaDate, n) : today(); render(); },
  resTab(btn) { ui.resTab = btn.dataset.k; render(); },
  markPaid(btn) { const o = state.orders.find(x => x.id === btn.dataset.id); o.status = 'Pagado'; log('crm', 'check', `Orden ${o.id} pagada`, money(o.total)); commit(); },
  export(btn) {
    const [name, fn, cols] = EXPORTS[btn.dataset.k];
    download(`${btn.dataset.k}_${ui.exp.from}_${ui.exp.to}.csv`, toCSV(fn(state, ui.exp.from, ui.exp.to), cols));
    log('crm', 'download', `Exportó ${name.toLowerCase()}`, `${fmtShort(ui.exp.from)} – ${fmtShort(ui.exp.to)}`); commit();
  },
  newPatient() {
    modal(`<div class="card-head"><h2>Nuevo paciente</h2><button type="button" class="btn ghost icon-btn" data-close aria-label="Cerrar">${icon('close')}</button></div>
      <div class="stack"><label class="field"><span>Nombre completo</span><input class="input" name="name" required></label>
      <div class="grid-even"><label class="field"><span>DUI</span><input class="input" name="dui" placeholder="00000000-0"></label>
      <label class="field"><span>Fecha de nacimiento</span><input class="input" type="date" name="birthDate"></label>
      <label class="field"><span>Sexo</span><select class="input" name="sex"><option value="F">Femenino</option><option value="M">Masculino</option></select></label>
      <label class="field"><span>Teléfono</span><input class="input" name="phone" placeholder="7000-0000"></label></div>
      <label class="field"><span>Correo</span><input class="input" type="email" name="email"></label>
      <label class="field"><span>Alergias / notas</span><input class="input" name="notes"></label></div>
      <div class="modal-foot"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn">Guardar</button></div>`, f => {
      const max = state.patients.reduce((m, p) => Math.max(m, parseInt(p.id.slice(1), 10) || 0), 0);
      const p = { id: 'p' + (max + 1), ...Object.fromEntries(['name', 'dui', 'birthDate', 'sex', 'phone', 'email', 'notes'].map(k => [k, String(f.get(k) || '').trim()])) };
      state.patients.push(p);
      log('crm', 'user', `Nuevo paciente: ${p.name}`, p.phone);
      location.hash = `#/paciente/${p.id}`; commit();
    });
  },
  newOrder(btn) {
    const p = patient(btn.dataset.id);
    const bg = modal(`<div class="card-head"><h2>Nueva orden · ${esc(p.name.split(' ').slice(0, 2).join(' '))}</h2><button type="button" class="btn ghost icon-btn" data-close aria-label="Cerrar">${icon('close')}</button></div>
      <div class="checks">${CATALOG.map(e => `<label><input type="checkbox" name="ex" value="${e.id}" data-p="${price(e)}">${e.name}<span class="p num">${money(price(e))}</span></label>`).join('')}</div>
      <div class="row" style="margin-top:14px"><label class="field grow"><span>Método de pago</span><select class="input" name="pay"><option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option></select></label>
      <label class="field grow"><span>Estado</span><select class="input" name="status"><option>Pagado</option><option>Pendiente</option></select></label></div>
      <div class="row" style="margin-top:14px;justify-content:space-between"><div class="muted small" id="ototals">Seleccione exámenes</div><div style="font-size:22px;font-weight:700" class="num" id="ototal">$0.00</div></div>
      <div class="modal-foot"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn" id="osave" disabled>Crear orden</button></div>`, f => {
      const o = createOrder(state, p.id, f.getAll('ex'), f.get('pay'), today());
      o.status = f.get('status');
      log('crm', 'sales', `Orden ${o.id} · ${p.name}`, `${money(o.total)} · ${o.items.map(i => i.name).join(', ')}`);
      commit(); toast(`Orden ${o.id} creada: ${money(o.total)}`);
    });
    bg.addEventListener('change', () => {
      const sub = [...bg.querySelectorAll('input[name=ex]:checked')].reduce((s, i) => s + +i.dataset.p, 0);
      const t = withIVA(sub);
      bg.querySelector('#ototal').textContent = money(t.total);
      bg.querySelector('#ototals').textContent = sub ? `Subtotal ${money(t.subtotal)} + IVA ${money(t.iva)}` : 'Seleccione exámenes';
      bg.querySelector('#osave').disabled = !sub;
    });
  },
  newAppt() {
    const d = ui.agendaDate;
    const free = slotsFor(d).filter(t => slotLoad(state, d, t) < CAPACITY);
    if (!free.length) return toast('No hay horarios libres ese día');
    modal(`<div class="card-head"><h2>Nueva cita · ${fmtDay(d)}</h2><button type="button" class="btn ghost icon-btn" data-close aria-label="Cerrar">${icon('close')}</button></div>
      <div class="stack"><label class="field"><span>Paciente</span><select class="input" name="pid">${[...state.patients].sort((a, b) => a.name.localeCompare(b.name)).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
      <div class="grid-even"><label class="field"><span>Examen</span><select class="input" name="ex">${CATALOG.map(e => `<option value="${e.id}">${e.name}</option>`).join('')}</select></label>
      <label class="field"><span>Hora</span><select class="input" name="time">${free.map(t => `<option>${t}</option>`).join('')}</select></label></div></div>
      <div class="modal-foot"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn">Agendar</button></div>`, f => {
      const r = bookAppointment(state, { patientId: f.get('pid'), date: d, time: f.get('time'), examIds: [f.get('ex')] });
      if (!r.ok) { toast(r.error); return false; }
      r.appt.status = 'confirmada';
      ui.freshAppt.add(r.appt.id);
      log('crm', 'calendar', `Cita para ${patient(r.appt.patientId).name}`, `${fmtDay(d)} · ${r.appt.time}`);
      commit();
    });
  },
  newPurchase() {
    modal(`<div class="card-head"><h2>Registrar compra</h2><button type="button" class="btn ghost icon-btn" data-close aria-label="Cerrar">${icon('close')}</button></div>
      <div class="stack"><label class="field"><span>Proveedor</span><select class="input" name="sup">${state.suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
      <div class="grid-even"><label class="field"><span>Categoría</span><select class="input" name="cat"><option>Reactivos</option><option>Insumos</option><option>Equipo</option><option>Servicios</option></select></label>
      <label class="field"><span>Fecha</span><input class="input" type="date" name="date" value="${today()}" required></label></div>
      <label class="field"><span>Descripción</span><input class="input" name="desc" required placeholder="Ej. Reactivos de química clínica"></label>
      <label class="field"><span>Monto (USD)</span><input class="input num" type="number" name="amount" min="0.01" step="0.01" required></label></div>
      <div class="modal-foot"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn">Guardar</button></div>`, f => {
      const c = { id: 'c' + (state.purchases.length + 1), date: f.get('date'), supplierId: f.get('sup'), category: f.get('cat'), description: String(f.get('desc')).trim(), amount: Math.round(+f.get('amount') * 100) / 100 };
      state.purchases.push(c);
      log('crm', 'cart', `Compra: ${c.description}`, money(c.amount)); commit();
    });
  },
};

document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]');
  if (a && actions[a.dataset.act]) { e.preventDefault(); actions[a.dataset.act](a); return; }
  const go = e.target.closest('[data-go]');
  if (go && !e.target.closest('a, button, select, input')) location.hash = go.dataset.go;
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'gsearch' || t.id === 'psearch') {
    ui.q = t.value;
    if (route().v !== 'pacientes') { location.hash = '#/pacientes'; return; }
    document.getElementById('ptbody').innerHTML = patientTable(ui.q);
    const other = document.getElementById(t.id === 'gsearch' ? 'psearch' : 'gsearch');
    if (other) other.value = ui.q;
  }
  if (t.dataset.key) {
    const o = state.orders.find(x => x.id === t.form.dataset.id);
    const pr = orderParams(o, patient(o.patientId).sex).find(p => p.key === t.dataset.key);
    const f = flag(t.value, pr);
    document.querySelector(`[data-flag="${t.dataset.key}"]`).innerHTML = f ? `<span class="pill ${FLAG_PILL[f]}">${f}</span>` : '<span class="muted">—</span>';
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'adate' && t.value) { ui.agendaDate = t.value; render(); }
  if (t.dataset.appt) {
    const a = state.appointments.find(x => x.id === t.dataset.appt);
    a.status = t.value;
    log('crm', 'calendar', `${patient(a.patientId).name}: ${a.status}`, `${fmtDay(a.date)} · ${a.time}`); commit();
  }
  if (t.dataset.price) {
    const v = Math.round(+t.value * 100) / 100;
    if (!(v >= 0)) { t.value = price(examById(t.dataset.price)); return; }
    state.catalogPrices[t.dataset.price] = v;
    log('crm', 'flask', `Precio actualizado: ${examById(t.dataset.price).name}`, money(v)); commit(); toast('Precio actualizado');
  }
  if (t.dataset.period) { ui[t.dataset.period][t.dataset.k] = t.value; render(); }
});

document.addEventListener('submit', e => {
  if (e.target.id !== 'resform') return;
  e.preventDefault();
  const o = state.orders.find(x => x.id === e.target.dataset.id);
  const f = new FormData(e.target);
  const res = {};
  for (const [k, v] of f) { if (k === 'act') continue; const s = String(v).trim(); if (s) res[k] = /^-?\d+([.,]\d+)?$/.test(s) ? Number(s.replace(',', '.')) : s; }
  if (!Object.keys(res).length) return toast('Ingrese al menos un valor');
  o.results = res;
  const publish = e.submitter?.value === 'publish';
  if (publish) o.published = true;
  log('crm', 'results', publish ? `Resultados publicados · ${o.id}` : `Borrador guardado · ${o.id}`, patient(o.patientId).name);
  commit();
  toast(publish ? 'Resultados enviados a la app del paciente' : 'Borrador guardado');
});

window.addEventListener('hashchange', render);
// Otra pestaña del CRM cambió los datos.
window.addEventListener('storage', e => { if (e.key === 'demolab:v1' && e.newValue) { state = JSON.parse(e.newValue); state.activity ||= []; render(); } });
setInterval(renderAside, 30000);

renderTop();
commit();
