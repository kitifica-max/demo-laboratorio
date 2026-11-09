// Sincronización CRM ↔ app paciente: MQTT público (entre dispositivos) + BroadcastChannel (misma máquina).
// CRM = fuente de verdad: publica snapshot retenido y responde solicitudes. App = envía solicitudes.
const BROKER = 'wss://broker.hivemq.com:8884/mqtt';
const MQTT_URL = 'https://unpkg.com/mqtt@5.10.1/dist/mqtt.esm.js';
const TIMEOUT_MS = 8000;

const rid = (n = 8) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');

// Sala: ?sala= en URL > localStorage > nueva (solo CRM). En minúsculas, sin caracteres raros.
export function getRoom(role) {
  const clean = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
  let room = clean(new URLSearchParams(location.search).get('sala'));
  try { room ||= clean(localStorage.getItem('demolab:sala')); } catch { /* sin storage */ }
  if (!room && role === 'crm') room = rid(4);
  try { if (room) localStorage.setItem('demolab:sala', room); } catch { /* sin storage */ }
  return room;
}

export function connect(room, role, { onSnapshot, onRequest, onStatus } = {}) {
  const base = `demolab/${room}`;
  const T = { snap: `${base}/snapshot`, req: `${base}/requests`, reply: id => `${base}/reply/${id}` };
  const pending = new Map(); // reqId -> {resolve, reject, timer}
  const seen = new Set();    // reqIds ya atendidos (llegan por MQTT y BroadcastChannel)
  let client = null, lastSnap = null, mqttUp = false;

  const bc = 'BroadcastChannel' in globalThis ? new BroadcastChannel('demolab-' + room) : null;
  const status = () => onStatus?.(mqttUp ? 'online' : bc ? 'local' : 'offline');

  function settle(reply) {
    const p = pending.get(reply.reqId);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(reply.reqId);
    p.resolve(reply);
  }

  async function handleRequest(req) {
    if (!req?.id || seen.has(req.id)) return;
    seen.add(req.id);
    let reply;
    try { reply = { ok: true, ...(await onRequest?.(req)) }; } catch (e) { reply = { ok: false, error: String(e?.message || e) }; }
    reply.reqId = req.id;
    bc?.postMessage({ type: 'reply', reply });
    client?.publish(T.reply(req.id), JSON.stringify(reply), { qos: 1 });
  }

  function onMsg(m) {
    if (m.type === 'snapshot' && role === 'app') { lastSnap = m.snap; onSnapshot?.(m.snap); }
    else if (m.type === 'request' && role === 'crm') handleRequest(m.req);
    else if (m.type === 'reply' && role === 'app') settle(m.reply);
    else if (m.type === 'hello' && role === 'crm' && lastSnap) bc.postMessage({ type: 'snapshot', snap: lastSnap });
  }
  if (bc) bc.onmessage = e => onMsg(e.data);
  if (role === 'app') bc?.postMessage({ type: 'hello' });
  queueMicrotask(status); // tras devolver el objeto: el llamador ya terminó de inicializar

  // MQTT en segundo plano: si falla (sin internet, CDN o broker caído) la app sigue en modo local.
  (async () => {
    try {
      const mod = await import(MQTT_URL);
      const mqtt = mod.connect ? mod : mod.default;
      client = mqtt.connect(BROKER, { clientId: `demolab_${role}_${rid()}`, reconnectPeriod: 4000, connectTimeout: 8000, clean: true });
      client.on('connect', () => {
        mqttUp = true; status();
        client.subscribe(role === 'crm' ? T.req : [T.snap, `${base}/reply/+`], { qos: 1 });
        if (role === 'crm' && lastSnap) client.publish(T.snap, JSON.stringify(lastSnap), { qos: 1, retain: true });
      });
      for (const ev of ['close', 'offline', 'error']) client.on(ev, () => { if (mqttUp) { mqttUp = false; status(); } });
      client.on('message', (topic, buf) => {
        let data;
        try { data = JSON.parse(buf.toString()); } catch { return; }
        if (topic === T.snap) onMsg({ type: 'snapshot', snap: data });
        else if (topic === T.req) onMsg({ type: 'request', req: data });
        else if (topic.startsWith(`${base}/reply/`)) onMsg({ type: 'reply', reply: data });
      });
    } catch (e) {
      console.warn('MQTT no disponible, modo local:', e?.message || e);
      status();
    }
  })();

  return {
    publishSnapshot(snap) {
      lastSnap = snap;
      bc?.postMessage({ type: 'snapshot', snap });
      if (mqttUp) client.publish(T.snap, JSON.stringify(snap), { qos: 1, retain: true });
    },
    // Envía solicitud al CRM; resuelve con la respuesta o {ok:false} si no contesta a tiempo.
    sendRequest(req) {
      const full = { ...req, id: req.id || rid(10) };
      return new Promise(resolve => {
        const timer = setTimeout(() => { pending.delete(full.id); resolve({ ok: false, reqId: full.id, error: 'El laboratorio no respondió. Intente de nuevo.' }); }, TIMEOUT_MS);
        pending.set(full.id, { resolve, timer });
        bc?.postMessage({ type: 'request', req: full });
        if (mqttUp) client.publish(T.req, JSON.stringify(full), { qos: 1 });
      });
    },
    get snapshot() { return lastSnap; },
  };
}
