/* =========================================================================
   SIM-CD  ·  Batería de pruebas del motor de simulación
   -------------------------------------------------------------------------
   Se abre con pruebas.html. No toca la interfaz principal: crea sus propias
   instancias de Simulacion y verifica invariantes, determinismo, propiedades
   del modelo, coherencia con la teoría y casos borde.
   ========================================================================= */

const Pruebas = {
  resultados: [],
  _grupo: '',

  grupo(nombre) { this._grupo = nombre; },

  prueba(nombre, fn) {
    let r;
    const t0 = performance.now();
    try {
      r = fn();
      if (r === undefined) r = { ok: true, detalle: '' };
    } catch (e) {
      r = { ok: false, detalle: 'Excepción: ' + (e && e.message ? e.message : e) };
    }
    r.ms = performance.now() - t0;
    r.grupo = this._grupo;
    r.nombre = nombre;
    this.resultados.push(r);
    return r;
  },

  resumen() {
    const total = this.resultados.length;
    const ok = this.resultados.filter(r => r.ok).length;
    return { total: total, ok: ok, fallan: total - ok };
  }
};

/* ---------- Utilidades ---------- */

// Corre una simulación completa con los parámetros dados
function correr(pars, dias) {
  const s = new Simulacion(Object.assign({}, PARAMS_DEFAULT, pars || {}));
  const H = dias || s.p.horizonte;
  let g = 0;
  while (!s.terminada && s.dia < H && g++ < 20000) s.avanzar(1);
  return s;
}

// Unidades físicas cargadas en camiones de reparto (en ruta hacia el cliente)
function enReparto(s) {
  return s.camiones.filter(c => c.tipo === 'reparto').reduce((a, c) => a + c.carga, 0);
}

// Balance físico: todo lo que entró al sistema debe estar en algún lugar
function balanceUnidades(s) {
  const entradas = s.p.stockInicialPlanta + s.p.stockInicialCD + s.planta.producidoTotal;
  const salidas = s.planta.stock + s.cd.enTransito + s.cd.stock +
                  enReparto(s) + s.tot.entregado;
  return entradas - salidas;
}

// Balance de demanda: todo lo pedido fue servido, perdido o sigue pendiente
function balanceDemanda(s) {
  return s.tot.demanda - (s.tot.servido + s.tot.perdido + s.pendienteClientes());
}

const ok = (detalle) => ({ ok: true, detalle: detalle || '' });
const mal = (detalle) => ({ ok: false, detalle: detalle });
const afirmar = (cond, detalle) => cond ? ok(detalle) : mal(detalle);
const num = (x, d) => Number(x).toFixed(d === undefined ? 2 : d);
const finito = (x) => typeof x === 'number' && isFinite(x);

/* =========================================================================
   GRUPO 1 · Invariantes de conservación
   Son las pruebas más importantes: si el motor pierde o inventa unidades,
   todos los indicadores mienten.
   ========================================================================= */
Pruebas.grupo('1 · Conservación');

Pruebas.prueba('Las unidades físicas se conservan (escenario base)', () => {
  const s = correr({});
  const d = balanceUnidades(s);
  return afirmar(Math.abs(d) < 1e-6,
    'Descuadre = ' + d + ' u · producido ' + s.planta.producidoTotal +
    ', entregado ' + s.tot.entregado);
});

Pruebas.prueba('Las unidades se conservan día a día, no solo al final', () => {
  const s = new Simulacion(Object.assign({}, PARAMS_DEFAULT, { horizonte: 120 }));
  let peor = 0, diaPeor = 0;
  while (!s.terminada) {
    s.avanzar(1);
    const d = Math.abs(balanceUnidades(s));
    if (d > peor) { peor = d; diaPeor = s.dia; }
  }
  return afirmar(peor < 1e-6, 'Descuadre máximo ' + peor + ' u en el día ' + diaPeor);
});

Pruebas.prueba('Las unidades se conservan en los 12 escenarios', () => {
  const malos = [];
  Object.keys(ESCENARIOS).forEach(k => {
    const s = correr(ESCENARIOS[k].p);
    const d = balanceUnidades(s);
    if (Math.abs(d) > 1e-6) malos.push(ESCENARIOS[k].nombre + ' (' + d + ')');
  });
  return afirmar(malos.length === 0, malos.length ? malos.join('; ') : '12 escenarios cuadran');
});

Pruebas.prueba('La demanda cuadra: pedida = servida + perdida + pendiente', () => {
  const malos = [];
  ['base', 'ventaperdida', 'promoCiega', 'cuellobotella'].forEach(k => {
    const s = correr(ESCENARIOS[k].p);
    const d = balanceDemanda(s);
    if (Math.abs(d) > 1e-6) malos.push(ESCENARIOS[k].nombre + ' (' + d + ')');
  });
  return afirmar(malos.length === 0, malos.length ? malos.join('; ') : 'cuadra en 4 escenarios');
});

Pruebas.prueba('Lo servido menos lo entregado es exactamente la carga en ruta', () => {
  const s = correr({}, 97);
  const d = s.tot.servido - s.tot.entregado - enReparto(s);
  return afirmar(Math.abs(d) < 1e-6, 'Diferencia = ' + d + ' u');
});

Pruebas.prueba('Ningún inventario se vuelve negativo', () => {
  const s = new Simulacion(Object.assign({}, PARAMS_DEFAULT, ESCENARIOS.jit.p));
  let minCD = Infinity, minPlanta = Infinity;
  while (!s.terminada) {
    s.avanzar(1);
    minCD = Math.min(minCD, s.cd.stock);
    minPlanta = Math.min(minPlanta, s.planta.stock);
  }
  return afirmar(minCD >= -1e-9 && minPlanta >= -1e-9,
    'mín CD = ' + num(minCD) + ' u · mín planta = ' + num(minPlanta) + ' u');
});

Pruebas.prueba('Ningún camión excede su capacidad', () => {
  const s = new Simulacion(Object.assign({}, PARAMS_DEFAULT, { camionesReparto: 2 }));
  let excesos = 0, maxRep = 0, maxRepo = 0;
  while (!s.terminada) {
    s.avanzar(0.25);
    s.camiones.forEach(c => {
      const cap = c.tipo === 'repo' ? s.p.capacidadCamionRepo : s.p.capacidadCamion;
      if (c.carga > cap + 1e-9) excesos++;
      if (c.tipo === 'repo') maxRepo = Math.max(maxRepo, c.carga);
      else maxRep = Math.max(maxRep, c.carga);
    });
  }
  return afirmar(excesos === 0,
    'Excesos: ' + excesos + ' · carga máx reparto ' + maxRep + '/' + s.p.capacidadCamion +
    ', reposición ' + maxRepo + '/' + s.p.capacidadCamionRepo);
});

Pruebas.prueba('Todos los costos son no negativos y no decrecen', () => {
  const s = new Simulacion(Object.assign({}, PARAMS_DEFAULT));
  let previo = 0, fallos = 0;
  while (!s.terminada) {
    s.avanzar(1);
    const t = s.costoTotal();
    if (t < previo - 1e-9) fallos++;
    previo = t;
    Object.keys(s.costos).forEach(k => { if (s.costos[k] < -1e-9) fallos++; });
  }
  return afirmar(fallos === 0, 'Costo total final $' + Math.round(previo).toLocaleString('es-CL'));
});

/* =========================================================================
   GRUPO 2 · Determinismo y robustez numérica
   ========================================================================= */
Pruebas.grupo('2 · Determinismo');

Pruebas.prueba('Misma semilla produce resultados idénticos', () => {
  const a = correr({ semilla: 7 }).kpis();
  const b = correr({ semilla: 7 }).kpis();
  const difs = Object.keys(a).filter(k => finito(a[k]) && Math.abs(a[k] - b[k]) > 1e-9);
  return afirmar(difs.length === 0,
    difs.length ? 'Difieren: ' + difs.join(', ') : 'Los ' + Object.keys(a).length + ' KPI coinciden');
});

Pruebas.prueba('Semillas distintas producen resultados distintos', () => {
  const a = correr({ semilla: 7 }).kpis();
  const b = correr({ semilla: 8 }).kpis();
  return afirmar(Math.abs(a.costoTotal - b.costoTotal) > 1,
    'Costo con semilla 7 = $' + Math.round(a.costoTotal).toLocaleString('es-CL') +
    ' · con semilla 8 = $' + Math.round(b.costoTotal).toLocaleString('es-CL'));
});

Pruebas.prueba('El resultado no depende del tamaño del paso (múltiplos de 0,05)', () => {
  const pasos = [1, 0.5, 0.25, 0.05];
  const refs = pasos.map(dt => {
    const s = new Simulacion(Object.assign({}, PARAMS_DEFAULT));
    let g = 0;
    while (!s.terminada && g++ < 100000) s.avanzar(dt);
    return s.kpis();
  });
  const base = refs[0];
  const difs = [];
  refs.slice(1).forEach((r, i) => {
    const e = Math.abs(r.costoTotal - base.costoTotal) / Math.max(1, base.costoTotal);
    if (e > 1e-9) difs.push('dt=' + pasos[i + 1] + ' difiere ' + (e * 100).toFixed(4) + '%');
  });
  return afirmar(difs.length === 0,
    difs.length ? difs.join('; ') : 'Idéntico con dt = 1 / 0,5 / 0,25 / 0,05');
});

Pruebas.prueba('El avance animado (dt variable) coincide con "Al final"', () => {
  const alFinal = correr({}).kpis();
  // imita requestAnimationFrame: pasos irregulares de 8 a 50 ms a 3 días/seg
  const s = new Simulacion(Object.assign({}, PARAMS_DEFAULT));
  const rng = mulberry32(999);
  let g = 0;
  while (!s.terminada && g++ < 500000) s.avanzar((0.008 + rng() * 0.042) * 3);
  const anim = s.kpis();
  const eCosto = Math.abs(anim.costoTotal - alFinal.costoTotal) / alFinal.costoTotal;
  const eFill = Math.abs(anim.fillRate - alFinal.fillRate);
  return afirmar(eCosto < 0.02 && eFill < 0.01,
    'Costo difiere ' + (eCosto * 100).toFixed(3) + '% · fill rate difiere ' +
    (eFill * 100).toFixed(3) + ' pts');
});

Pruebas.prueba('Ningún KPI es NaN o infinito en los 12 escenarios', () => {
  const malos = [];
  Object.keys(ESCENARIOS).forEach(k => {
    const kp = correr(ESCENARIOS[k].p).kpis();
    Object.keys(kp).forEach(kk => {
      if (typeof kp[kk] === 'number' && !isFinite(kp[kk]))
        malos.push(ESCENARIOS[k].nombre + '.' + kk);
    });
  });
  return afirmar(malos.length === 0, malos.length ? malos.join(', ') : '12 escenarios limpios');
});

Pruebas.prueba('El panel teórico nunca devuelve NaN', () => {
  const casos = [
    { nombre: 'base', p: {} },
    { nombre: 'demanda cero', p: { demandaMedia: 0, demandaSigma: 0 } },
    { nombre: 'sigma cero', p: { demandaSigma: 0 } },
    { nombre: 'determinística', p: { distribucion: 'constante' } },
    { nombre: 'poisson', p: { distribucion: 'poisson' } },
    { nombre: 'costo mantener mínimo', p: { costoMantener: 0.05 } },
    { nombre: 'promo + estacionalidad', p: ESCENARIOS.latigo.p },
    { nombre: 'tendencia -50% en 730 d', p: { tendenciaAnual: -50, horizonte: 730 } }
  ];
  const malos = [];
  casos.forEach(c => {
    const s = new Simulacion(Object.assign({}, PARAMS_DEFAULT, c.p));
    const t = s.teoria(0.95);
    Object.keys(t).forEach(k => {
      if (typeof t[k] === 'number' && !isFinite(t[k])) malos.push(c.nombre + '.' + k);
    });
  });
  return afirmar(malos.length === 0, malos.length ? malos.join(', ') : casos.length + ' casos limpios');
});

/* =========================================================================
   GRUPO 3 · Propiedades del modelo
   Si el simulador va a enseñar, tiene que responder en la dirección correcta.
   ========================================================================= */
Pruebas.grupo('3 · Propiedades');

Pruebas.prueba('Más camiones de reparto ⇒ menor espera del pedido', () => {
  const e = [1, 2, 3, 5].map(n =>
    correr({ camionesReparto: n, cargaMinimaPct: 50, esperaMaxima: 2 }).kpis().esperaMedia);
  let monotona = true;
  for (let i = 1; i < e.length; i++) if (e[i] > e[i - 1] + 1e-9) monotona = false;
  return afirmar(monotona, '1→' + num(e[0]) + ' d, 2→' + num(e[1]) +
    ' d, 3→' + num(e[2]) + ' d, 5→' + num(e[3]) + ' d');
});

Pruebas.prueba('Mayor punto de reorden ⇒ más inventario y mejor servicio', () => {
  const s = [150, 300, 450, 600].map(v => correr({ puntoReorden: v }).kpis());
  let invSube = true, servSube = true;
  for (let i = 1; i < s.length; i++) {
    if (s[i].inventarioProm < s[i - 1].inventarioProm - 1e-6) invSube = false;
    if (s[i].nivelServicioCiclo < s[i - 1].nivelServicioCiclo - 1e-6) servSube = false;
  }
  return afirmar(invSube && servSube,
    'inv: ' + s.map(x => Math.round(x.inventarioProm)).join(' → ') +
    ' u · servicio: ' + s.map(x => (x.nivelServicioCiclo * 100).toFixed(0)).join(' → ') + '%');
});

Pruebas.prueba('Mayor lead time ⇒ peor nivel de servicio (con s fijo)', () => {
  const f = [1, 3, 6, 10].map(L => correr({ leadTimeMedio: L }).kpis().fillRate);
  let baja = true;
  for (let i = 1; i < f.length; i++) if (f[i] > f[i - 1] + 1e-9) baja = false;
  return afirmar(baja, 'L=1→' + (f[0] * 100).toFixed(1) + '%, L=3→' + (f[1] * 100).toFixed(1) +
    '%, L=6→' + (f[2] * 100).toFixed(1) + '%, L=10→' + (f[3] * 100).toFixed(1) + '%');
});

Pruebas.prueba('Mayor variabilidad de demanda ⇒ peor servicio (con s fijo)', () => {
  const f = [0, 8, 16, 24].map(sg => correr({ demandaSigma: sg }).kpis().nivelServicioCiclo);
  return afirmar(f[0] >= f[3] - 1e-9,
    'σ=0→' + (f[0] * 100).toFixed(0) + '%, σ=8→' + (f[1] * 100).toFixed(0) +
    '%, σ=16→' + (f[2] * 100).toFixed(0) + '%, σ=24→' + (f[3] * 100).toFixed(0) + '%');
});

Pruebas.prueba('Con previsión activa, mayor nivel de servicio objetivo ⇒ más inventario', () => {
  const base = { prevision: 'media_movil', ventanaPrevision: 14 };
  const inv = [0.80, 0.90, 0.95, 0.99].map(ns =>
    correr(Object.assign({}, base, { nivelServicio: ns })).kpis().inventarioProm);
  let sube = true;
  for (let i = 1; i < inv.length; i++) if (inv[i] < inv[i - 1] - 1e-6) sube = false;
  return afirmar(sube, inv.map(v => Math.round(v)).join(' → ') + ' u');
});

Pruebas.prueba('Conocer el calendario de promociones reduce el error de previsión', () => {
  const p = Object.assign({}, ESCENARIOS.promoCiega.p);
  const ciego = correr(p).kpis();
  const informado = correr(Object.assign({}, p, { promoInformada: true })).kpis();
  return afirmar(informado.mape < ciego.mape,
    'ciego ' + (ciego.mape * 100).toFixed(1) + '% → informado ' +
    (informado.mape * 100).toFixed(1) + '%');
});

Pruebas.prueba('Previsión más reactiva (α alto) ⇒ más efecto látigo', () => {
  const p = { promoActiva: true, promoUplift: 4, prevision: 'suavizamiento' };
  const b = [0.1, 0.3, 0.6, 0.9].map(a =>
    correr(Object.assign({}, p, { alfa: a })).kpis().bullwhip);
  return afirmar(b[3] > b[0],
    'α=0,1→' + num(b[0]) + '×, α=0,3→' + num(b[1]) + '×, α=0,6→' + num(b[2]) +
    '×, α=0,9→' + num(b[3]) + '×');
});

Pruebas.prueba('Consolidar carga baja el costo de transporte y sube la espera', () => {
  const suelto = correr({ cargaMinimaPct: 0, esperaMaxima: 0 });
  const junto = correr({ cargaMinimaPct: 100, esperaMaxima: 10 });
  const a = suelto.kpis(), b = junto.kpis();
  return afirmar(junto.costos.transporte < suelto.costos.transporte &&
                 b.esperaMedia > a.esperaMedia,
    'transporte $' + Math.round(suelto.costos.transporte).toLocaleString('es-CL') + ' → $' +
    Math.round(junto.costos.transporte).toLocaleString('es-CL') +
    ' · espera ' + num(a.esperaMedia) + ' → ' + num(b.esperaMedia) + ' d');
});

Pruebas.prueba('Si la planta no da abasto, el sistema se vuelve inestable', () => {
  const k = correr({ capacidadProduccion: 60 }).kpis();   // demanda = 100 u/día
  return afirmar(k.fillRate < 0.9 && k.pendiente > 500,
    'fill ' + (k.fillRate * 100).toFixed(1) + '% · pendiente ' + Math.round(k.pendiente) + ' u');
});

/* =========================================================================
   GRUPO 4 · Coherencia con el modelo analítico
   ========================================================================= */
Pruebas.grupo('4 · Teoría vs simulación');

// Configuración sin restricciones de capacidad: la política de inventario
// es lo único que limita el servicio, que es lo que la fórmula supone.
const HOLGADO = {
  capacidadProduccion: 400, objetivoStockPlanta: 2500, stockInicialPlanta: 2000,
  camionesReposicion: 4, capacidadCamionRepo: 800,
  camionesReparto: 6, capacidadCamion: 200,
  cargaMinimaPct: 0, esperaMaxima: 0,
  capacidadCD: 9999, horizonte: 500, leadTimeSigma: 0
};

Pruebas.prueba('El fill rate simulado sigue al de la fórmula 1 − σ_LT·G(z)/Q', () => {
  const filas = [];
  let peor = 0;
  [250, 320, 400, 480].forEach(s0 => {
    const sim = correr(Object.assign({}, HOLGADO, { puntoReorden: s0, cantidadPedido: 400 }));
    const teo = sim.teoria(0.95).fillEsperado;
    const real = sim.kpis().fillRate;
    peor = Math.max(peor, Math.abs(teo - real));
    filas.push('s=' + s0 + ': teoría ' + (teo * 100).toFixed(1) +
      '% vs real ' + (real * 100).toFixed(1) + '%');
  });
  return afirmar(peor < 0.05, 'Error máx ' + (peor * 100).toFixed(2) + ' pts · ' + filas.join(' | '));
});

Pruebas.prueba('El punto de reorden teórico entrega el servicio que promete', () => {
  const filas = [];
  let peor = 0;
  [0.85, 0.95, 0.99].forEach(beta => {
    const cfg = Object.assign({}, HOLGADO);
    const s0 = new Simulacion(Object.assign({}, PARAMS_DEFAULT, cfg));
    const t = s0.teoria(beta);
    // se aplican los valores óptimos, igual que el botón de la interfaz
    const sim = correr(Object.assign({}, cfg,
      { puntoReorden: t.ROP, cantidadPedido: t.EOQ }));
    const real = sim.kpis().fillRate;
    peor = Math.max(peor, beta - real);      // solo penaliza quedarse corto
    filas.push('objetivo ' + (beta * 100).toFixed(0) + '% (s*=' + t.ROP +
      ', Q*=' + t.EOQ + ') → real ' + (real * 100).toFixed(1) + '%');
  });
  return afirmar(peor < 0.05, 'Déficit máx ' + (peor * 100).toFixed(2) +
    ' pts · ' + filas.join(' | '));
});

Pruebas.prueba('El fill rate (tipo 2) siempre supera al servicio de ciclo (tipo 1)', () => {
  const filas = [];
  let malos = 0;
  [0.70, 0.85, 0.95, 0.99].forEach(beta => {
    const s0 = new Simulacion(Object.assign({}, PARAMS_DEFAULT, HOLGADO));
    const t = s0.teoria(beta);
    const k = correr(Object.assign({}, HOLGADO,
      { puntoReorden: t.ROP, cantidadPedido: t.EOQ })).kpis();
    if (k.fillRate < beta) malos++;
    filas.push('tipo 1 ' + (beta * 100).toFixed(0) + '% ⇒ fill ' +
      (k.fillRate * 100).toFixed(1) + '%');
  });
  return afirmar(malos === 0, filas.join(' | '));
});

Pruebas.prueba('El sub-disparo medido coincide con D·R/2', () => {
  const cfg = Object.assign({}, HOLGADO, { puntoReorden: 250, cantidadPedido: 400 });
  const s = new Simulacion(Object.assign({}, PARAMS_DEFAULT, cfg));
  const ips = [];
  const orig = s._revisarInventario.bind(s);
  s._revisarInventario = function () {
    const antes = this.posicionInventario();
    const q = orig();
    if (q > 0) ips.push(antes);
    return q;
  };
  while (!s.terminada) s.avanzar(1);
  const real = 250 - Est.media(ips);
  const teorico = s.teoria(0.95).undershoot;
  return afirmar(Math.abs(real - teorico) / teorico < 0.25,
    'medido ' + num(real, 1) + ' u vs teórico D·R/2 = ' + num(teorico, 1) +
    ' u (' + ips.length + ' órdenes)');
});

Pruebas.prueba('La utilización de planta simulada coincide con ρ = D / capacidad', () => {
  const filas = [];
  let peor = 0;
  [200, 260, 350].forEach(cap => {
    const sim = correr(Object.assign({}, HOLGADO, { capacidadProduccion: cap }));
    const teo = sim.teoria(0.95).utilPlantaTeorica;
    const real = sim.kpis().utilPlanta;
    peor = Math.max(peor, Math.abs(teo - real));
    filas.push('cap=' + cap + ': ' + (teo * 100).toFixed(1) + '% vs ' + (real * 100).toFixed(1) + '%');
  });
  return afirmar(peor < 0.05, 'Error máx ' + (peor * 100).toFixed(2) + ' pts · ' + filas.join(' | '));
});

Pruebas.prueba('El EOQ está cerca del Q que minimiza mantención + emisión', () => {
  const cfg = Object.assign({}, HOLGADO, { puntoReorden: 600 });
  const eoq = new Simulacion(Object.assign({}, PARAMS_DEFAULT, cfg)).teoria(0.95).EOQ;
  let mejorQ = 0, mejorC = Infinity;
  const barrido = [];
  for (let Q = 100; Q <= 1200; Q += 100) {
    const s = correr(Object.assign({}, cfg, { cantidadPedido: Q }));
    // solo los dos costos que el EOQ balancea
    const c = s.costos.mantener + s.costos.pedido;
    barrido.push(Q + ':' + Math.round(c / 1000) + 'k');
    if (c < mejorC) { mejorC = c; mejorQ = Q; }
  }
  const error = Math.abs(mejorQ - eoq) / eoq;
  return afirmar(error < 0.5,
    'EOQ teórico ' + eoq + ' u · mínimo del barrido en Q=' + mejorQ +
    ' (' + (error * 100).toFixed(0) + '% de diferencia) · ' + barrido.join(' '));
});

Pruebas.prueba('Se cumple la ley de Little: W = L / λ', () => {
  const s = correr({});
  const k = s.kpis();
  const L = Est.media(s.hist.pendientes);          // pendiente promedio
  const lambda = s.tot.demanda / s.dia;            // tasa de llegada
  const W = L / lambda;
  return afirmar(Math.abs(W - k.esperaMedia) < 1e-6,
    'L = ' + num(L) + ' u, λ = ' + num(lambda) + ' u/día ⇒ W = ' + num(W, 4) +
    ' d (KPI: ' + num(k.esperaMedia, 4) + ' d)');
});

Pruebas.prueba('El stock de seguridad crece con el nivel de servicio exigido', () => {
  const s = new Simulacion(Object.assign({}, PARAMS_DEFAULT));
  const ss = [0.80, 0.90, 0.95, 0.99].map(b => s.teoria(b).SS);
  let sube = true;
  for (let i = 1; i < ss.length; i++) if (ss[i] <= ss[i - 1]) sube = false;
  return afirmar(sube, '80%→' + ss[0] + ' u, 90%→' + ss[1] + ' u, 95%→' + ss[2] +
    ' u, 99%→' + ss[3] + ' u');
});

Pruebas.prueba('Φ y Φ⁻¹ son consistentes entre sí', () => {
  let peor = 0;
  for (let p = 0.01; p < 0.999; p += 0.01) {
    const e = Math.abs(Est.phi(Est.invPhi(p)) - p);
    peor = Math.max(peor, e);
  }
  return afirmar(peor < 5e-4, 'Error máximo ' + peor.toExponential(2));
});

/* =========================================================================
   GRUPO 5 · Casos borde
   ========================================================================= */
Pruebas.grupo('5 · Casos borde');

Pruebas.prueba('Funciona con una sola zona de cliente', () => {
  const s = correr({ nClientes: 1 });
  const k = s.kpis();
  return afirmar(finito(k.fillRate) && Math.abs(balanceUnidades(s)) < 1e-6,
    'fill ' + (k.fillRate * 100).toFixed(1) + '% · balance OK');
});

Pruebas.prueba('Funciona con seis zonas de cliente', () => {
  const s = correr({ nClientes: 6 });
  const k = s.kpis();
  return afirmar(finito(k.fillRate) && Math.abs(balanceUnidades(s)) < 1e-6,
    'fill ' + (k.fillRate * 100).toFixed(1) + '% · demanda ' + k.demandaTotal + ' u');
});

Pruebas.prueba('Soporta demanda cero sin dividir por cero', () => {
  const s = correr({ demandaMedia: 0, demandaSigma: 0 });
  const k = s.kpis();
  const malos = Object.keys(k).filter(x => typeof k[x] === 'number' && !isFinite(k[x]));
  return afirmar(malos.length === 0 && k.demandaTotal === 0,
    malos.length ? 'NaN en: ' + malos.join(', ') : 'demanda 0, KPI finitos');
});

Pruebas.prueba('Soporta demanda determinística (σ = 0)', () => {
  const s = correr({ demandaSigma: 0, distribucion: 'constante' });
  const k = s.kpis();
  return afirmar(finito(k.fillRate) && k.demandaTotal === 25 * 4 * s.dia,
    'demanda total ' + k.demandaTotal + ' u (esperado ' + (25 * 4 * s.dia) + ')');
});

Pruebas.prueba('El horizonte mínimo (30 días) no rompe las series', () => {
  const s = correr({ horizonte: 30 });
  const k = s.kpis();
  return afirmar(s.hist.dia.length === 30 && finito(k.bullwhip),
    'días registrados ' + s.hist.dia.length + ' · látigo ' + num(k.bullwhip) + '×');
});

Pruebas.prueba('El horizonte máximo (730 días) se mantiene estable', () => {
  const s = correr({ horizonte: 730 });
  return afirmar(s.hist.dia.length === 730 && Math.abs(balanceUnidades(s)) < 1e-6,
    '730 días · balance ' + balanceUnidades(s));
});

Pruebas.prueba('Una campaña más larga que su periodo no deja la promoción fija', () => {
  const s = new Simulacion(Object.assign({}, PARAMS_DEFAULT,
    { promoActiva: true, promoCada: 7, promoDuracion: 14, promoUplift: 3 }));
  let enPromo = 0;
  for (let d = 0; d < 70; d++) if (s.enPromo(d)) enPromo++;
  return afirmar(enPromo < 70,
    enPromo + ' de 70 días en promoción (duración 14 > periodo 7)');
});

Pruebas.prueba('La resaca nunca genera demanda negativa', () => {
  let minF = Infinity;
  [[8, 1], [5, 1], [3, 0.9]].forEach(c => {
    const s = new Simulacion(Object.assign({}, PARAMS_DEFAULT,
      { promoActiva: true, promoUplift: c[0], promoResaca: c[1], promoCada: 14, promoDuracion: 3 }));
    for (let d = 0; d < 60; d++) minF = Math.min(minF, s.factorDemanda(d));
  });
  return afirmar(minF >= 0, 'Factor mínimo de demanda = ' + num(minF, 3));
});

Pruebas.prueba('Un solo camión de reparto no rompe la conservación', () => {
  const s = correr({ camionesReparto: 1, capacidadCamion: 40 });
  return afirmar(Math.abs(balanceUnidades(s)) < 1e-6 && Math.abs(balanceDemanda(s)) < 1e-6,
    'balance físico ' + balanceUnidades(s) + ' · balance demanda ' + balanceDemanda(s));
});

Pruebas.prueba('La revisión periódica (R,S) respeta su cadencia', () => {
  // Las revisiones arrancan el primer día simulado, así que lo que debe
  // cumplirse es el ESPACIADO entre órdenes, no que caigan en múltiplos de R.
  const s = correr({ politica: 'RS', periodoRevision: 10, prevision: 'fija' });
  const dias = s.hist.ordenes
    .map((q, i) => q > 0 ? s.hist.dia[i] : -1).filter(d => d >= 0);
  const huecos = [];
  for (let i = 1; i < dias.length; i++) huecos.push(dias[i] - dias[i - 1]);
  const malos = huecos.filter(h => h % 10 !== 0);
  return afirmar(dias.length > 5 && malos.length === 0,
    dias.length + ' órdenes desde el día ' + dias[0] +
    ' · espaciados múltiplos de 10' + (malos.length ? ' · irregulares: ' + malos.join(',') : ''));
});

Pruebas.prueba('El CSV tiene una fila por día y columnas consistentes', () => {
  const s = correr({ horizonte: 60 });
  const lineas = s.csv().split('\n');
  const nCols = lineas[0].split(',').length;
  const malas = lineas.slice(1).filter(l => l.split(',').length !== nCols);
  return afirmar(lineas.length === 61 && malas.length === 0,
    lineas.length - 1 + ' filas de datos · ' + nCols + ' columnas · ' +
    malas.length + ' filas mal formadas');
});

/* =========================================================================
   Ejecución y presentación
   ========================================================================= */
window.addEventListener('DOMContentLoaded', () => {
  const r = Pruebas.resumen();
  const cont = document.getElementById('resultados');
  let grupoActual = '';
  let html = '';

  Pruebas.resultados.forEach(t => {
    if (t.grupo !== grupoActual) {
      grupoActual = t.grupo;
      html += '<h2 class="grupo-titulo">' + grupoActual + '</h2>';
    }
    html += '<div class="prueba ' + (t.ok ? 'pasa' : 'falla') + '">' +
      '<div class="marca">' + (t.ok ? '✓' : '✕') + '</div>' +
      '<div class="cuerpo"><b>' + t.nombre + '</b>' +
      (t.detalle ? '<span class="detalle">' + t.detalle + '</span>' : '') + '</div>' +
      '<div class="ms">' + Math.round(t.ms) + ' ms</div></div>';
  });

  cont.innerHTML = html;
  const res = document.getElementById('resumen');
  res.className = 'resumen ' + (r.fallan === 0 ? 'todo-bien' : 'hay-fallas');
  res.innerHTML = r.fallan === 0
    ? '<b>' + r.ok + ' / ' + r.total + '</b> pruebas superadas'
    : '<b>' + r.fallan + '</b> de ' + r.total + ' pruebas fallan';

  window.RESULTADO_PRUEBAS = {
    total: r.total, ok: r.ok, fallan: r.fallan,
    fallas: Pruebas.resultados.filter(t => !t.ok)
      .map(t => t.nombre + ' → ' + t.detalle)
  };
});
