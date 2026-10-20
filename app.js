/* ===================================================
   POS Dashboard - app.js
   Main application logic
   =================================================== */

'use strict';

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const URLS = {
  link1: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSpB-VtUnuokLAEGDu9J5XnD3OecvwxioHEjza1IbLiapmBd3LJG254lmMtR0MTid29lWr6JFA8zamP/pub?gid=0&single=true&output=csv',
  link2: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ_99pDY-H4RtU09tGd9AIKqLnBbBjPxqcfZQZZt7gGWus2_cYTGW6gVspgXmXyZhiZbU2qm2Z6YFVp/pub?gid=0&single=true&output=csv',
  link3: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT3gfmIzmNu5gQSr3QvU1IAYnUnQXkSeylsJLlSdSwvmu8052IyasJl8sEALz05nIIJcQyyd61N8-LC/pub?gid=0&single=true&output=csv',
  link4u: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTLizes4L8qiJU4YN-hmJAtXY0JKeenA3iJYZPZH1OmuAKBR_fDA-lXUeHARiBfhkOXdwcxLW0MrLAn/pub?gid=0&single=true&output=csv',
  link4a: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTLizes4L8qiJU4YN-hmJAtXY0JKeenA3iJYZPZH1OmuAKBR_fDA-lXUeHARiBfhkOXdwcxLW0MrLAn/pub?gid=504230782&single=true&output=csv',
};

// ─── RAW DATA STORAGE ─────────────────────────────────────────────────────────
const RAW = { link1: [], link2: [], link3: [], link4u: [], link4a: [] };
const CONV = { users: {}, aliados: {} }; // conversion tables
let FILTERED = { link1: [], link2: [], link3: [] };

// Chart instances registry (to destroy on re-render)
const CHARTS = {};

// Active period for afiliaciones chart
let afiliacionesPeriod = 'anio';

// Active filters
const FILTERS = { dateFrom: null, dateTo: null, region: [], categoria: [], proveedor: [] };

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initDatePicker();
  await refreshAllData();
});

// ─── DATA LOADING ─────────────────────────────────────────────────────────────
async function refreshAllData() {
  showLoading(true);
  animateRefreshIcon(true);
  try {
    const [d1, d2, d3, d4u, d4a] = await Promise.all([
      fetchCSV(URLS.link1),
      fetchCSV(URLS.link2),
      fetchCSV(URLS.link3),
      fetchCSV(URLS.link4u),
      fetchCSV(URLS.link4a),
    ]);
    RAW.link1 = normalizeData1(d1);
    RAW.link2 = normalizeData2(d2);
    RAW.link3 = normalizeData3(d3);
    RAW.link4u = d4u;
    RAW.link4a = d4a;
    buildConversionTables();
    applyConversions();
    populateFilters();
    applyFilters();
    document.getElementById('lastUpdated').textContent = 'Act: ' + new Date().toLocaleString('es-VE');
    showToast('Datos actualizados correctamente', 'success');
  } catch (err) {
    console.error(err);
    showToast('Error al cargar datos: ' + err.message, 'danger');
  } finally {
    showLoading(false);
    animateRefreshIcon(false);
  }
}

function fetchCSV(url) {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: r => resolve(r.data),
      error: e => reject(e),
    });
  });
}

// ─── NORMALIZATION ────────────────────────────────────────────────────────────
/** Parse number handling both 1.234,56 (latin) and 1,234.56 (american) */
function parseNum(val) {
  if (val == null) return 0;
  let s = String(val).trim();
  // Remove currency symbols and spaces
  s = s.replace(/[Bs$€\s]/g, '');
  if (!s) return 0;
  // Detect format: if last separator is comma and digit count after < 4 chars -> likely latin
  const commaIdx = s.lastIndexOf(',');
  const dotIdx = s.lastIndexOf('.');
  if (commaIdx > dotIdx) {
    // Latin: 1.234,56
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // American: 1,234.56
    s = s.replace(/,/g, '');
  }
  return parseFloat(s) || 0;
}

/** Normalize a date string to a JS Date */
function parseDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (!s) return null;
  // Try DD/MM/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return new Date(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`);
  // Try YYYY-MM-DD
  const iso = Date.parse(s);
  if (!isNaN(iso)) return new Date(iso);
  return null;
}

function normalizeData1(rows) {
  return rows.map(r => {
    const keys = Object.keys(r);
    // Map header variants to standard keys
    const get = (...names) => {
      for (const n of names) {
        const k = keys.find(k => k.toUpperCase().trim().includes(n.toUpperCase()));
        if (k !== undefined) return String(r[k] || '').trim();
      }
      return '';
    };
    return {
      cod_afiliado: get('COD AFILIADO','COD_AFILIADO','AFILIADO'),
      nombre: get('NOMBRE','COMERCIO','RAZON'),
      fecha: parseDate(get('FECHA','DATE')),
      estado: get('ESTADO','STATE','REGION'),
      categoria: get('CATEGOR','CATEGORY','RUBRO'),
      usuario: get('USUARIO','USER'),
      rol: get('ROL','ROLE'),
      manejador: get('MANEJADOR','HANDLER','GESTOR'),
      proveedor: get('PROVEEDOR','PROVIDER'),
      tasa_modificada: get('TASA','RATE'),
      _raw: r,
    };
  }).filter(r => r.cod_afiliado);
}

function normalizeData2(rows) {
  return rows.map(r => {
    const keys = Object.keys(r);
    const get = (...names) => {
      for (const n of names) {
        const k = keys.find(k => k.toUpperCase().trim().includes(n.toUpperCase()));
        if (k !== undefined) return String(r[k] || '').trim();
      }
      return '';
    };
    const fechaStr = get('FECHA','DATE','ULTIMA');
    return {
      afiliado: get('AFILIADO','TERMINAL','COD'),
      monto: parseNum(get('MONTO','AMOUNT','TRANSAC')),
      cantidad_tx: parseNum(get('CANTIDAD','CANT','QTY','TRANSAC')),
      estado: get('ESTADO','STATE','REGION'),
      categoria: get('CATEGOR','CATEGORY','RUBRO'),
      modelo: get('MODELO','MODEL'),
      manejador: get('MANEJADOR','HANDLER','GESTOR'),
      proveedor: get('PROVEEDOR','PROVIDER'),
      fecha_ultima: parseDate(fechaStr),
      _raw: r,
    };
  }).filter(r => r.afiliado);
}

function normalizeData3(rows) {
  return rows.map(r => {
    const keys = Object.keys(r);
    const get = (...names) => {
      for (const n of names) {
        const k = keys.find(k => k.toUpperCase().trim().includes(n.toUpperCase()));
        if (k !== undefined) return String(r[k] || '').trim();
      }
      return '';
    };
    // Clean terminal field: remove spaces and special characters
    let terminal = get('TERMINAL','EQUIPO','SERIE');
    terminal = terminal.replace(/[\s\-_\/\\\.]+/g, '').toUpperCase();
    // Clean model: take only the model name portion
    let modelo = get('MODELO','MODEL');
    modelo = cleanModel(modelo);
    const tipo = get('TIPO','TYPE','GESTION','OPERACION');
    return {
      terminal,
      fecha: parseDate(get('FECHA','DATE','FECHA_GESTION')),
      tipo: classifyTipo(tipo),
      usuario_creador: get('USUARIO','CREADOR','USER'),
      rol: get('ROL','ROLE'),
      manejador: get('MANEJADOR','HANDLER','GESTOR'),
      estado: get('ESTADO','STATE','REGION'),
      modelo,
      _raw: r,
    };
  }).filter(r => r.terminal);
}

/** Classify gestión type */
function classifyTipo(str) {
  const s = str.toUpperCase();
  if (s.includes('INSTAL') || s.includes('INSTALL')) return 'Instalación';
  if (s.includes('DESINST') || s.includes('DESINS') || s.includes('RETIRO')) return 'Desinstalación';
  if (s.includes('CORRECT') || s.includes('MANTEN') || s.includes('REPAIR')) return 'Correctivo';
  return str || 'Otro';
}

/** Extract model name cleanly */
function cleanModel(str) {
  if (!str) return '';
  // Remove extra descriptors, take first meaningful word group
  return str.replace(/\s+/g, ' ').trim().split(/[,;(]/)[0].trim();
}

// ─── CONVERSION TABLES ────────────────────────────────────────────────────────
function buildConversionTables() {
  // Link4u: user code → user name
  RAW.link4u.forEach(r => {
    const keys = Object.keys(r);
    const get = n => {
      const k = keys.find(k => k.toUpperCase().includes(n.toUpperCase()));
      return k ? String(r[k] || '').trim() : '';
    };
    const code = get('COD') || get('USUARIO') || get('USER') || get('LOGIN');
    const name = get('NOMBRE') || get('NAME') || get('FULL');
    if (code && name) CONV.users[code.toUpperCase()] = name;
  });
  // Link4a: aliado code → aliado name
  RAW.link4a.forEach(r => {
    const keys = Object.keys(r);
    const get = n => {
      const k = keys.find(k => k.toUpperCase().includes(n.toUpperCase()));
      return k ? String(r[k] || '').trim() : '';
    };
    const code = get('COD') || get('MANEJ') || get('ALIAS');
    const name = get('NOMBRE') || get('NAME') || get('RAZON');
    if (code && name) CONV.aliados[code.toUpperCase()] = name;
  });
}

function convertUser(code) {
  if (!code) return code;
  return CONV.users[code.toUpperCase()] || code;
}
function convertAliado(code) {
  if (!code) return code;
  return CONV.aliados[code.toUpperCase()] || code;
}

function applyConversions() {
  RAW.link1.forEach(r => {
    r.usuario_nombre = convertUser(r.usuario);
    r.manejador_nombre = convertAliado(r.manejador);
  });
  RAW.link2.forEach(r => {
    r.manejador_nombre = convertAliado(r.manejador);
  });
  RAW.link3.forEach(r => {
    r.usuario_creador_nombre = convertUser(r.usuario_creador);
    r.manejador_nombre = convertAliado(r.manejador);
  });
}

// ─── FILTERS ─────────────────────────────────────────────────────────────────
let choicesRegion, choicesCategoria, choicesProveedor;

function populateFilters() {
  // Collect unique values from all datasets
  const estados = [...new Set([
    ...RAW.link1.map(r => r.estado),
    ...RAW.link2.map(r => r.estado),
    ...RAW.link3.map(r => r.estado),
  ].filter(Boolean))].sort();

  const categorias = [...new Set([
    ...RAW.link1.map(r => r.categoria),
    ...RAW.link2.map(r => r.categoria),
  ].filter(Boolean))].sort();

  const proveedores = [...new Set([
    ...RAW.link1.map(r => r.proveedor),
    ...RAW.link2.map(r => r.proveedor),
  ].filter(Boolean))].sort();

  populateSelect('filterRegion', estados, choicesRegion, v => choicesRegion = v);
  populateSelect('filterCategoria', categorias, choicesCategoria, v => choicesCategoria = v);
  populateSelect('filterProveedor', proveedores, choicesProveedor, v => choicesProveedor = v);
}

function populateSelect(id, values, existingChoice, setter) {
  const el = document.getElementById(id);
  // Clear existing Choices instance
  if (existingChoice) { try { existingChoice.destroy(); } catch(e){} }
  // Rebuild options
  el.innerHTML = '';
  values.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = v;
    el.appendChild(opt);
  });
  const c = new Choices(el, {
    removeItemButton: true,
    searchEnabled: true,
    placeholder: true,
    placeholderValue: 'Todos',
    noChoicesText: 'Sin opciones',
    noResultsText: 'Sin resultados',
  });
  setter(c);
}

function initDatePicker() {
  flatpickr('#dateRangePicker', {
    mode: 'range',
    dateFormat: 'd/m/Y',
    locale: { rangeSeparator: ' — ' },
    onChange: (dates) => {
      FILTERS.dateFrom = dates[0] || null;
      FILTERS.dateTo = dates[1] || null;
    },
  });
}

function applyFilters() {
  const regions = choicesRegion ? choicesRegion.getValue(true) : [];
  const cats = choicesCategoria ? choicesCategoria.getValue(true) : [];
  const provs = choicesProveedor ? choicesProveedor.getValue(true) : [];
  FILTERS.region = regions;
  FILTERS.categoria = cats;
  FILTERS.proveedor = provs;

  const filterRow = (r, dateField) => {
    if (FILTERS.dateFrom && r[dateField] && r[dateField] < FILTERS.dateFrom) return false;
    if (FILTERS.dateTo && r[dateField] && r[dateField] > FILTERS.dateTo) return false;
    if (FILTERS.region.length && !FILTERS.region.includes(r.estado)) return false;
    if (FILTERS.categoria.length && !FILTERS.categoria.includes(r.categoria)) return false;
    if (FILTERS.proveedor.length && !FILTERS.proveedor.includes(r.proveedor)) return false;
    return true;
  };

  FILTERED.link1 = RAW.link1.filter(r => filterRow(r, 'fecha'));
  FILTERED.link2 = RAW.link2.filter(r => filterRow(r, 'fecha_ultima'));
  FILTERED.link3 = RAW.link3.filter(r => filterRow(r, 'fecha'));

  renderAll();
}

function clearFilters() {
  FILTERS.dateFrom = null; FILTERS.dateTo = null;
  FILTERS.region = []; FILTERS.categoria = []; FILTERS.proveedor = [];
  document.getElementById('dateRangePicker')._flatpickr.clear();
  if (choicesRegion) choicesRegion.removeActiveItems();
  if (choicesCategoria) choicesCategoria.removeActiveItems();
  if (choicesProveedor) choicesProveedor.removeActiveItems();
  FILTERED.link1 = [...RAW.link1];
  FILTERED.link2 = [...RAW.link2];
  FILTERED.link3 = [...RAW.link3];
  renderAll();
}

// ─── RENDER ALL ───────────────────────────────────────────────────────────────
function renderAll() {
  renderKPIs();
  renderAfiliacionesChart();
  renderMapaAfiliaciones();
  renderTopCategorias();
  renderTopUsuariosR4Afil();
  renderGestionTimeline();
  renderInstVsDesinst();
  renderTopManejadoresTec();
  renderTopUsuariosR4Tec();
  renderEquiposCharts();
  renderMapaEquipos();
  renderTablaTasas();
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────
function renderKPIs() {
  const d1 = FILTERED.link1;
  const d2 = FILTERED.link2;
  const d3 = FILTERED.link3;

  // Total comercios afiliados
  const totalAfil = new Set(d1.map(r => r.cod_afiliado)).size;
  setKPI('kpi-totalAfiliados', fmtN(totalAfil));

  // Terminales activos (all records in link2) + sin actividad
  const totalTerminales = d2.length;
  const SIN_ACTIVIDAD_DAYS = 30;
  const hoy = new Date();
  const sinActividad = d2.filter(r => {
    if (!r.fecha_ultima) return true;
    const diff = (hoy - r.fecha_ultima) / 86400000;
    return diff > SIN_ACTIVIDAD_DAYS;
  }).length;
  const pctSin = totalTerminales ? ((sinActividad / totalTerminales) * 100).toFixed(1) : 0;
  setKPI('kpi-terminalesActivos', fmtN(totalTerminales));
  setText('kpi-terminales-sub', `${pctSin}% sin actividad (+${SIN_ACTIVIDAD_DAYS}d)`);
  setKPI('kpi-sinActividad', fmtN(sinActividad));
  setText('kpi-sinActividad-sub', `de ${fmtN(totalTerminales)} terminales (${pctSin}%)`);

  // Monto transaccional
  const montoTotal = d2.reduce((s, r) => s + r.monto, 0);
  const montoMM = montoTotal / 1e6;
  setKPI('kpi-montoBS', 'Bs ' + fmtN(montoTotal));
  setText('kpi-montoMM-sub', fmtDec(montoMM, 3) + ' MM Bs');

  // Cantidad transacciones
  const cantTx = d2.reduce((s, r) => s + r.cantidad_tx, 0);
  setKPI('kpi-cantTx', fmtN(cantTx));

  // Promedio mensual afiliaciones (últimos 12 meses)
  const cutoff12 = new Date(); cutoff12.setMonth(cutoff12.getMonth() - 12);
  const last12 = d1.filter(r => r.fecha && r.fecha >= cutoff12);
  const byMonth12 = groupBy(last12, r => r.fecha ? `${r.fecha.getFullYear()}-${r.fecha.getMonth()}` : '?');
  const monthsWithData = Object.keys(byMonth12).filter(k => k !== '?').length || 1;
  const promedioMensual = Math.round(last12.length / monthsWithData);
  setKPI('kpi-promedioMensual', fmtN(promedioMensual));

  // Promedio diario afiliaciones
  const byDay = groupBy(d1.filter(r => r.fecha), r => r.fecha.toISOString().slice(0,10));
  const diasConData = Object.keys(byDay).length || 1;
  const promDiario = (d1.filter(r=>r.fecha).length / diasConData).toFixed(1);
  setKPI('kpi-promedioDiario', promDiario);

  // Usuarios R4 gestión diaria
  const r4Data = d1.filter(r => r.rol && r.rol.toUpperCase().includes('R4'));
  const byDayR4 = groupBy(r4Data.filter(r=>r.fecha), r => r.fecha.toISOString().slice(0,10));
  const diasR4 = Object.keys(byDayR4).length || 1;
  const usersR4PerDay = {};
  Object.values(byDayR4).forEach(rows => {
    rows.forEach(r => { usersR4PerDay[r.usuario] = (usersR4PerDay[r.usuario] || 0) + 1; });
  });
  const avgUsersR4 = (Object.keys(usersR4PerDay).length).toFixed(1);
  const avgGestR4 = (r4Data.length / diasR4).toFixed(1);
  setKPI('kpi-usuariosR4', `${Object.keys(usersR4PerDay).length} usuarios`);
  setText('kpi-usuariosR4-sub', `Prom. ${avgGestR4} afil/día`);

  // Gestión técnica hoy (o último día con datos)
  const todayStr = hoy.toISOString().slice(0,10);
  const todayGest = d3.filter(r => r.fecha && r.fecha.toISOString().slice(0,10) === todayStr);
  // If no data today, use last day
  const byDayGest = groupBy(d3.filter(r=>r.fecha), r => r.fecha.toISOString().slice(0,10));
  const sortedDays = Object.keys(byDayGest).sort().reverse();
  const lastDay = sortedDays[0];
  const lastDayRows = lastDay ? byDayGest[lastDay] : [];
  const useRows = todayGest.length ? todayGest : lastDayRows;

  setKPI('kpi-instDiarias', useRows.filter(r => r.tipo === 'Instalación').length);
  setKPI('kpi-desinstDiarias', useRows.filter(r => r.tipo === 'Desinstalación').length);
  setKPI('kpi-correctDiarios', useRows.filter(r => r.tipo === 'Correctivo').length);

  // Equipos activos diarios (link2 con transacción reciente)
  const ACTIVE_DAYS = 7;
  const cutoffActive = new Date(); cutoffActive.setDate(cutoffActive.getDate() - ACTIVE_DAYS);
  const equiposActivos = d2.filter(r => r.fecha_ultima && r.fecha_ultima >= cutoffActive).length;
  setKPI('kpi-equiposActivos', fmtN(equiposActivos));

  // Clientes con tasas modificadas
  const tasasModif = d1.filter(r => r.tasa_modificada && r.tasa_modificada !== '0' && r.tasa_modificada.trim() !== '').length;
  setKPI('kpi-tasasModificadas', fmtN(tasasModif));

  // Mini chart for resumen
  renderResumenMinicharts(d1, d3);
}

function renderResumenMinicharts(d1, d3) {
  // Afiliaciones por mes (últimos 12)
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 12);
  const byMonth = {};
  d1.filter(r => r.fecha && r.fecha >= cutoff).forEach(r => {
    const key = `${r.fecha.getFullYear()}-${String(r.fecha.getMonth()+1).padStart(2,'0')}`;
    byMonth[key] = (byMonth[key] || 0) + 1;
  });
  const sortedMonths = Object.keys(byMonth).sort();
  renderChart('chart-afiliacionesMes', 'bar', {
    labels: sortedMonths.map(m => { const [y,mo]=m.split('-'); return `${MESES[parseInt(mo)-1]} ${y}`; }),
    datasets: [{ label: 'Afiliaciones', data: sortedMonths.map(m=>byMonth[m]), backgroundColor: hexToRgba(COLORS[0],.7), borderRadius: 5 }],
  }, { plugins:{ legend:{display:false} }, scales:{ y:{ticks:{color:'#8a93a8'}}, x:{ticks:{color:'#8a93a8',maxRotation:45}} } });

  // Gestión técnica donut
  const tipos = { Instalación: 0, Desinstalación: 0, Correctivo: 0 };
  d3.forEach(r => { if (tipos[r.tipo] !== undefined) tipos[r.tipo]++; else tipos['Otro'] = (tipos['Otro']||0)+1; });
  renderChart('chart-gestionResumen', 'doughnut', {
    labels: Object.keys(tipos),
    datasets: [{ data: Object.values(tipos), backgroundColor: COLORS.slice(0,4) }],
  }, { plugins:{ legend:{position:'bottom', labels:{color:'#8a93a8', boxWidth:12}} } });
}

// ─── AFILIACIONES CHART ───────────────────────────────────────────────────────
function setAfiliacionesPeriod(p, btn) {
  afiliacionesPeriod = p;
  document.querySelectorAll('.time-toggle .btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderAfiliacionesChart();
}

function renderAfiliacionesChart() {
  const d1 = FILTERED.link1;
  const sel = document.getElementById('afiliacionesYearSel');

  // Populate year selector
  const years = [...new Set(d1.filter(r=>r.fecha).map(r=>r.fecha.getFullYear()))].sort();
  const currentYear = sel.value;
  sel.innerHTML = '<option value="all">Todos los años</option>';
  years.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    sel.appendChild(opt);
  });
  sel.value = currentYear && years.includes(parseInt(currentYear)) ? currentYear : 'all';

  let data = d1.filter(r => r.fecha);
  if (sel.value !== 'all') data = data.filter(r => r.fecha.getFullYear() === parseInt(sel.value));

  let grouped = {};
  let labelFn;
  if (afiliacionesPeriod === 'anio') {
    grouped = groupBy(data, r => r.fecha.getFullYear());
    labelFn = k => k;
  } else if (afiliacionesPeriod === 'mes') {
    grouped = groupBy(data, r => `${r.fecha.getFullYear()}-${String(r.fecha.getMonth()+1).padStart(2,'0')}`);
    labelFn = k => { const [y,m] = k.split('-'); return `${MESES[parseInt(m)-1]} ${y}`; };
  } else {
    grouped = groupBy(data, r => r.fecha.toISOString().slice(0,10));
    labelFn = k => k;
  }
  const keys = Object.keys(grouped).sort();
  renderChart('chart-afiliacionesHistorico', 'bar', {
    labels: keys.map(labelFn),
    datasets: [{ label: 'Afiliaciones', data: keys.map(k => grouped[k].length), backgroundColor: hexToRgba(COLORS[0],.7), borderRadius: 4 }],
  }, { plugins:{ legend:{display:false} }, scales:{ y:{ticks:{color:'#8a93a8'}}, x:{ticks:{color:'#8a93a8', maxRotation:60}} } });
}

// ─── MAPA VENEZUELA ───────────────────────────────────────────────────────────
const VE_STATES = [
  'Amazonas','Anzoátegui','Apure','Aragua','Barinas','Bolívar','Carabobo',
  'Cojedes','Delta Amacuro','Distrito Capital','Falcón','Guárico','Lara',
  'Mérida','Miranda','Monagas','Nueva Esparta','Portuguesa','Sucre',
  'Táchira','Trujillo','Vargas','Yaracuy','Zulia',
];

// Simplified SVG path data for Venezuela states (approximate bounding boxes)
// Full precision SVG paths for all 24 states
const VE_SVG_PATHS = {
  'Zulia':            'M 30 120 L 100 80 L 120 100 L 130 160 L 110 200 L 60 220 L 20 200 Z',
  'Falcón':           'M 110 60 L 170 40 L 200 70 L 190 100 L 140 110 L 110 90 Z',
  'Lara':             'M 170 80 L 220 70 L 240 100 L 220 130 L 190 130 L 170 110 Z',
  'Yaracuy':          'M 220 90 L 250 85 L 260 110 L 240 125 L 220 115 Z',
  'Carabobo':         'M 250 100 L 275 95 L 285 120 L 265 130 L 248 118 Z',
  'Aragua':           'M 280 100 L 315 95 L 325 125 L 300 135 L 278 122 Z',
  'Miranda':          'M 320 95 L 360 90 L 370 125 L 345 140 L 318 128 Z',
  'Distrito Capital': 'M 327 115 L 342 110 L 345 130 L 330 135 Z',
  'Vargas':           'M 330 88 L 360 82 L 362 100 L 330 106 Z',
  'Nueva Esparta':    'M 410 100 L 430 95 L 440 115 L 415 120 Z',
  'Sucre':            'M 380 105 L 440 90 L 460 130 L 430 155 L 390 145 Z',
  'Monagas':          'M 380 145 L 440 135 L 470 175 L 450 210 L 390 200 Z',
  'Delta Amacuro':    'M 450 160 L 510 150 L 530 230 L 490 260 L 450 230 Z',
  'Anzoátegui':       'M 330 140 L 390 130 L 400 195 L 360 220 L 320 200 Z',
  'Guárico':          'M 260 135 L 330 130 L 340 210 L 280 240 L 245 200 Z',
  'Bolívar':          'M 320 210 L 480 195 L 520 370 L 350 400 L 280 340 Z',
  'Amazonas':         'M 100 240 L 250 230 L 290 370 L 240 430 L 80 400 Z',
  'Apure':            'M 100 200 L 250 200 L 260 290 L 110 300 Z',
  'Barinas':          'M 140 150 L 230 145 L 245 200 L 145 210 Z',
  'Mérida':           'M 100 170 L 145 155 L 148 200 L 102 205 Z',
  'Táchira':          'M 55 180 L 105 168 L 108 205 L 58 210 Z',
  'Trujillo':         'M 140 130 L 180 125 L 182 158 L 142 162 Z',
  'Portuguesa':       'M 190 120 L 240 115 L 248 155 L 192 162 Z',
  'Cojedes':          'M 232 115 L 268 112 L 272 145 L 234 150 Z',
};

function renderMapaAfiliaciones() {
  const d1 = FILTERED.link1;
  const byEstado = {};
  VE_STATES.forEach(s => byEstado[s] = 0);
  d1.forEach(r => {
    const est = matchState(r.estado);
    if (est) byEstado[est]++;
  });
  renderMap('mapAfiliaciones', 'mapAfiliacionesLegend', byEstado, 'Afiliaciones', COLORS[0]);
}

function renderMapaEquipos() {
  const d2 = FILTERED.link2;
  const byEstado = {};
  VE_STATES.forEach(s => byEstado[s] = 0);
  d2.forEach(r => {
    const est = matchState(r.estado);
    if (est) byEstado[est] += r.monto / 1e6;
  });
  renderMap('mapEquipos', 'mapEquiposLegend', byEstado, 'Monto MM', COLORS[2]);
}

function renderMap(containerId, legendId, data, label, baseColor) {
  const container = document.getElementById(containerId);
  const values = Object.values(data).filter(v => v > 0);
  const maxVal = values.length ? Math.max(...values) : 1;

  let svg = `<svg viewBox="0 0 560 460" xmlns="http://www.w3.org/2000/svg">`;
  VE_STATES.forEach(state => {
    const val = data[state] || 0;
    const intensity = maxVal ? val / maxVal : 0;
    const fill = interpolateColor('#1e2636', baseColor, intensity);
    const path = VE_SVG_PATHS[state] || '';
    if (!path) return;
    svg += `<path class="state-path" d="${path}" fill="${fill}" stroke="#2a3347" stroke-width="1"
      data-state="${state}" data-val="${label==='Monto MM'?val.toFixed(2):Math.round(val)}"
      onclick="showStateTooltip(event,'${state}','${Math.round(val)}','${label}')">
      <title>${state}: ${label==='Monto MM'?fmtDec(val,2)+' MM Bs':fmtN(Math.round(val))} ${label}</title>
    </path>`;
    // State label
    const bbox = getStateLabelPos(state);
    if (bbox) svg += `<text x="${bbox.x}" y="${bbox.y}" font-size="5.5" fill="#fff" text-anchor="middle" opacity="0.85" pointer-events="none">${state.length > 10 ? state.slice(0,9)+'.' : state}</text>`;
  });
  svg += `</svg>`;
  container.innerHTML = svg;

  // Legend
  const legendEl = document.getElementById(legendId);
  const steps = [0, 0.25, 0.5, 0.75, 1];
  legendEl.innerHTML = steps.map(s => {
    const v = (maxVal * s);
    const color = interpolateColor('#1e2636', baseColor, s);
    const lbl = label === 'Monto MM' ? fmtDec(v,2)+' MM' : fmtN(Math.round(v));
    return `<div class="map-legend-item"><div class="map-legend-dot" style="background:${color}"></div>${lbl}</div>`;
  }).join('');
}

const STATE_LABEL_POS = {
  'Zulia':            {x:72,  y:165},
  'Falcón':           {x:155, y:75},
  'Lara':             {x:205, y:105},
  'Yaracuy':          {x:240, y:108},
  'Carabobo':         {x:265, y:115},
  'Aragua':           {x:302, y:118},
  'Miranda':          {x:343, y:115},
  'Distrito Capital': {x:337, y:124},
  'Vargas':           {x:345, y:96},
  'Nueva Esparta':    {x:422, y:110},
  'Sucre':            {x:415, y:130},
  'Monagas':          {x:420, y:175},
  'Delta Amacuro':    {x:488, y:205},
  'Anzoátegui':       {x:360, y:175},
  'Guárico':          {x:295, y:185},
  'Bolívar':          {x:400, y:300},
  'Amazonas':         {x:185, y:335},
  'Apure':            {x:180, y:250},
  'Barinas':          {x:192, y:180},
  'Mérida':           {x:124, y:182},
  'Táchira':          {x:82,  y:192},
  'Trujillo':         {x:162, y:145},
  'Portuguesa':       {x:215, y:140},
  'Cojedes':          {x:252, y:132},
};
function getStateLabelPos(state) { return STATE_LABEL_POS[state] || null; }

/** Fuzzy match state name */
function matchState(str) {
  if (!str) return null;
  const s = str.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  return VE_STATES.find(vs => {
    const n = vs.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    return n === s || n.includes(s) || s.includes(n.slice(0,5));
  }) || null;
}

// ─── TOP CATEGORÍAS ───────────────────────────────────────────────────────────
function renderTopCategorias() {
  const d1 = FILTERED.link1;
  const byCat = groupBy(d1, r => r.categoria || 'Sin categoría');
  const sorted = Object.entries(byCat).sort((a,b) => b[1].length - a[1].length).slice(0,15);
  renderChart('chart-topCategorias', 'bar', {
    labels: sorted.map(([k]) => truncate(k,22)),
    datasets: [{ label: 'Afiliaciones', data: sorted.map(([,v])=>v.length), backgroundColor: COLORS.slice(0,sorted.length), borderRadius: 4 }],
  }, { indexAxis:'y', plugins:{legend:{display:false}}, scales:{ x:{ticks:{color:'#8a93a8'}}, y:{ticks:{color:'#8a93a8',font:{size:10}}} } });
}

// ─── TOP USUARIOS R4 ──────────────────────────────────────────────────────────
function renderTopUsuariosR4Afil() {
  const r4 = FILTERED.link1.filter(r => r.rol && r.rol.toUpperCase().includes('R4'));
  const byUser = groupBy(r4, r => r.usuario_nombre || r.usuario || 'N/A');
  const sorted = Object.entries(byUser).sort((a,b)=>b[1].length-a[1].length).slice(0,15);

  // Top usuarios bar
  renderChart('chart-topUsuariosR4-afil', 'bar', {
    labels: sorted.map(([k])=>truncate(k,20)),
    datasets: [{ label: 'Afiliaciones', data: sorted.map(([,v])=>v.length), backgroundColor: hexToRgba(COLORS[4],.75), borderRadius: 4 }],
  }, { indexAxis:'y', plugins:{legend:{display:false}}, scales:{ x:{ticks:{color:'#8a93a8'}}, y:{ticks:{color:'#8a93a8',font:{size:10}}} } });

  // Promedio diario por usuario R4
  const daysByUser = {};
  r4.filter(r=>r.fecha).forEach(r => {
    const day = r.fecha.toISOString().slice(0,10);
    const uname = r.usuario_nombre || r.usuario || 'N/A';
    if (!daysByUser[uname]) daysByUser[uname] = new Set();
    daysByUser[uname].add(day);
  });
  const promDiario = Object.entries(daysByUser).map(([u, days]) => {
    const total = (byUser[u]||[]).length;
    return [u, (total / days.size).toFixed(1)];
  }).sort((a,b)=>parseFloat(b[1])-parseFloat(a[1])).slice(0,10);

  renderChart('chart-promDiarioR4-afil', 'bar', {
    labels: promDiario.map(([k])=>truncate(k,20)),
    datasets: [{ label: 'Prom. diario', data: promDiario.map(([,v])=>parseFloat(v)), backgroundColor: hexToRgba(COLORS[1],.75), borderRadius: 4 }],
  }, { indexAxis:'y', plugins:{legend:{display:false}}, scales:{ x:{ticks:{color:'#8a93a8'}}, y:{ticks:{color:'#8a93a8',font:{size:10}}} } });
}

// ─── TABLA TASAS ──────────────────────────────────────────────────────────────
function renderTablaTasas() {
  const tasas = FILTERED.link1.filter(r => r.tasa_modificada && r.tasa_modificada.trim() && r.tasa_modificada !== '0');
  const tbody = document.querySelector('#tablaTasasModificadas tbody');
  tbody.innerHTML = tasas.slice(0,200).map(r => `
    <tr>
      <td>${r.cod_afiliado}</td>
      <td>${r.nombre||'—'}</td>
      <td>${r.categoria||'—'}</td>
      <td>${r.estado||'—'}</td>
      <td><span class="badge bg-warning text-dark">${r.tasa_modificada}</span></td>
    </tr>`).join('');
}

// ─── GESTIÓN TÉCNICA ─────────────────────────────────────────────────────────
function renderGestionTimeline() {
  const d3 = FILTERED.link3;
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 12);
  const recent = d3.filter(r => r.fecha && r.fecha >= cutoff);

  const byMonth = {};
  recent.forEach(r => {
    const key = `${r.fecha.getFullYear()}-${String(r.fecha.getMonth()+1).padStart(2,'0')}`;
    if (!byMonth[key]) byMonth[key] = { Instalación:0, Desinstalación:0, Correctivo:0, Otro:0 };
    byMonth[key][r.tipo] = (byMonth[key][r.tipo]||0) + 1;
  });
  const keys = Object.keys(byMonth).sort();
  const tipos = ['Instalación','Desinstalación','Correctivo'];
  const colors = [COLORS[1], COLORS[3], COLORS[2]];

  renderChart('chart-gestionTimeline', 'line', {
    labels: keys.map(k => { const [y,m]=k.split('-'); return `${MESES[parseInt(m)-1]} ${y}`; }),
    datasets: tipos.map((t,i) => ({
      label: t,
      data: keys.map(k => byMonth[k][t]||0),
      borderColor: colors[i],
      backgroundColor: hexToRgba(colors[i],.1),
      fill: true,
      tension: 0.4,
      pointRadius: 3,
    })),
  }, { plugins:{legend:{position:'top',labels:{color:'#8a93a8'}}}, scales:{ y:{ticks:{color:'#8a93a8'}}, x:{ticks:{color:'#8a93a8',maxRotation:45}} } });
}

function renderInstVsDesinst() {
  const d3 = FILTERED.link3;
  const byMonth = {};
  d3.filter(r=>r.fecha).forEach(r => {
    const key = `${r.fecha.getFullYear()}-${String(r.fecha.getMonth()+1).padStart(2,'0')}`;
    if (!byMonth[key]) byMonth[key] = {i:0,d:0};
    if (r.tipo==='Instalación') byMonth[key].i++;
    if (r.tipo==='Desinstalación') byMonth[key].d++;
  });
  const keys = Object.keys(byMonth).sort().slice(-12);
  renderChart('chart-instVsDesinst', 'bar', {
    labels: keys.map(k => { const [y,m]=k.split('-'); return `${MESES[parseInt(m)-1].slice(0,3)} ${y.slice(2)}`; }),
    datasets: [
      { label: 'Instalaciones', data: keys.map(k=>byMonth[k].i), backgroundColor: hexToRgba(COLORS[1],.75), borderRadius:3 },
      { label: 'Desinstalaciones', data: keys.map(k=>byMonth[k].d), backgroundColor: hexToRgba(COLORS[3],.75), borderRadius:3 },
    ],
  }, { plugins:{legend:{position:'top',labels:{color:'#8a93a8'}}}, scales:{ y:{ticks:{color:'#8a93a8'}}, x:{ticks:{color:'#8a93a8',maxRotation:45}} } });
}

function renderTopManejadoresTec() {
  const d3 = FILTERED.link3;
  const byMan = groupBy(d3, r => r.manejador_nombre || r.manejador || 'N/A');
  const sorted = Object.entries(byMan).sort((a,b)=>b[1].length-a[1].length).slice(0,12);
  renderChart('chart-topManejadoresTec', 'bar', {
    labels: sorted.map(([k])=>truncate(k,22)),
    datasets: [{ label: 'Gestiones', data: sorted.map(([,v])=>v.length), backgroundColor: COLORS.slice(0,sorted.length), borderRadius:4 }],
  }, { indexAxis:'y', plugins:{legend:{display:false}}, scales:{ x:{ticks:{color:'#8a93a8'}}, y:{ticks:{color:'#8a93a8',font:{size:10}}} } });
}

function renderTopUsuariosR4Tec() {
  const r4 = FILTERED.link3.filter(r => r.rol && r.rol.toUpperCase().includes('R4'));
  const byUser = groupBy(r4, r => r.usuario_creador_nombre || r.usuario_creador || 'N/A');
  const sorted = Object.entries(byUser).sort((a,b)=>b[1].length-a[1].length).slice(0,12);

  renderChart('chart-topUsuariosR4-tec', 'bar', {
    labels: sorted.map(([k])=>truncate(k,20)),
    datasets: [{ label: 'Gestiones', data: sorted.map(([,v])=>v.length), backgroundColor: hexToRgba(COLORS[5],.75), borderRadius:4 }],
  }, { indexAxis:'y', plugins:{legend:{display:false}}, scales:{ x:{ticks:{color:'#8a93a8'}}, y:{ticks:{color:'#8a93a8',font:{size:10}}} } });

  // Promedio diario
  const daysByUser = {};
  r4.filter(r=>r.fecha).forEach(r => {
    const day = r.fecha.toISOString().slice(0,10);
    const u = r.usuario_creador_nombre || r.usuario_creador || 'N/A';
    if (!daysByUser[u]) daysByUser[u] = new Set();
    daysByUser[u].add(day);
  });
  const promDiario = Object.entries(daysByUser).map(([u,days]) => {
    const total = (byUser[u]||[]).length;
    return [u, (total/days.size).toFixed(1)];
  }).sort((a,b)=>parseFloat(b[1])-parseFloat(a[1])).slice(0,10);

  renderChart('chart-promDiarioR4-tec', 'bar', {
    labels: promDiario.map(([k])=>truncate(k,20)),
    datasets: [{ label: 'Prom. diario', data: promDiario.map(([,v])=>parseFloat(v)), backgroundColor: hexToRgba(COLORS[2],.75), borderRadius:4 }],
  }, { indexAxis:'y', plugins:{legend:{display:false}}, scales:{ x:{ticks:{color:'#8a93a8'}}, y:{ticks:{color:'#8a93a8',font:{size:10}}} } });
}

// ─── EQUIPOS Y DESEMPEÑO ─────────────────────────────────────────────────────
function renderEquiposCharts() {
  const d2 = FILTERED.link2;

  // Riesgo parque activo (donut: activos / sin actividad)
  const hoy = new Date();
  const cut30 = new Date(); cut30.setDate(cut30.getDate()-30);
  const cut90 = new Date(); cut90.setDate(cut90.getDate()-90);
  let cat = {Activo:0, 'Sin actividad 30d':0, 'Sin actividad 90d':0, 'Sin datos':0};
  d2.forEach(r => {
    if (!r.fecha_ultima) { cat['Sin datos']++; return; }
    if (r.fecha_ultima >= cut30) cat['Activo']++;
    else if (r.fecha_ultima >= cut90) cat['Sin actividad 30d']++;
    else cat['Sin actividad 90d']++;
  });
  renderChart('chart-riesgoParque','doughnut',{
    labels: Object.keys(cat),
    datasets:[{ data:Object.values(cat), backgroundColor:[COLORS[1],COLORS[2],COLORS[3],COLORS[5]] }],
  },{ plugins:{legend:{position:'bottom',labels:{color:'#8a93a8',boxWidth:12}}} });

  // Por modelo (top 10)
  const byModel = groupBy(d2, r => r.modelo || 'N/A');
  const sortedM = Object.entries(byModel).sort((a,b)=>b[1].length-a[1].length).slice(0,10);
  renderChart('chart-distribModelo','doughnut',{
    labels: sortedM.map(([k])=>truncate(k,18)),
    datasets:[{ data:sortedM.map(([,v])=>v.length), backgroundColor:COLORS.slice(0,sortedM.length) }],
  },{ plugins:{legend:{position:'right',labels:{color:'#8a93a8',boxWidth:10,font:{size:10}}}} });

  // Top categorías por monto MM
  const byCat = {};
  d2.forEach(r => {
    const c = r.categoria||'Sin categoría';
    byCat[c] = (byCat[c]||0) + r.monto/1e6;
  });
  const sortedC = Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,12);
  renderChart('chart-topCatEquipos','bar',{
    labels: sortedC.map(([k])=>truncate(k,22)),
    datasets:[{ label:'Monto MM Bs', data:sortedC.map(([,v])=>parseFloat(v.toFixed(2))), backgroundColor:COLORS.slice(0,sortedC.length), borderRadius:4 }],
  },{ indexAxis:'y', plugins:{legend:{display:false}}, scales:{ x:{ticks:{color:'#8a93a8'}}, y:{ticks:{color:'#8a93a8',font:{size:10}}} } });

  // Top manejadores por monto MM
  const byMan = {};
  d2.forEach(r => {
    const m = r.manejador_nombre || r.manejador || 'N/A';
    byMan[m] = (byMan[m]||0) + r.monto/1e6;
  });
  const sortedMa = Object.entries(byMan).sort((a,b)=>b[1]-a[1]).slice(0,12);
  renderChart('chart-topManejadoresEquipos','bar',{
    labels: sortedMa.map(([k])=>truncate(k,22)),
    datasets:[{ label:'Monto MM Bs', data:sortedMa.map(([,v])=>parseFloat(v.toFixed(2))), backgroundColor:hexToRgba(COLORS[0],.75), borderRadius:4 }],
  },{ indexAxis:'y', plugins:{legend:{display:false}}, scales:{ x:{ticks:{color:'#8a93a8'}}, y:{ticks:{color:'#8a93a8',font:{size:10}}} } });
}

// ─── EXCEL UPLOAD ─────────────────────────────────────────────────────────────
async function handleExcelUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  showLoading(true);
  try {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array', cellDates: true });

    const result = {};
    wb.SheetNames.forEach(name => {
      const ws = wb.Sheets[name];
      const json = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' });
      // Clean terminal field in link3-like sheets
      const cleaned = json.map(row => {
        const r = { ...row };
        // Clean terminal/serie fields
        Object.keys(r).forEach(k => {
          const ku = k.toUpperCase();
          if (ku.includes('TERMINAL') || ku.includes('SERIE') || ku.includes('EQUIPO')) {
            r[k] = String(r[k]).replace(/[\s\-_\/\\\.]+/g,'').toUpperCase();
          }
          if (ku.includes('MODELO') || ku.includes('MODEL')) {
            r[k] = cleanModel(String(r[k]));
          }
          // Parse numbers
          if (ku.includes('MONTO') || ku.includes('AMOUNT') || ku.includes('CANTIDAD')) {
            const num = parseNum(String(r[k]));
            if (!isNaN(num)) r[k] = num;
          }
        });
        return r;
      });
      result[name] = cleaned;
    });

    // Show summary
    const summary = Object.entries(result).map(([s,rows]) => `• ${s}: ${rows.length} filas`).join('\n');
    showToast(`Excel leído correctamente:\n${summary}`, 'success');

    // Download clean version as CSV
    downloadCleanExcel(result, file.name.replace(/\.\w+$/,'') + '_limpio.xlsx');
  } catch (err) {
    showToast('Error al leer Excel: ' + err.message, 'danger');
  } finally {
    showLoading(false);
    event.target.value = '';
  }
}

function downloadCleanExcel(sheetsData, filename) {
  const wb = XLSX.utils.book_new();
  Object.entries(sheetsData).forEach(([name, rows]) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0,31));
  });
  XLSX.writeFile(wb, filename);
  showToast('Archivo limpio descargado: ' + filename, 'success');
}

// ─── CHART HELPER ─────────────────────────────────────────────────────────────
const COLORS = [
  '#4f8ef7','#30d896','#f7c948','#f75050','#a175f7','#6ec5e9',
  '#f7824f','#25c9c9','#ff6384','#36a2eb','#ffce56','#4bc0c0',
  '#9966ff','#ff9f40','#ff6384',
];
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const DEFAULT_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { color: '#8a93a8' } }, tooltip: { mode: 'index', intersect: false } },
  scales: {
    x: { grid: { color: '#2a3347' }, ticks: { color: '#8a93a8' } },
    y: { grid: { color: '#2a3347' }, ticks: { color: '#8a93a8' } },
  },
};

function renderChart(id, type, data, extraOpts={}) {
  if (CHARTS[id]) { try { CHARTS[id].destroy(); } catch(e){} }
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const opts = deepMerge(JSON.parse(JSON.stringify(DEFAULT_OPTS)), extraOpts);
  if (type === 'doughnut' || type === 'pie') {
    delete opts.scales;
  }
  CHARTS[id] = new Chart(ctx, { type, data, options: opts });
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────────
function switchTab(tabId, el) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`tab-${tabId}`).classList.add('active');
  el.classList.add('active');
  const titles = { resumen:'Resumen Ejecutivo', afiliaciones:'Afiliaciones y Usuarios', tecnico:'Gestión Técnica', equipos:'Equipos y Desempeño' };
  document.getElementById('pageTitle').textContent = titles[tabId] || tabId;
}

function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const mw = document.getElementById('mainWrapper');
  if (window.innerWidth > 900) {
    sb.classList.toggle('collapsed');
    mw.classList.toggle('expanded');
  } else {
    sb.classList.toggle('open');
  }
}

function showLoading(show) {
  document.getElementById('loadingOverlay').classList.toggle('hidden', !show);
}

function animateRefreshIcon(spin) {
  const icon = document.getElementById('refreshIcon');
  if (spin) icon.classList.add('spin');
  else icon.classList.remove('spin');
}

function showToast(msg, type='primary') {
  const toast = document.getElementById('toastMsg');
  const text = document.getElementById('toastText');
  toast.className = `toast align-items-center text-bg-${type} border-0`;
  text.textContent = msg;
  const bsToast = bootstrap.Toast.getOrCreateInstance(toast, { delay: 4000 });
  bsToast.show();
}

function setKPI(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
function groupBy(arr, keyFn) {
  const res = {};
  arr.forEach(item => {
    const k = keyFn(item);
    if (!res[k]) res[k] = [];
    res[k].push(item);
  });
  return res;
}

function fmtN(n) {
  return Number(n).toLocaleString('es-VE');
}

function fmtDec(n, dec=2) {
  return Number(n).toLocaleString('es-VE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen-1)+'…' : str;
}

function hexToRgba(hex, alpha=1) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function interpolateColor(colorA, colorB, t) {
  const a = hexToRgbArr(colorA), b = hexToRgbArr(colorB);
  const r = Math.round(a[0]+(b[0]-a[0])*t);
  const g = Math.round(a[1]+(b[1]-a[1])*t);
  const bl = Math.round(a[2]+(b[2]-a[2])*t);
  return `rgb(${r},${g},${bl})`;
}
function hexToRgbArr(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// Spin animation for refresh button
const styleEl = document.createElement('style');
styleEl.textContent = `
@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin .8s linear infinite; display:inline-block; }
`;
document.head.appendChild(styleEl);
