# Demo Laboratorio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CRM de laboratorio (laptop) + web app paciente PWA (celular) sincronizados en vivo, sin backend propio.

**Architecture:** Sitio estático (GitHub Pages). Lógica pura en ES modules bajo `shared/` (probada con `node --test`). CRM en laptop guarda todo en `localStorage` y es fuente de verdad; publica snapshot retenido por MQTT; app paciente publica solicitudes de cita. UI en JS puro con render por vista.

**Tech Stack:** HTML/CSS/JS (ES modules), `mqtt@5.10.1` por CDN (unpkg), Web Speech API, SVG propio para gráficas, `node --test` para lógica.

**Spec:** `docs/superpowers/specs/2026-11-09-crm-laboratorio-design.md`

## Global Constraints

- Español en toda la UI. Moneda USD, formato `$1,234.50`. IVA 13% sobre subtotal.
- Marca: "Demo Laboratorio".
- Paleta (de referencia): sidebar/dark `#3a3a3a`, fondo `#ececec`, tarjetas `#ffffff`, acento `#8ab8ec`, texto `#1f1f1f`, gris texto `#8a8a8a`, éxito `#d6ecd2`/`#2e7d32`, proceso `#e6e6e6`, fallo `#f8d7d7`/`#c62828`. Radios grandes (20–28px), sombras casi nulas.
- **Sin AI slop:** nada de gradientes morados/neón, glassmorphism, emojis como íconos, ilustraciones genéricas, sombras grandes difusas, "✨". Íconos SVG de línea simples inline. Tipografía: `Plus Jakarta Sans` (Google Fonts), fallback system-ui. Densidad y jerarquía como la referencia.
- Sin dependencias instaladas; único script externo: mqtt.js versión fija.
- Datos ficticios. Rangos de referencia aproximados; cada respuesta IA termina con "Esto no sustituye una consulta médica."
- CSV: UTF-8 con BOM, separador coma, comillas dobles escapadas.
- Horario: lun–vie 6:30–16:00, sáb 7:00–12:00, slots de 30 min, capacidad 2 por slot.

## Review Focus

1. Broker caído o sin internet → apps cargan igual, indicador "Sin conexión", agenda local sigue. (Task 3 test manual + `sync.js` try/catch)
2. Dos solicitudes al mismo slot lleno → CRM rechaza la segunda y la app informa "Ese horario se llenó". (Task 1 `canBook` test)
3. Navegador sin Web Speech (Firefox/iOS antiguo) → botón micrófono oculto, chat texto funciona. (Task 2 parser test cubre texto)
4. Valor de resultado vacío o no numérico → no se marca alto/bajo, se muestra "—". (Task 1 `flag` test)
5. Nombres con comas, comillas, tildes en CSV → se abren bien en Excel. (Task 1 `toCSV` test)

---

## File Structure

```
index.html            portada: enlaces a CRM y App paciente + código de sala
crm.html  crm.js      CRM (vistas: dashboard, pacientes, agenda, catálogo, resultados, ventas, compras, exportar)
app.html  app.js      PWA paciente (login, inicio, agendar, asistente, resultados, perfil)
manifest.json sw.js icon.svg
shared/styles.css     tokens + componentes comunes
shared/catalog.js     catálogo de exámenes con parámetros y rangos
shared/core.js        store, seed, dinero, flag, slots, ventas, csv
shared/ai.js          explicación de resultados + parser del asistente
shared/sync.js        MQTT + BroadcastChannel
shared/icons.js       íconos SVG inline
tests/core.test.mjs  tests/ai.test.mjs
README.md             cómo correr y publicar en GitHub Pages
```

### Task 1: Núcleo de datos

**Files:** Create `shared/catalog.js`, `shared/core.js`, `tests/core.test.mjs`; `git init`.

**Interfaces – Produces:**
- `CATALOG: Exam[]` — `{id, name, category, price, prep, turnaroundH, params:[{key,name,unit,min,max,sex?}]}`. Categorías: Hematología, Química, Orina y heces, Hormonas, Infecciosas, Paquetes (lista del spec).
- `money(n): string`, `withIVA(subtotal): {subtotal, iva, total}` redondeado a centavos.
- `flag(value, param): 'bajo'|'normal'|'alto'|null`.
- `slotsFor(dateISO): string[]` ("HH:MM"), `slotLoad(state, dateISO, time): number`, `canBook(state, dateISO, time): boolean`.
- `seed(now: Date): State` — determinista (PRNG con semilla fija). State: `{patients[], appointments[], orders[], purchases[], suppliers[], catalogPrices{}}`. ~40 pacientes, 60 días de órdenes/compras, citas de hoy y próximos 7 días.
- `load(): State`, `save(state)`, `reset()` — clave `demolab:v1`.
- `createOrder(state, patientId, examIds, payMethod): Order`, `bookAppointment(state, req): {ok, appt?, error?}`.
- `toCSV(rows: object[], columns: string[]): string` con BOM.
- `salesRows/salesDetailRows/purchaseRows/patientRows(state, from, to)`.

- [ ] Step 1: tests en `tests/core.test.mjs`:
  - `withIVA(100)` → `{subtotal:100, iva:13, total:113}`; `withIVA(10.05).total === 11.36`.
  - `flag(11, {min:12,max:16})==='bajo'`, `flag(14,...)==='normal'`, `flag(17,...)==='alto'`, `flag('', ...)===null`, `flag('abc',...)===null`.
  - `slotsFor('2026-11-09')` (lunes) empieza `'06:30'`, termina `'15:30'`; domingo → `[]`.
  - `canBook` false cuando slotLoad===2; `bookAppointment` sobre slot lleno → `{ok:false, error:'Ese horario se llenó'}`.
  - `toCSV([{a:'Peña, "J"'}],['a'])` === `'﻿a\r\n"Peña, ""J"""'`.
  - `seed(new Date('2026-11-09'))` dos veces → JSON igual; ≥40 pacientes.
- [ ] Step 2: `node --test tests/` → FAIL.
- [ ] Step 3: implementar.
- [ ] Step 4: `node --test tests/` → PASS.
- [ ] Step 5: commit `feat: núcleo de datos del laboratorio`.

### Task 2: IA simulada y parser del asistente

**Files:** Create `shared/ai.js`, `tests/ai.test.mjs`.

**Interfaces – Consumes:** `CATALOG`, `flag`, `slotsFor`. **Produces:**
- `explainResult(order, question): string` — por parámetro: qué mide, qué puede significar bajo/alto/normal, recomendación genérica (repetir, consultar médico). Detecta en la pregunta el parámetro mencionado (por nombre/sinónimo: "hemoglobina", "azúcar"→glucosa, "colesterol"); sin mención → resumen de los fuera de rango. Siempre termina con aviso.
- `parseIntent(text, today: Date): {exams?: string[], date?: 'YYYY-MM-DD', time?: 'HH:MM'}` — reconoce nombres/sinónimos de exámenes, "hoy", "mañana", "pasado mañana", días de semana ("el viernes"), "a las 8", "8 y media", "7:30", "de la mañana/tarde".
- `assistantStep(ctx, text, state, today): {reply: string, ctx, done?: Appointment request}` — máquina: pedir examen → fecha → hora (sugiere 3 libres más cercanas) → confirmar ("sí").

- [ ] Step 1: tests: `parseIntent('quiero un hemograma mañana a las 8', lunes 2026-11-09)` → `{exams:['hemograma'], date:'2026-11-10', time:'08:00'}`; `'glucosa el viernes 7 y media'` → date `'2026-11-13'`, time `'07:30'`; `explainResult` con hemoglobina 10.5 y pregunta "¿qué significa hemoglobina baja?" contiene `'anemia'` y `'no sustituye una consulta médica'`; flujo `assistantStep` de 4 turnos produce `done` con slot válido.
- [ ] Step 2: run → FAIL. Step 3: implementar. Step 4: run → PASS. Step 5: commit `feat: asistente e IA simulada`.

### Task 3: Sincronización

**Files:** Create `shared/sync.js`.

**Interfaces – Produces:** `connect(room: string, role: 'crm'|'app', handlers:{onSnapshot?, onRequest?, onStatus?}): {publishSnapshot(snap), sendRequest(req)}`.
- Tópicos `demolab/<room>/snapshot` (retained, QoS 1) y `demolab/<room>/requests`; respuestas `demolab/<room>/reply/<reqId>`.
- Broker `wss://broker.hivemq.com:8884/mqtt`. Import dinámico `https://unpkg.com/mqtt@5.10.1/dist/mqtt.esm.js` dentro de try/catch; falla → `onStatus('offline')`.
- También `BroadcastChannel('demolab-'+room)` para misma máquina.
- `room` desde `?sala=` o `localStorage`; CRM genera 4 caracteres si no hay.
- Snapshot del CRM: slots ocupados próximos 14 días, pacientes (id, nombre, datos perfil), órdenes con resultados **publicados**, catálogo con precios.

- [ ] Step 1: página temporal de prueba manual: dos pestañas, una `crm` una `app`, request → reply recibido en <2 s; desconectar red → estado `offline` sin error en consola.
- [ ] Step 2: commit `feat: sincronización en vivo`.

### Task 4: CRM

**Files:** Create `crm.html`, `crm.js`, `shared/styles.css`, `shared/icons.js`, `index.html`. Invocar skill `frontend-design` antes de escribir CSS.

**Interfaces – Consumes:** todo `core.js`, `connect`. Layout de referencia: sidebar oscuro de íconos a la izquierda, contenido en panel gris claro redondeado, header con saludo + buscador + "Mi cuenta", columna derecha de "Actividad".

Vistas (hash routing `#/dashboard` etc.):
- **Dashboard:** KPIs (ingresos mes, gastos mes, utilidad, citas hoy), dona SVG ventas por categoría, barras SVG ingresos vs gastos últimos 14 días, "Citas de hoy", "Órdenes recientes" con pills Pagado/Pendiente/Anulado, actividad en vivo a la derecha (solicitudes entrantes desde la app resaltadas).
- **Pacientes:** tabla + búsqueda; ficha con datos, órdenes, resultados; botón "Nueva orden".
- **Agenda:** día con columnas de slots, ocupación 0/2, cambiar estado; nueva cita aparece con animación corta.
- **Catálogo:** tabla editable de precios por categoría.
- **Resultados:** órdenes pendientes → formulario por parámetro con flag en vivo → "Publicar al paciente".
- **Ventas / Compras:** tablas con filtro de fechas, alta de compra (proveedor, categoría, monto).
- **Exportar:** rango de fechas + 4 botones CSV (ventas, detalle ventas, compras, pacientes).
- Indicador sala + estado conexión + URL de la app paciente con `?sala=`. Botón "Reiniciar demo".

- [ ] Step 1: abrir `crm.html` vía `python3 -m http.server 8080`; cada vista renderiza sin errores en consola.
- [ ] Step 2: crear orden → aparece en ventas y dashboard; cargar resultado y publicar → snapshot publicado.
- [ ] Step 3: exportar CSV → archivo descargado con BOM.
- [ ] Step 4: commit `feat: CRM`.

### Task 5: App paciente (PWA)

**Files:** Create `app.html`, `app.js`, `manifest.json`, `sw.js`, `icon.svg`.

**Interfaces – Consumes:** `connect`, `assistantStep`, `explainResult`, `CATALOG`, `slotsFor`, `withIVA`, `money`.
- Mobile-first, barra inferior: Inicio, Agendar, Asistente, Resultados, Perfil.
- Login: elegir paciente demo (lista del snapshot) o registro nombre+teléfono (viaja como request `register`).
- Agendar: elegir exámenes (muestra preparación y total con IVA), fecha, grilla de slots libre/ocupado en vivo, confirmar → request `book` → espera reply.
- Asistente: chat + botón mic (`webkitSpeechRecognition`, `es-SV`→fallback `es-ES`), respuesta hablada con `speechSynthesis`. Oculta mic si no hay soporte.
- Resultados: lista; detalle con barra de rango por parámetro; "Pregúntale a la IA" chat con `explainResult`.
- `sw.js` cachea shell (network-first para html). Manifest con nombre "Demo Laboratorio", theme `#3a3a3a`.

- [ ] Step 1: en laptop dos pestañas: agendar en app → aparece en CRM agenda; slot lleno se ve ocupado.
- [ ] Step 2: asistente por texto completa reserva; mic visible en Chrome.
- [ ] Step 3: resultado publicado en CRM aparece en app; pregunta a IA responde.
- [ ] Step 4: commit `feat: app paciente PWA`.

### Task 6: Verificación y despliegue

**Files:** Create `README.md`.

- [ ] Step 1: `node --test tests/` PASS.
- [ ] Step 2: guion completo del demo en navegador (viewport móvil para app), screenshots, consola sin errores.
- [ ] Step 3: README: correr local, subir a GitHub Pages, abrir CRM, escanear/abrir URL de app en celular, guion de presentación.
- [ ] Step 4: commit `docs: README y guion de demo`.
