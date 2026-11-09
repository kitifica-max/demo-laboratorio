# Demo Laboratorio — CRM + Web App Paciente (diseño)

Fecha: 2026-11-09

## Intención y por qué

Demo para presentar a Jess (dueña de un laboratorio clínico en El Salvador) y su esposo. Dolor principal hoy: **organizar la información de cada paciente y sus resultados**. El demo debe convencerlos de que un sistema propio resuelve eso y además les ordena agenda, ventas, compras y contabilidad.

Momento clave del demo (apuesta, no confirmado por usuario):
1. Pestaña A: paciente usa asistente de voz en la web app y agenda cita.
2. Pestaña B: CRM muestra la cita aparecer en vivo.
3. Paciente abre resultado (p. ej. hemograma) y pregunta a la IA "¿qué significa hemoglobina baja?".
4. Jess descarga CSV de ventas del mes para facturar.

## Alcance

Dos aplicaciones front-end sin backend, misma carpeta, comparten datos:

### A. CRM (personal del laboratorio)
1. **Dashboard:** ingresos, gastos, utilidad, citas de hoy, exámenes más vendidos, gráficas (ingresos vs gastos por día/mes, distribución por categoría).
2. **Pacientes:** listado con búsqueda; perfil con datos personales (nombre, DUI, fecha nacimiento, sexo, teléfono, correo, alergias/notas), historial de órdenes y resultados.
3. **Agenda:** vista día/semana, slots ocupados/libres, actualización en vivo; crear/cancelar/cambiar estado de cita (pendiente, confirmada, muestra tomada, completada, cancelada).
4. **Catálogo de exámenes:** nombre, categoría, precio USD, requisitos de preparación (ayuno, etc.), tiempo de entrega, parámetros con rangos de referencia. Precios editables.
5. **Resultados:** cargar valores de parámetros a una orden; marca automática alto/bajo/normal según rango de referencia; publicar al paciente.
6. **Ventas:** cada orden = venta (paciente, exámenes, subtotal, IVA 13%, total, método de pago, estado pagado/pendiente).
7. **Compras:** reactivos/insumos, proveedor, fecha, monto, categoría.
8. **Exportar CSV:** ventas, compras, pacientes; filtro por rango de fechas.

### B. Web app paciente (PWA instalable)
1. Login simulado (elegir paciente demo o registrarse con nombre/teléfono).
2. Perfil propio.
3. Agendar cita: elegir exámenes, ver agenda en vivo (libres/ocupados), elegir slot. Muestra indicaciones de preparación.
4. Asistente virtual con voz: conversación guiada (qué examen, qué día, qué hora) usando reconocimiento y síntesis de voz del navegador; también acepta texto.
5. Mis resultados: lista y detalle con valores, rangos y semáforo.
6. "Pregúntale a la IA" sobre un resultado: respuestas simuladas generadas por reglas según parámetro y si está alto/bajo/normal, con aviso "no sustituye consulta médica".

## Catálogo base de exámenes (más comunes)

Hematología: Hemograma completo, Tipeo sanguíneo y Rh, VSG, Tiempos de coagulación (TP/TPT).
Química: Glucosa en ayunas, HbA1c, Perfil lipídico, Creatinina, Ácido úrico, Perfil hepático (TGO/TGP), Nitrógeno ureico.
Uroanálisis/Heces: Examen general de orina, Examen general de heces, Urocultivo.
Hormonas: Perfil tiroideo (TSH, T4L), PSA, Prueba de embarazo (β-hCG).
Inmunología/Infecciosas: VIH, VDRL, PCR, Antígeno/Prueba COVID, Dengue NS1.
Paquetes: Chequeo general, Prenatal.

Precios simulados USD, rangos de referencia aproximados (demo, no clínicos).

## Decisiones de cómo se hace (mis llamadas)

- HTML + CSS + JS puro, sin build ni dependencias instaladas. Gráficas en SVG propio (sin CDN), para que funcione sin internet.
- Voz depende de internet en Chrome; chat por texto siempre visible como camino igual de completo.
- CSV: UTF-8 con BOM (acentos en Excel), separador coma, ventas en dos archivos (una fila por orden + detalle una fila por examen).
- Datos: `localStorage` con semilla inicial (≈40 pacientes, 2 meses de ventas/compras/citas). Botón "Reiniciar demo".
- **Presentación (decidido por usuario):** paciente en celular, CRM en laptop.
- **Hosting (decidido por usuario):** GitHub Pages (HTTPS). Usuario sube la carpeta.
- **Tiempo real entre dispositivos (decidido por usuario, opción A):** broker MQTT público vía WSS (p. ej. HiveMQ público), cliente `mqtt.js` por CDN versión fija. Laptop/CRM = fuente de verdad en `localStorage`; publica estado (slots ocupados, pacientes, resultados publicados) como mensaje retenido; celular publica solicitudes de cita. Tópicos con código de sala aleatorio (en URL) para no chocar con otros usuarios del broker. Datos 100% ficticios.
- Respaldo: misma máquina sincroniza por `BroadcastChannel`/`storage`; indicador "Conectado / Sin conexión"; si el broker falla cada app funciona sola.
- PWA: `manifest.json` + service worker mínimo (cachea archivos de la app).
- Voz: Web Speech API (mejor en Chrome). Si no hay soporte, chat por texto.
- IA: simulada, sin API keys.
- Idioma español, moneda USD, IVA 13%.
- Marca: "Demo Laboratorio". Estilo de la referencia: sidebar gris oscuro (#3a3a3a), fondo gris claro, tarjetas blancas muy redondeadas, acento azul claro (#8ab8ec), negro para contraste, tipografía sans geométrica.
- CRM pensado para escritorio/tablet; web app paciente mobile-first.

## No-objetivos

- Backend propio, autenticación real, multiusuario real (el broker público es solo un relay de mensajes).
- Facturación electrónica (DTE) real; solo CSV exportable.
- IA real o diagnóstico médico.
- Inventario detallado de reactivos (compras solo como gasto).

## Anti-objetivos

- Que parezca plantilla genérica o se rompa en la presentación.
- Que la IA dé consejos que suenen a diagnóstico definitivo.

## Para el builder

Estructura de archivos, diseño de componentes, contenido exacto de la semilla, textos de la IA simulada.
