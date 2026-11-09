// Catálogo base. Precios simulados en USD; rangos de referencia aproximados (demo, no clínicos).
const p = (key, name, unit, min, max, sex) => (sex ? { key, name, unit, min, max, sex } : { key, name, unit, min, max });
// Parámetro cualitativo (sin rango numérico).
const q = (key, name) => ({ key, name, unit: '', min: null, max: null });
const e = (id, name, category, price, prep, turnaroundH, params) => ({ id, name, category, price, prep, turnaroundH, params });

const HEMOGRAMA = [
  p('hemoglobina', 'Hemoglobina', 'g/dL', 12, 16, 'F'),
  p('hemoglobina', 'Hemoglobina', 'g/dL', 13.5, 17.5, 'M'),
  p('hematocrito', 'Hematocrito', '%', 36, 46, 'F'),
  p('hematocrito', 'Hematocrito', '%', 41, 53, 'M'),
  p('leucocitos', 'Leucocitos', '10³/µL', 4.5, 11),
  p('plaquetas', 'Plaquetas', '10³/µL', 150, 400),
];

export const CATALOG = [
  // Hematología
  e('hemograma', 'Hemograma completo', 'Hematología', 8, 'No requiere ayuno.', 4, HEMOGRAMA),
  e('tipeo', 'Tipeo sanguíneo y Rh', 'Hematología', 5, 'No requiere ayuno.', 2, [q('grupo', 'Grupo sanguíneo'), q('rh', 'Factor Rh')]),
  e('vsg', 'VSG', 'Hematología', 4, 'No requiere ayuno.', 3, [p('vsg', 'Velocidad de sedimentación', 'mm/h', 0, 20)]),
  e('coagulacion', 'Tiempos de coagulación (TP/TPT)', 'Hematología', 12, 'No requiere ayuno. Informar si toma anticoagulantes.', 4, [
    p('tp', 'Tiempo de protrombina', 's', 11, 13.5), p('tpt', 'Tiempo parcial de tromboplastina', 's', 25, 35)]),
  // Química
  e('glucosa', 'Glucosa en ayunas', 'Química', 4, 'Ayuno de 8 a 12 horas.', 2, [p('glucosa', 'Glucosa', 'mg/dL', 70, 100)]),
  e('hba1c', 'HbA1c', 'Química', 18, 'No requiere ayuno.', 24, [p('hba1c', 'Hemoglobina glicosilada', '%', 4, 5.6)]),
  e('lipidos', 'Perfil lipídico', 'Química', 14, 'Ayuno de 12 horas. Evitar alcohol 24 horas antes.', 4, [
    p('colesterol', 'Colesterol total', 'mg/dL', 0, 200), p('hdl', 'Colesterol HDL', 'mg/dL', 40, 100),
    p('ldl', 'Colesterol LDL', 'mg/dL', 0, 130), p('trigliceridos', 'Triglicéridos', 'mg/dL', 0, 150)]),
  e('creatinina', 'Creatinina', 'Química', 5, 'Ayuno de 8 horas.', 3, [
    p('creatinina', 'Creatinina', 'mg/dL', 0.6, 1.1, 'F'), p('creatinina', 'Creatinina', 'mg/dL', 0.7, 1.3, 'M')]),
  e('acido_urico', 'Ácido úrico', 'Química', 5, 'Ayuno de 8 horas.', 3, [
    p('acido_urico', 'Ácido úrico', 'mg/dL', 2.4, 6, 'F'), p('acido_urico', 'Ácido úrico', 'mg/dL', 3.4, 7, 'M')]),
  e('hepatico', 'Perfil hepático (TGO/TGP)', 'Química', 12, 'Ayuno de 8 horas.', 4, [
    p('tgo', 'TGO (AST)', 'U/L', 5, 40), p('tgp', 'TGP (ALT)', 'U/L', 7, 56), p('bilirrubina', 'Bilirrubina total', 'mg/dL', 0.1, 1.2)]),
  e('bun', 'Nitrógeno ureico', 'Química', 5, 'Ayuno de 8 horas.', 3, [p('bun', 'Nitrógeno ureico (BUN)', 'mg/dL', 7, 20)]),
  // Orina y heces
  e('ego', 'Examen general de orina', 'Orina y heces', 4, 'Primera orina de la mañana, frasco estéril, chorro medio.', 3, [
    p('ph_orina', 'pH', '', 5, 8), p('densidad', 'Densidad', '', 1.005, 1.03), p('leuco_orina', 'Leucocitos', '/campo', 0, 5), q('nitritos', 'Nitritos')]),
  e('egh', 'Examen general de heces', 'Orina y heces', 4, 'Muestra fresca en frasco limpio, sin contacto con orina.', 4, [q('parasitos', 'Parásitos'), q('sangre_oculta', 'Sangre oculta')]),
  e('urocultivo', 'Urocultivo', 'Orina y heces', 12, 'Primera orina de la mañana, frasco estéril. Sin antibióticos 3 días antes.', 72, [q('urocultivo', 'Cultivo')]),
  // Hormonas
  e('tiroideo', 'Perfil tiroideo (TSH, T4L)', 'Hormonas', 22, 'No requiere ayuno. Informar si toma levotiroxina.', 24, [
    p('tsh', 'TSH', 'µUI/mL', 0.4, 4.0), p('t4l', 'T4 libre', 'ng/dL', 0.8, 1.8)]),
  e('psa', 'PSA', 'Hormonas', 16, 'Evitar actividad sexual y ciclismo 48 horas antes.', 24, [p('psa', 'Antígeno prostático', 'ng/mL', 0, 4)]),
  e('embarazo', 'Prueba de embarazo (β-hCG)', 'Hormonas', 8, 'No requiere ayuno.', 2, [q('bhcg', 'β-hCG')]),
  // Infecciosas
  e('vih', 'VIH', 'Infecciosas', 10, 'No requiere ayuno.', 24, [q('vih', 'VIH 1/2')]),
  e('vdrl', 'VDRL', 'Infecciosas', 6, 'No requiere ayuno.', 24, [q('vdrl', 'VDRL')]),
  e('pcr', 'PCR', 'Infecciosas', 9, 'No requiere ayuno.', 4, [p('pcr', 'Proteína C reactiva', 'mg/L', 0, 5)]),
  e('covid', 'Antígeno/Prueba COVID', 'Infecciosas', 15, 'No requiere ayuno. No usar enjuague bucal antes de la toma.', 1, [q('covid', 'Antígeno SARS-CoV-2')]),
  e('dengue', 'Dengue NS1', 'Infecciosas', 18, 'No requiere ayuno. Idealmente en los primeros 5 días de síntomas.', 3, [q('dengue', 'Antígeno NS1')]),
  // Paquetes
  e('chequeo', 'Chequeo general', 'Paquetes', 38, 'Ayuno de 12 horas.', 24, [
    ...HEMOGRAMA, p('glucosa', 'Glucosa', 'mg/dL', 70, 100), p('colesterol', 'Colesterol total', 'mg/dL', 0, 200),
    p('trigliceridos', 'Triglicéridos', 'mg/dL', 0, 150), p('creatinina', 'Creatinina', 'mg/dL', 0.6, 1.1, 'F'), p('creatinina', 'Creatinina', 'mg/dL', 0.7, 1.3, 'M')]),
  e('prenatal', 'Prenatal', 'Paquetes', 32, 'Ayuno de 8 horas.', 24, [
    p('hemoglobina', 'Hemoglobina', 'g/dL', 11, 14, 'F'), p('glucosa', 'Glucosa', 'mg/dL', 70, 100),
    q('grupo', 'Grupo sanguíneo'), q('rh', 'Factor Rh'), q('vdrl', 'VDRL'), q('vih', 'VIH 1/2')]),
];
