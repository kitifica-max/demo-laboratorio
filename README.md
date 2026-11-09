# Demo Laboratorio

CRM para el laboratorio (laptop) + app del paciente (celular), sincronizados en vivo. Sin backend: todo corre en el navegador. Datos ficticios.

## Correr en la computadora

```bash
python3 -m http.server 8080
```

Abrir http://localhost:8080 → **CRM del laboratorio**. Botón **App paciente** (arriba) da el enlace de la app con el código de sala.

Tests de la lógica:

```bash
npm test
```

## Publicar en GitHub Pages (para usar el celular)

1. Crear repositorio en GitHub y subir esta carpeta.
2. Settings → Pages → Source: rama `main`, carpeta `/ (root)`.
3. Abrir `https://<usuario>.github.io/<repo>/crm.html` en la laptop.
4. En el CRM: **App paciente** → copiar enlace → abrirlo en el celular (mandarlo por WhatsApp sirve).
5. En el celular: menú del navegador → "Agregar a pantalla de inicio" para instalarla como app.

La sincronización usa un broker MQTT público (HiveMQ) solo como relay. El código de sala separa este demo de otros usuarios. Sin internet, cada app funciona sola y muestra "Sin conexión".

## Guion del demo (5 minutos)

1. **CRM, Panel:** ingresos, gastos y utilidad del mes; citas de hoy; ventas por categoría.
2. **Celular, App:** entrar como *María José Hernández Menjívar* (primera de la lista).
3. **Asistente:** tocar el micrófono y decir *"quiero un hemograma mañana a las 8"*, luego *"sí"*. (También se puede escribir.)
4. **CRM:** la cita aparece al instante en *Actividad* y en *Agenda* (resaltada, "desde la app").
5. **App, Resultados:** abrir el hemograma con *hemoglobina baja* → "Pregúntale a la IA" → tocar la sugerencia. La respuesta explica y termina con el aviso médico.
6. **CRM, Resultados:** cargar valores a una orden pendiente → **Publicar al paciente** → aparece en la app.
7. **CRM, Exportar:** descargar *Ventas* del mes en CSV → abre en Excel con tildes y ñ.

Antes de presentar: botón **Reiniciar demo** (abajo en la barra lateral del CRM) para volver a los datos de ejemplo.

## Notas

- Voz: funciona mejor en Chrome (Android/escritorio). En iPhone/Safari el dictado puede no estar disponible; el chat por texto hace lo mismo.
- Agenda: lun–vie 6:30–16:00, sáb 7:00–12:00, turnos de 30 min, 2 personas por turno.
- Precios en USD; IVA 13% sobre subtotal.
- Rangos de referencia aproximados, solo para demostración. La IA es simulada por reglas, no da diagnósticos.
