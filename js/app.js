/* =========================================================================
   SIM-CD  ·  Aplicación (interfaz, controles, KPIs, panel teórico)
   ========================================================================= */

/* ------------------------------------------------------------------
   Esquema de parámetros — genera automáticamente los controles del panel
   ------------------------------------------------------------------ */
const ESQUEMA = [
  { grupo: 'Demanda y clientes', abierto: true, campos: [
    { k: 'nClientes',        l: 'Zonas de cliente',            t: 'range', min: 1, max: 6, step: 1, u: 'zonas', reset: true,
      ayuda: 'Cada zona genera demanda propia y está a distinta distancia del CD.' },
    { k: 'demandaMedia',     l: 'Demanda media por zona',      t: 'range', min: 0, max: 80, step: 1, u: 'u/día',
      ayuda: 'Media (μ) de la demanda diaria de cada zona.' },
    { k: 'demandaSigma',     l: 'Variabilidad de la demanda',  t: 'range', min: 0, max: 40, step: 0.5, u: 'σ u/día',
      ayuda: 'Desviación estándar diaria. Más σ ⇒ más stock de seguridad necesario.' },
    { k: 'distribucion',     l: 'Distribución',                t: 'select',
      op: [['normal', 'Normal'], ['poisson', 'Poisson'], ['constante', 'Determinística']] },
    { k: 'faltantes',        l: 'Tratamiento del faltante',    t: 'select',
      op: [['backorder', 'Backorder (se acumula)'], ['perdida', 'Venta perdida']] }
  ]},

  { grupo: 'Estacionalidad y tendencia', campos: [
    { k: 'estacionalAmplitud', l: 'Amplitud estacional  A',   t: 'range', min: 0, max: 0.8, step: 0.05, u: '',
      ayuda: 'Demanda = μ·(1 + A·sen(2πt/T)). Con A = 0,4 la temporada alta es un 40% sobre la media y la baja un 40% bajo ella.' },
    { k: 'estacionalPeriodo', l: 'Periodo del ciclo  T',      t: 'range', min: 14, max: 365, step: 7, u: 'días' },
    { k: 'patronSemanal',    l: 'Patrón por día de semana',   t: 'select',
      op: [['false', 'No'], ['true', 'Sí (perfil retail)']],
      ayuda: 'Viernes y sábado concentran la demanda (×1,25 y ×1,45); lunes a jueves están bajo la media.' },
    { k: 'tendenciaAnual',   l: 'Tendencia de crecimiento',   t: 'range', min: -50, max: 100, step: 5, u: '%/año' }
  ]},

  { grupo: 'Promociones', campos: [
    { k: 'promoActiva',      l: 'Activar promociones',        t: 'select',
      op: [['false', 'No'], ['true', 'Sí']] },
    { k: 'promoCada',        l: 'Una promoción cada',         t: 'range', min: 7, max: 90, step: 1, u: 'días' },
    { k: 'promoDuracion',    l: 'Duración de la campaña',     t: 'range', min: 1, max: 14, step: 1, u: 'días' },
    { k: 'promoUplift',      l: 'Multiplicador de demanda',   t: 'range', min: 1, max: 8, step: 0.25, u: '×',
      ayuda: 'Cuánto se dispara la demanda durante la campaña.' },
    { k: 'promoResaca',      l: 'Resaca post-promoción',      t: 'range', min: 0, max: 1, step: 0.05, u: '',
      ayuda: 'Fracción de la venta extra que era compra adelantada: después de la campaña la demanda cae bajo lo normal (forward buying).' },
    { k: 'promoInformada',   l: 'El CD conoce el calendario', t: 'select',
      op: [['false', 'No — se entera al ver la demanda'], ['true', 'Sí — planificación colaborativa']],
      ayuda: 'Es la palanca clave: si el CD conoce la promoción, desestacionaliza lo observado y no confunde el peak con un cambio de nivel. Solo tiene efecto si la previsión NO es fija.' },
    { k: 'anticipacion',     l: 'Anticipación de la campaña', t: 'range', min: 0, max: 21, step: 1, u: 'días',
      ayuda: 'Con cuántos días de anticipación el CD empieza a acumular stock para la promoción. Con 0 días, conocer el calendario casi no sirve: la planta no alcanza a fabricar el peak.' }
  ]},

  { grupo: 'Previsión de demanda (CD)', campos: [
    { k: 'prevision',        l: 'Método de previsión',        t: 'select',
      op: [['fija', 'Ninguna — s y Q fijos'],
           ['media_movil', 'Media móvil de N días'],
           ['suavizamiento', 'Suavizamiento exponencial']],
      ayuda: 'Con previsión activa el CD recalcula s, Q y S cada día a partir de lo que observa. Ahí aparece el efecto látigo.' },
    { k: 'ventanaPrevision', l: 'Ventana de la media móvil N', t: 'range', min: 2, max: 60, step: 1, u: 'días',
      ayuda: 'Ventana corta = reacciona rápido y amplifica; ventana larga = estable pero lenta.' },
    { k: 'alfa',             l: 'Suavizamiento  α',           t: 'range', min: 0.05, max: 0.9, step: 0.05, u: '',
      ayuda: 'α alto da más peso al último dato: más reactivo, más látigo.' }
  ]},

  { grupo: 'Política de inventario (CD)', abierto: true, campos: [
    { k: 'politica',         l: 'Política',                    t: 'select',
      op: [['sQ', 'Revisión continua (s, Q)'], ['RS', 'Revisión periódica (R, S)']],
      ayuda: '(s,Q): pide Q cuando la posición de inventario cae bajo s. (R,S): revisa cada R días y sube hasta S.' },
    { k: 'puntoReorden',     l: 'Punto de reorden  s',         t: 'range', min: 0, max: 2000, step: 10, u: 'u', dep: 'sQ' },
    { k: 'cantidadPedido',   l: 'Cantidad de pedido  Q',       t: 'range', min: 50, max: 2000, step: 10, u: 'u', dep: 'sQ' },
    { k: 'periodoRevision',  l: 'Periodo de revisión  R',      t: 'range', min: 1, max: 30, step: 1, u: 'días', dep: 'RS' },
    { k: 'nivelObjetivo',    l: 'Nivel objetivo  S',           t: 'range', min: 100, max: 3000, step: 25, u: 'u', dep: 'RS' },
    { k: 'stockInicialCD',   l: 'Stock inicial del CD',        t: 'range', min: 0, max: 2000, step: 25, u: 'u', reset: true },
    { k: 'capacidadCD',      l: 'Capacidad del CD',            t: 'range', min: 200, max: 4000, step: 50, u: 'u' }
  ]},

  { grupo: 'Planta (producción)', campos: [
    { k: 'capacidadProduccion', l: 'Capacidad de producción',  t: 'range', min: 10, max: 600, step: 5, u: 'u/día',
      ayuda: 'Si es menor que la demanda total diaria, la cadena colapsa tarde o temprano.' },
    { k: 'objetivoStockPlanta', l: 'Stock objetivo en planta', t: 'range', min: 0, max: 3000, step: 50, u: 'u' },
    { k: 'stockInicialPlanta',  l: 'Stock inicial en planta',  t: 'range', min: 0, max: 3000, step: 50, u: 'u', reset: true }
  ]},

  { grupo: 'Transporte y flota', campos: [
    { k: 'camionesReposicion', l: 'Camiones Planta → CD',      t: 'range', min: 1, max: 6, step: 1, u: 'camiones', reset: true },
    { k: 'capacidadCamionRepo',l: 'Capacidad camión de reposición', t: 'range', min: 50, max: 1200, step: 25, u: 'u' },
    { k: 'leadTimeMedio',      l: 'Lead time Planta → CD',     t: 'range', min: 0.5, max: 15, step: 0.5, u: 'días',
      ayuda: 'Tiempo medio de tránsito. Es el motor del stock de seguridad.' },
    { k: 'leadTimeSigma',      l: 'Variabilidad del lead time',t: 'range', min: 0, max: 5, step: 0.1, u: 'σ días' },
    { k: 'camionesReparto',    l: 'Camiones CD → clientes',    t: 'range', min: 1, max: 10, step: 1, u: 'camiones', reset: true },
    { k: 'capacidadCamion',    l: 'Capacidad camión de reparto', t: 'range', min: 20, max: 500, step: 10, u: 'u' },
    { k: 'tiempoViajeCliente', l: 'Tiempo de viaje base',      t: 'range', min: 0.05, max: 3, step: 0.05, u: 'días' },
    { k: 'cargaMinimaPct',     l: 'Carga mínima para despachar', t: 'range', min: 0, max: 100, step: 5, u: '%',
      ayuda: 'Consolidación: con 0% cada pedido sale al instante (rápido y caro); con 100% se espera a llenar el camión (barato y lento).' },
    { k: 'esperaMaxima',       l: 'Espera máxima del pedido',  t: 'range', min: 0, max: 10, step: 1, u: 'días',
      ayuda: 'Vence la regla anterior: pasado este plazo el camión sale igual, aunque vaya a medio llenar.' }
  ]},

  { grupo: 'Costos e ingresos', campos: [
    { k: 'costoMantener',    l: 'Mantener inventario',         t: 'number', step: 0.05, u: '$/u/día' },
    { k: 'costoPedido',      l: 'Emitir una orden',            t: 'number', step: 10, u: '$/orden' },
    { k: 'costoQuiebre',     l: 'Quiebre de stock',            t: 'number', step: 1, u: '$/u/día' },
    { k: 'costoViajeReparto',l: 'Viaje CD → cliente',          t: 'number', step: 10, u: '$/viaje' },
    { k: 'costoViajeRepo',   l: 'Viaje Planta → CD',           t: 'number', step: 10, u: '$/viaje' },
    { k: 'costoProduccion',  l: 'Costo unitario de producción',t: 'number', step: 0.5, u: '$/u' },
    { k: 'costoSetup',       l: 'Setup de producción',         t: 'number', step: 25, u: '$/arranque' },
    { k: 'precioVenta',      l: 'Precio de venta',             t: 'number', step: 0.5, u: '$/u' }
  ]},

  { grupo: 'Simulación', campos: [
    { k: 'horizonte',        l: 'Horizonte',                   t: 'range', min: 30, max: 730, step: 10, u: 'días', reset: true },
    { k: 'semilla',          l: 'Semilla aleatoria',           t: 'number', step: 1, u: '', reset: true,
      ayuda: 'Misma semilla ⇒ misma demanda. Permite comparar políticas de forma justa.' }
  ]}
];

/* ------------------------------------------------------------------
   Escenarios predefinidos
   ------------------------------------------------------------------ */
const ESCENARIOS = {
  base: { nombre: '1 · Base equilibrado', p: {} },
  consolidado: { nombre: '2 · Consolidación de carga',
    p: { cargaMinimaPct: 100, esperaMaxima: 10 } },
  volatil: { nombre: '3 · Demanda volátil',
    p: { demandaSigma: 20, costoQuiebre: 14 } },
  leadlargo: { nombre: '4 · Lead time largo e incierto',
    p: { leadTimeMedio: 8, leadTimeSigma: 2.5 } },
  flotacorta: { nombre: '5 · Flota de reparto insuficiente',
    p: { camionesReparto: 1, capacidadCamion: 60 } },
  jit: { nombre: '6 · Just-in-time agresivo',
    p: { puntoReorden: 120, cantidadPedido: 200, stockInicialCD: 200, costoMantener: 1.2 } },
  cuellobotella: { nombre: '7 · Cuello de botella en planta',
    p: { capacidadProduccion: 70, objetivoStockPlanta: 300 } },
  ventaperdida: { nombre: '8 · Venta perdida (sin backorder)',
    p: { faltantes: 'perdida', costoQuiebre: 20 } },

  // --- Serie didáctica sobre estacionalidad y efecto látigo ---
  estacional: { nombre: '9 · Estacionalidad marcada',
    p: { estacionalAmplitud: 0.45, estacionalPeriodo: 90, patronSemanal: true } },
  promoCiega: { nombre: '10 · Promociones SIN coordinar',
    p: { promoActiva: true, promoCada: 30, promoDuracion: 3, promoUplift: 4,
         promoResaca: 0.6, promoInformada: false,
         prevision: 'suavizamiento', alfa: 0.4, patronSemanal: true } },
  promoCPFR: { nombre: '11 · Promociones coordinadas (CPFR)',
    p: { promoActiva: true, promoCada: 30, promoDuracion: 3, promoUplift: 4,
         promoResaca: 0.6, promoInformada: true,
         prevision: 'suavizamiento', alfa: 0.4, patronSemanal: true } },
  latigo: { nombre: '12 · Látigo máximo',
    p: { promoActiva: true, promoUplift: 5, promoResaca: 0.7, promoInformada: false,
         prevision: 'media_movil', ventanaPrevision: 3,
         estacionalAmplitud: 0.4, patronSemanal: true, demandaSigma: 14 } }
};

/* ------------------------------------------------------------------
   Comparador A/B — indicadores contrastados y su dirección de mejora
   ------------------------------------------------------------------ */
const fmtPct = v => (v * 100).toFixed(1) + '%';
const fmtDin = v => '$' + Math.round(v).toLocaleString('es-CL');
const fmtU   = v => Math.round(v).toLocaleString('es-CL') + ' u';
const fmtX   = v => v.toFixed(2) + '×';
const fmtDia = v => v.toFixed(2) + ' d';
const fmtDin2 = v => '$' + v.toFixed(2);

const COMPARAR = [
  { k: 'fillRate',           l: 'Fill rate',            f: fmtPct,  mejor: 'alto' },
  { k: 'nivelServicioCiclo', l: 'Servicio de ciclo',    f: fmtPct,  mejor: 'alto' },
  { k: 'esperaMedia',        l: 'Espera del pedido',    f: fmtDia,  mejor: 'bajo' },
  { k: 'inventarioProm',     l: 'Inventario promedio',  f: fmtU,    mejor: 'bajo' },
  { k: 'costoTotal',         l: 'Costo total',          f: fmtDin,  mejor: 'bajo' },
  { k: 'costoPorUnidad',     l: 'Costo por unidad',     f: fmtDin2, mejor: 'bajo' },
  { k: 'margen',             l: 'Margen',               f: fmtDin,  mejor: 'alto' },
  { k: 'bullwhip',           l: 'Látigo en el CD',      f: fmtX,    mejor: 'bajo' },
  { k: 'mape',               l: 'Error de previsión',   f: fmtPct,  mejor: 'bajo' },
  { k: 'utilReparto',        l: 'Uso flota de reparto', f: fmtPct,  mejor: 'neutro' }
];

// Etiquetas legibles de cada parámetro, para explicar qué cambió entre A y B
const ETIQUETAS = { nivelServicio: 'Nivel de servicio objetivo' };
ESQUEMA.forEach(g => g.campos.forEach(c => { ETIQUETAS[c.k] = c.l; }));

/* ------------------------------------------------------------------
   Estado de la aplicación
   ------------------------------------------------------------------ */
const App = {
  sim: null,
  params: Object.assign({}, PARAMS_DEFAULT),
  corriendo: false,
  velocidad: 1,         // días por segundo
  ultimoFrame: 0,
  nivelObjetivoServicio: 0.95,
  referencia: null,     // corrida A congelada para comparar
  _ultDia: -1,

  init() {
    this.sim = new Simulacion(this.params);
    Vista.init(document.getElementById('lienzo'));
    this.construirControles();
    this.construirEscenarios();
    this.conectarBotones();
    this.actualizarTodo();
    this.ultimoFrame = performance.now();
    requestAnimationFrame(t => this.bucle(t));
  },

  /* ---------- Construcción del panel de parámetros ---------- */
  construirControles() {
    const cont = document.getElementById('panel-parametros');
    cont.innerHTML = '';

    ESQUEMA.forEach((g, gi) => {
      const det = document.createElement('details');
      det.className = 'grupo';
      if (g.abierto) det.open = true;
      const sum = document.createElement('summary');
      sum.textContent = g.grupo;
      det.appendChild(sum);

      g.campos.forEach(c => {
        const fila = document.createElement('div');
        fila.className = 'campo';
        fila.dataset.dep = c.dep || '';
        fila.dataset.k = c.k;

        const lab = document.createElement('label');
        lab.innerHTML = '<span>' + c.l + '</span>';
        const val = document.createElement('b');
        val.id = 'val-' + c.k;
        lab.appendChild(val);
        fila.appendChild(lab);

        let input;
        if (c.t === 'select') {
          input = document.createElement('select');
          c.op.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o[0]; opt.textContent = o[1];
            input.appendChild(opt);
          });
          input.value = this.params[c.k];
        } else {
          input = document.createElement('input');
          input.type = c.t === 'range' ? 'range' : 'number';
          if (c.min !== undefined) input.min = c.min;
          if (c.max !== undefined) input.max = c.max;
          if (c.step !== undefined) input.step = c.step;
          input.value = this.params[c.k];
        }
        input.id = 'inp-' + c.k;
        input.className = c.t === 'range' ? 'slider' : 'campo-num';

        input.addEventListener('input', () => {
          let v = (c.t === 'select') ? input.value : parseFloat(input.value);
          if (v === 'true') v = true;
          else if (v === 'false') v = false;
          this.params[c.k] = v;
          this.sim.p[c.k] = v;
          this.pintarValor(c);
          this.aplicarDependencias();
          // Si la corrida ya terminó, cualquier cambio obliga a rehacerla:
          // dejar los KPIs de la corrida anterior junto a los parámetros
          // nuevos sería engañoso, sobre todo al comparar A con B.
          if (c.reset || this.sim.terminada) this.reiniciar();
          this.actualizarTeoria();
          this.actualizarGraficos();
        });

        fila.appendChild(input);
        if (c.ayuda) {
          const h = document.createElement('p');
          h.className = 'ayuda';
          h.textContent = c.ayuda;
          fila.appendChild(h);
        }
        det.appendChild(fila);
        this.pintarValor(c);
      });
      cont.appendChild(det);
    });

    // segunda pasada para pintar valores (los nodos ya existen)
    ESQUEMA.forEach(g => g.campos.forEach(c => this.pintarValor(c)));
    this.aplicarDependencias();
  },

  pintarValor(c) {
    const el = document.getElementById('val-' + c.k);
    if (!el) return;
    const v = this.params[c.k];
    if (c.t === 'select') { el.textContent = ''; return; }
    el.textContent = (typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : v) +
      (c.u ? ' ' + c.u : '');
  },

  // Muestra/oculta campos según la política y desactiva los que pasan a
  // ser calculados automáticamente cuando hay previsión de demanda
  aplicarDependencias() {
    const dinamica = this.params.prevision !== 'fija';
    const auto = ['puntoReorden', 'cantidadPedido', 'nivelObjetivo'];

    document.querySelectorAll('.campo').forEach(f => {
      const dep = f.dataset.dep;
      if (dep) f.style.display = (dep === this.params.politica) ? '' : 'none';

      if (auto.indexOf(f.dataset.k) >= 0) {
        f.classList.toggle('bloqueado', dinamica);
        const inp = f.querySelector('input, select');
        if (inp) inp.disabled = dinamica;
      }
      if (f.dataset.k === 'ventanaPrevision')
        f.style.display = this.params.prevision === 'media_movil' ? '' : 'none';
      if (f.dataset.k === 'alfa')
        f.style.display = this.params.prevision === 'suavizamiento' ? '' : 'none';
      if (f.dataset.k === 'promoInformada')
        f.classList.toggle('bloqueado', !dinamica);
      if (f.dataset.k === 'anticipacion')
        f.classList.toggle('bloqueado', !(dinamica && this.params.promoInformada));
    });

    const aviso = document.getElementById('aviso-dinamica');
    if (aviso) aviso.style.display = dinamica ? '' : 'none';
  },

  /* ---------- Escenarios ---------- */
  construirEscenarios() {
    const sel = document.getElementById('escenarios');
    Object.keys(ESCENARIOS).forEach(k => {
      const o = document.createElement('option');
      o.value = k; o.textContent = ESCENARIOS[k].nombre;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      this.params = Object.assign({}, PARAMS_DEFAULT, ESCENARIOS[sel.value].p);
      this.construirControles();
      this.sincronizarNivelServicio();
      this.reiniciar();
    });
  },

  sincronizarNivelServicio() {
    this.nivelObjetivoServicio = this.params.nivelServicio;
    const ns = document.getElementById('nivel-servicio');
    if (ns) ns.value = (this.nivelObjetivoServicio * 100).toFixed(1);
    const et = document.getElementById('val-nivel-servicio');
    if (et) et.textContent = (this.nivelObjetivoServicio * 100).toFixed(1) + '%';
  },

  /* ---------- Botones ---------- */
  conectarBotones() {
    document.getElementById('btn-play').addEventListener('click', () => this.togglePlay());
    document.getElementById('btn-reset').addEventListener('click', () => this.reiniciar());
    document.getElementById('btn-paso').addEventListener('click', () => {
      this.corriendo = false;
      this.sintonizarPlay();
      if (this.sim.terminada) this.sim.reset(this.params);
      this.sim.avanzar(1);
      this.actualizarTodo();
    });
    document.getElementById('btn-fin').addEventListener('click', () => {
      this.corriendo = false;
      this.sintonizarPlay();
      if (this.sim.terminada) this.sim.reset(this.params);   // vuelve a correr
      let guardia = 0;
      while (!this.sim.terminada && guardia++ < 5000) this.sim.avanzar(1);
      this.actualizarTodo();
    });
    document.getElementById('btn-optimo').addEventListener('click', () => this.aplicarOptimo());
    document.getElementById('btn-csv').addEventListener('click', () => this.descargarCSV());
    document.getElementById('btn-fijar').addEventListener('click', () => this.fijarReferencia());
    document.getElementById('btn-refijar').addEventListener('click', () => this.fijarReferencia());
    document.getElementById('btn-quitar').addEventListener('click', () => this.quitarReferencia());
    document.getElementById('btn-csv-comp')
      .addEventListener('click', () => this.descargarCSVComparacion());

    const vel = document.getElementById('velocidad');
    vel.addEventListener('input', () => {
      this.velocidad = parseFloat(vel.value);
      document.getElementById('val-velocidad').textContent = this.velocidad.toFixed(1) + '×';
    });

    const ns = document.getElementById('nivel-servicio');
    ns.addEventListener('input', () => {
      this.nivelObjetivoServicio = parseFloat(ns.value) / 100;
      // el motor lo usa para recalcular s y S cuando la política es dinámica
      this.params.nivelServicio = this.nivelObjetivoServicio;
      this.sim.p.nivelServicio = this.nivelObjetivoServicio;
      document.getElementById('val-nivel-servicio').textContent =
        (this.nivelObjetivoServicio * 100).toFixed(1) + '%';
      this.actualizarTeoria();
      this.actualizarGraficos();
    });

    document.addEventListener('keydown', e => {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
        e.preventDefault(); this.togglePlay();
      }
    });
  },

  togglePlay() {
    if (this.sim.terminada) this.reiniciar();
    this.corriendo = !this.corriendo;
    this.sintonizarPlay();
  },

  sintonizarPlay() {
    const b = document.getElementById('btn-play');
    b.textContent = this.corriendo ? '⏸  Pausar' : '▶  Simular';
    b.classList.toggle('activo', this.corriendo);
  },

  reiniciar() {
    this.sim.reset(this.params);
    this.corriendo = false;
    this.sintonizarPlay();
    this.actualizarTodo();
  },

  /* ---------- Aplicar valores óptimos del modelo teórico ---------- */
  aplicarOptimo() {
    const th = this.sim.teoria(this.nivelObjetivoServicio);
    this.params.cantidadPedido = Math.max(50, Math.round(th.EOQ / 10) * 10);
    this.params.puntoReorden = Math.max(0, Math.round(th.ROP / 10) * 10);
    this.params.nivelObjetivo = Math.max(100, Math.round(th.S / 25) * 25);
    ['cantidadPedido', 'puntoReorden', 'nivelObjetivo'].forEach(k => {
      const i = document.getElementById('inp-' + k);
      if (i) i.value = this.params[k];
    });
    ESQUEMA.forEach(g => g.campos.forEach(c => this.pintarValor(c)));
    this.reiniciar();
  },

  /* ---------- Bucle de animación ---------- */
  bucle(ts) {
    const dt = Math.min(0.1, (ts - this.ultimoFrame) / 1000);
    this.ultimoFrame = ts;

    if (this.corriendo && !this.sim.terminada) {
      this.sim.avanzar(dt * this.velocidad);
      this.actualizarKPIs();
      this.actualizarEventos();
      // los gráficos solo se redibujan cuando cambia el día, no en cada frame
      if (this.sim.dia !== this._ultDia) {
        this._ultDia = this.sim.dia;
        this.actualizarGraficos();
        this.actualizarComparacion();
      }
      if (this.sim.terminada) { this.corriendo = false; this.sintonizarPlay(); this.actualizarTodo(); }
    }
    Vista.dibujar(this.sim);
    requestAnimationFrame(t => this.bucle(t));
  },

  actualizarTodo() {
    this._ultDia = this.sim.dia;
    this.actualizarKPIs();
    this.actualizarGraficos();
    this.actualizarTeoria();
    this.actualizarEventos();
    this.actualizarComparacion();
  },

  /* ---------- KPIs ---------- */
  actualizarKPIs() {
    const k = this.sim.kpis();
    const pct = v => (v * 100).toFixed(1) + '%';
    const din = v => '$' + Math.round(v).toLocaleString('es-CL');

    const tarjetas = [
      { id: 'k-fill',   v: pct(k.fillRate),
        est: k.fillRate >= 0.95 ? 'ok' : k.fillRate >= 0.85 ? 'warn' : 'bad' },
      { id: 'k-ciclo',  v: pct(k.nivelServicioCiclo),
        est: k.nivelServicioCiclo >= 0.9 ? 'ok' : k.nivelServicioCiclo >= 0.7 ? 'warn' : 'bad' },
      { id: 'k-espera', v: k.esperaMedia.toFixed(2) + ' días',
        est: k.esperaMedia <= 1.5 ? 'ok' : k.esperaMedia <= 3 ? 'warn' : 'bad' },
      { id: 'k-pend',   v: Math.round(k.pendiente + k.perdido) + ' u',
        est: (k.pendiente + k.perdido) > 0 ? 'warn' : 'ok' },
      { id: 'k-inv',    v: Math.round(k.inventarioProm) + ' u', est: 'neutro' },
      { id: 'k-cob',    v: k.diasCobertura.toFixed(1) + ' días',
        est: k.diasCobertura > 25 ? 'warn' : 'ok' },
      { id: 'k-rot',    v: k.rotacion.toFixed(1) + '×', est: 'neutro' },
      { id: 'k-costo',  v: din(k.costoTotal), est: 'neutro' },
      { id: 'k-cu',     v: '$' + k.costoPorUnidad.toFixed(2), est: 'neutro' },
      { id: 'k-margen', v: din(k.margen), est: k.margen >= 0 ? 'ok' : 'bad' },
      { id: 'k-flota',  v: pct(k.utilReparto),
        est: k.utilReparto > 0.9 ? 'bad' : k.utilReparto > 0.75 ? 'warn' : 'ok' },
      { id: 'k-repo',   v: pct(k.utilRepo),
        est: k.utilRepo > 0.9 ? 'bad' : k.utilRepo > 0.75 ? 'warn' : 'ok' },
      { id: 'k-planta', v: pct(k.utilPlanta),
        est: k.utilPlanta > 0.95 ? 'bad' : 'ok' },
      { id: 'k-bullwhip', v: k.bullwhip.toFixed(2) + '×',
        est: k.bullwhip > 2 ? 'bad' : k.bullwhip > 1.3 ? 'warn' : 'ok' },
      { id: 'k-bwplanta', v: k.bullwhipPlanta.toFixed(2) + '×',
        est: k.bullwhipPlanta > 2 ? 'bad' : k.bullwhipPlanta > 1.3 ? 'warn' : 'ok' },
      { id: 'k-mape',   v: pct(k.mape),
        est: k.mape < 0.15 ? 'ok' : k.mape < 0.35 ? 'warn' : 'bad' },
      { id: 'k-sdin',   v: Math.round(k.sDin) + ' u', est: 'neutro' }
    ];

    tarjetas.forEach(t => {
      const el = document.getElementById(t.id);
      if (!el) return;
      el.textContent = t.v;
      el.className = 'kpi-valor ' + t.est;
    });

    document.getElementById('progreso').style.width =
      (100 * k.dia / k.horizonte).toFixed(1) + '%';
    document.getElementById('etiqueta-dia').textContent =
      'Día ' + k.dia + ' de ' + k.horizonte;
  },

  /* ---------- Gráficos ---------- */
  // Índices del histórico que caen dentro de una promoción
  diasPromo() {
    if (!this.params.promoActiva) return [];
    const h = this.sim.hist, out = [];
    for (let i = 0; i < h.dia.length; i++) if (this.sim.enPromo(h.dia[i])) out.push(i);
    return out;
  },

  actualizarGraficos() {
    const h = this.sim.hist, p = this.params;
    const promo = this.diasPromo();
    const dinamica = p.prevision !== 'fija';
    const ref = this.referencia;
    const GRIS = '#94a3b8';

    // --- Inventario en el CD ---
    const serieInv = [
      { nombre: 'Inventario CD', datos: h.invCD, color: '#38bdf8', area: true },
      { nombre: 'En tránsito', datos: h.enTransito, color: '#c4b5fd', grosor: 1.5 },
      { nombre: 'Pendiente clientes', datos: h.pendientes, color: '#f87171', grosor: 1.5 }
    ];
    if (ref) serieInv.unshift({ nombre: 'Inventario CD (A)', datos: ref.hist.invCD,
      color: GRIS, grosor: 1.4, dash: true });
    const opcInv = { marcados: promo };
    if (dinamica && p.politica === 'sQ') {
      // con previsión, s se mueve todos los días: se dibuja como serie
      serieInv.push({ nombre: 's recalculado', datos: h.sDin, color: '#fbbf24', grosor: 1.3 });
    } else {
      opcInv.lineas = p.politica === 'sQ'
        ? [{ y: p.puntoReorden, color: '#fbbf24', etiqueta: 's = punto de reorden' }]
        : [{ y: p.nivelObjetivo, color: '#fbbf24', etiqueta: 'S = nivel objetivo' }];
    }
    Grafico.linea(document.getElementById('g-inventario'), serieInv, opcInv);

    // --- Demanda, previsión y órdenes ---
    const serieDem = [
      { nombre: 'Demanda real', datos: h.demanda, color: '#34d399', grosor: 1.6 },
      { nombre: 'Órdenes del CD', datos: h.ordenes, color: '#fb923c', grosor: 1.6 }
    ];
    if (dinamica)
      serieDem.push({ nombre: 'Previsión del CD', datos: h.prevision, color: '#e879f9', grosor: 1.3 });
    if (ref) serieDem.unshift({ nombre: 'Órdenes CD (A)', datos: ref.hist.ordenes,
      color: GRIS, grosor: 1.4, dash: true });
    Grafico.linea(document.getElementById('g-demanda'), serieDem, { marcados: promo });

    // --- Amplificación por etapa (efecto látigo) ---
    const k = this.sim.kpis();
    const ka = ref ? ref.kpis : null;
    Grafico.barras(document.getElementById('g-latigo'), [
      { nombre: 'Demanda clientes', valor: k.cvDemanda, color: '#34d399',
        ref: ka ? ka.cvDemanda : null },
      { nombre: 'Órdenes del CD', valor: k.cvOrdenes, color: '#fb923c',
        ref: ka ? ka.cvOrdenes : null },
      { nombre: 'Producción planta', valor: k.cvProduccion, color: '#a78bfa',
        ref: ka ? ka.cvProduccion : null }
    ], {
      margenIzq: 108, reservaEtiqueta: 118,
      fmt: v => 'CV ' + v.toFixed(2) +
        (k.cvDemanda > 0 ? '   ×' + (v / k.cvDemanda).toFixed(2) : '')
    });

    const serieServ = [
      { nombre: 'Fill rate acumulado (%)', datos: h.fillDiario.map(v => v * 100),
        color: '#4ade80', area: true }
    ];
    if (ref) serieServ.unshift({ nombre: 'Fill rate (A)',
      datos: ref.hist.fillDiario.map(v => v * 100), color: GRIS, grosor: 1.4, dash: true });
    // La línea de referencia es el fill rate ESPERADO por la fórmula, no el
    // objetivo de servicio de ciclo: son dos definiciones distintas y el
    // tipo 2 siempre queda por encima del tipo 1.
    const fillEsp = this.sim.teoria(this.nivelObjetivoServicio).fillEsperado * 100;
    Grafico.linea(document.getElementById('g-servicio'), serieServ,
      { desdeCero: false, marcados: promo,
         lineas: [{ y: fillEsp, color: '#fbbf24', etiqueta: 'fill esperado por la fórmula' }] });

    const c = this.sim.costos, ca = ref ? ref.costos : null;
    Grafico.barras(document.getElementById('g-costos'), [
      { nombre: 'Producción', valor: c.produccion, color: '#a78bfa', ref: ca && ca.produccion },
      { nombre: 'Transporte', valor: c.transporte, color: '#38bdf8', ref: ca && ca.transporte },
      { nombre: 'Mantener inv.', valor: c.mantener, color: '#34d399', ref: ca && ca.mantener },
      { nombre: 'Quiebre', valor: c.quiebre, color: '#f87171', ref: ca && ca.quiebre },
      { nombre: 'Emisión orden', valor: c.pedido, color: '#fbbf24', ref: ca && ca.pedido },
      { nombre: 'Setup', valor: c.setup, color: '#fb923c', ref: ca && ca.setup }
    ]);
  },

  /* ---------- Panel teórico ---------- */
  actualizarTeoria() {
    const th = this.sim.teoria(this.nivelObjetivoServicio);
    const p = this.params;
    const f = (x, d) => Number(x).toFixed(d === undefined ? 1 : d);

    // Aclara qué mide este objetivo y si llega o no al simulador
    const aclaracionTipo =
      'Ojo con las dos definiciones: este objetivo es <b>tipo 1</b> (probabilidad de no ' +
      'quebrar durante un ciclo de reposición) y el KPI <b>Fill rate</b> es <b>tipo 2</b> ' +
      '(fracción de la demanda con stock al llegar). El tipo 2 siempre sale más alto: ' +
      'aquí un objetivo de ' + f(th.beta * 100, 0) + '% implica un fill rate de ' +
      f(th.fillEsperado * 100, 1) + '%.';

    document.getElementById('nota-ns').innerHTML = (p.prevision === 'fija'
      ? 'Con <b>s</b> y <b>Q</b> fijos, este objetivo solo alimenta las fórmulas de abajo: ' +
        'moverlo no cambia la simulación. Para llevarlo al simulador pulsa ' +
        '<b>Aplicar valores óptimos</b>, o activa una previsión de demanda para que el CD ' +
        'lo use día a día. '
      : 'La previsión está activa: el CD usa este objetivo <b>cada día</b> para recalcular ' +
        's y S. Moverlo sí cambia la simulación. ') + aclaracionTipo;

    const filas = [
      ['Demanda total esperada  D', f(th.D, 1) + ' u/día',
        th.estacional ? 'μ·n·f̄, con f̄ = ' + f(th.fMedio, 2) : 'μ · n'],
      ['Desv. estándar diaria  σ<sub>d</sub>', f(th.sigmaD, 1) + ' u',
        th.estacional ? 'ley de la varianza total' : ''],
      ['σ durante el lead time  σ<sub>LT</sub>', f(th.sigmaLT, 1) + ' u',
        'σ<sub>LT</sub> = √(L·σ<sub>d</sub>² + D²·σ<sub>L</sub>²)'],
      ['Factor de servicio  z', f(th.z, 2),
        'z = Φ⁻¹(' + f(th.beta * 100, 0) + '%) · servicio de ciclo'],
      ['Lote económico  Q*', th.EOQ + ' u', 'Q* = √(2·D·K / h)'],
      ['Stock de seguridad  SS', th.SS + ' u', 'SS = z · σ<sub>LT</sub>'],
      ['Sub-disparo por revisión', f(th.undershoot, 0) + ' u', 'D·R/2 con R = ' + th.R + ' día(s)'],
      ['Punto de reorden  s*', th.ROP + ' u', 's* = D·L + SS + D·R/2'],
      ['Nivel objetivo  S*', th.S + ' u', 'S* = D·(L+R) + z·σ<sub>L+R</sub>'],
      ['Fill rate esperado con tu (s,Q)', f(th.fillEsperado * 100, 1) + '%',
        '1 − σ<sub>LT</sub>·G(z)/Q'],
      ['Utilización teórica de planta', f(th.utilPlantaTeorica * 100, 1) + '%', 'ρ = D / capacidad'],
      ['Costo diario teórico (EOQ+SS)', '$' + f(th.costoDiarioTeorico, 0), '(Q/2 + SS)·h + (D/Q)·K']
    ];

    document.getElementById('tabla-teoria').innerHTML =
      filas.map(r => '<tr><td>' + r[0] + '</td><td class="num">' + r[1] +
        '</td><td class="form">' + r[2] + '</td></tr>').join('');

    // Comparación con lo que eligió el estudiante
    const comp = [];
    const k = this.sim.kpis();

    if (p.prevision === 'fija') {
      if (p.politica === 'sQ') {
        comp.push(this._delta('Q elegido', p.cantidadPedido, th.EOQ, 'u'));
        comp.push(this._delta('s elegido', p.puntoReorden, th.ROP, 'u'));
      } else {
        comp.push(this._delta('S elegido', p.nivelObjetivo, th.S, 'u'));
      }
    } else {
      comp.push('<li class="bien">Política dinámica: el CD está usando ' +
        'hoy s = <b>' + Math.round(k.sDin) + ' u</b> y Q = <b>' + Math.round(k.QDin) +
        ' u</b>, recalculados con su propia previsión.</li>');
    }

    // Diagnóstico del patrón determinístico
    if (th.estacional) {
      const pesoPct = (th.pesoPatron * 100).toFixed(0);
      comp.push('<li class="' + (th.pesoPatron > 0.5 ? 'mal' : 'medio') + '">' +
        'El <b>' + pesoPct + '%</b> de la variabilidad diaria viene del patrón ' +
        '(estacionalidad, día de semana, promociones), no del azar. Es variabilidad ' +
        '<b>predecible</b>: cubrirla con stock de seguridad es caro e innecesario.</li>');
      comp.push('<li class="medio">Las fórmulas EOQ y ROP suponen demanda ' +
        '<b>estacionaria</b>. Con este patrón dan un promedio que sobra en temporada ' +
        'baja y falta en la alta: úsalas como referencia, no como respuesta.</li>');
    }

    // Diagnóstico del efecto látigo
    if (k.dia > 14) {
      const amp = k.bullwhip;
      const clase = amp > 2 ? 'mal' : amp > 1.3 ? 'medio' : 'bien';
      comp.push('<li class="' + clase + '">Amplificación CD: <b>' + amp.toFixed(2) +
        '×</b> · planta: <b>' + k.bullwhipPlanta.toFixed(2) + '×</b>. ' +
        (amp > 1.3
          ? 'La cadena amplifica. Prueba bajar α o ampliar la ventana de previsión, ' +
            'reducir Q, o informar el calendario de promociones al CD.'
          : 'La señal viaja sin amplificarse de forma relevante.') + '</li>');
    }
    if (p.promoActiva && p.prevision !== 'fija' && !p.promoInformada) {
      comp.push('<li class="mal">El CD <b>no conoce</b> el calendario de promociones: ' +
        'confunde cada peak con un cambio de nivel y sobre-reacciona. Compara el ' +
        'escenario 10 con el 11.</li>');
    }
    if (p.promoActiva && p.prevision !== 'fija' && p.promoInformada) {
      const capacidadPico = p.capacidadProduccion;
      const picoDemanda = th.D / th.fMedio * p.promoUplift;
      comp.push('<li class="' + (p.anticipacion >= 3 ? 'bien' : 'medio') + '">' +
        'Durante la campaña la demanda llega a <b>' + f(picoDemanda, 0) + ' u/día</b> y la ' +
        'planta solo produce <b>' + capacidadPico + ' u/día</b>. Conocer el calendario no ' +
        'basta: hay que <b>pre-construir</b> stock antes. Sube la anticipación ' +
        '(hoy ' + p.anticipacion + ' días) y observa dónde deja de convenir.</li>');
    }
    if (th.utilPlantaTeorica > 1) {
      comp.push('<li class="mal">La capacidad de la planta (' + p.capacidadProduccion +
        ' u/día) es menor que la demanda (' + f(th.D, 0) +
        ' u/día): el sistema es inestable.</li>');
    }
    const capFlota = p.camionesReparto * p.capacidadCamion /
      (2 * p.tiempoViajeCliente);
    if (capFlota < th.D) {
      comp.push('<li class="mal">La flota mueve ≈' + f(capFlota, 0) +
        ' u/día y la demanda es ' + f(th.D, 0) + ' u/día: falta capacidad de reparto.</li>');
    } else {
      comp.push('<li class="bien">Capacidad de reparto ≈' + f(capFlota, 0) +
        ' u/día ≥ demanda ' + f(th.D, 0) + ' u/día.</li>');
    }
    document.getElementById('lista-comparacion').innerHTML = comp.join('');
  },

  _delta(nombre, actual, optimo, u) {
    const d = optimo > 0 ? (actual - optimo) / optimo : 0;
    const cls = Math.abs(d) < 0.15 ? 'bien' : Math.abs(d) < 0.4 ? 'medio' : 'mal';
    const signo = d >= 0 ? '+' : '';
    return '<li class="' + cls + '">' + nombre + ': <b>' + actual + ' ' + u +
      '</b> vs óptimo <b>' + optimo + ' ' + u + '</b> (' + signo +
      (d * 100).toFixed(0) + '%)</li>';
  },

  /* ==================================================================
     COMPARADOR A / B
     Congela la corrida actual como referencia A. Al cambiar parámetros y
     volver a simular, los gráficos superponen A en gris punteado y la
     tabla muestra la diferencia indicador por indicador.
     ================================================================== */

  // Nombre honesto de la configuración actual: si el estudiante tocó algo
  // después de elegir un escenario, se marca como modificado.
  nombreEscenario() {
    const sel = document.getElementById('escenarios');
    const opt = sel.options[sel.selectedIndex];
    if (!opt) return 'Configuración propia';
    const base = Object.assign({}, PARAMS_DEFAULT, ESCENARIOS[sel.value].p);
    const tocado = Object.keys(this.params)
      .some(k => String(base[k]) !== String(this.params[k]));
    return opt.textContent + (tocado ? ' · modificado' : '');
  },

  fijarReferencia() {
    // Si no se ha simulado nada, se corre el horizonte completo primero
    if (this.sim.dia === 0) {
      let guardia = 0;
      while (!this.sim.terminada && guardia++ < 5000) this.sim.avanzar(1);
      this.corriendo = false;
      this.sintonizarPlay();
    }
    const s = this.sim, h = s.hist;
    this.referencia = {
      nombre: this.nombreEscenario(),
      dia: s.dia,
      params: JSON.parse(JSON.stringify(this.params)),
      kpis: s.kpis(),
      costos: Object.assign({}, s.costos),
      hist: {
        invCD: h.invCD.slice(),
        ordenes: h.ordenes.slice(),
        demanda: h.demanda.slice(),
        fillDiario: h.fillDiario.slice(),
        costoAcum: h.costoAcum.slice()
      }
    };
    this.actualizarTodo();
  },

  quitarReferencia() {
    this.referencia = null;
    this.actualizarTodo();
  },

  actualizarComparacion() {
    const ref = this.referencia;
    document.getElementById('comp-vacio').style.display = ref ? 'none' : '';
    document.getElementById('comp-lleno').style.display = ref ? '' : 'none';
    if (!ref) return;

    const a = ref.kpis, b = this.sim.kpis();

    document.getElementById('comp-encabezado').innerHTML =
      '<b>A</b> · ' + ref.nombre + ' <span class="dia">(día ' + ref.dia + ')</span><br>' +
      '<b>B</b> · ' + this.nombreEscenario() + ' <span class="dia">(día ' + b.dia + ')</span>';

    // --- Avisos de comparación injusta ---
    const avisos = [];
    if (ref.params.semilla !== this.params.semilla)
      avisos.push('Las semillas son distintas (' + ref.params.semilla + ' vs ' +
        this.params.semilla + '): parte de la diferencia es azar, no tu decisión.');
    if (ref.dia !== b.dia)
      avisos.push('A llegó al día ' + ref.dia + ' y B va en el ' + b.dia +
        '. Corre B hasta el mismo día antes de sacar conclusiones.');
    if (ref.params.horizonte !== this.params.horizonte)
      avisos.push('Los horizontes de simulación son distintos.');
    const av = document.getElementById('comp-aviso');
    av.style.display = avisos.length ? '' : 'none';
    av.innerHTML = avisos.join(' ');

    // --- Tabla de indicadores ---
    const filas = COMPARAR.map(c => {
      const va = a[c.k] || 0, vb = b[c.k] || 0, d = vb - va;
      const rel = va !== 0 ? d / Math.abs(va) : (d !== 0 ? 1 : 0);
      let clase = 'igual';
      if (Math.abs(rel) > 0.005 && c.mejor !== 'neutro')
        clase = (c.mejor === 'alto' ? d > 0 : d < 0) ? 'mejor' : 'peor';
      const signo = d >= 0 ? '+' : '−';
      return '<tr><td>' + c.l + '</td><td class="num">' + c.f(va) +
        '</td><td class="num">' + c.f(vb) + '</td><td class="num ' + clase + '">' +
        (Math.abs(rel) < 0.005 ? '=' : signo + c.f(Math.abs(d))) + '</td></tr>';
    });
    document.getElementById('tabla-comparacion').innerHTML =
      '<tr class="cab"><td>Indicador</td><td class="num">A</td>' +
      '<td class="num">B</td><td class="num">Δ</td></tr>' + filas.join('');

    // --- Qué parámetros cambiaron ---
    const difs = [];
    Object.keys(this.params).forEach(k => {
      if (String(ref.params[k]) !== String(this.params[k]))
        difs.push('<li>' + (ETIQUETAS[k] || k) + ': <b>' + ref.params[k] +
          '</b> → <b>' + this.params[k] + '</b></li>');
    });
    document.getElementById('comp-diff').innerHTML = difs.length
      ? '<p class="nota">Qué cambió en B respecto de A:</p><ul class="difs">' +
        difs.join('') + '</ul>'
      : '<p class="nota">B usa exactamente los mismos parámetros que A.</p>';
  },

  descargarCSVComparacion() {
    const A = this.referencia, B = this.sim.hist;
    if (!A) return;
    const n = Math.max(A.hist.demanda.length, B.demanda.length);
    const col = (arr, i, dec) => arr[i] === undefined ? ''
      : (dec ? arr[i].toFixed(dec) : Math.round(arr[i]));
    const filas = [];
    for (let i = 0; i < n; i++) {
      filas.push([i + 1,
        col(A.hist.demanda, i), col(A.hist.ordenes, i), col(A.hist.invCD, i),
        col(A.hist.fillDiario, i, 4), col(A.hist.costoAcum, i, 2),
        col(B.demanda, i), col(B.ordenes, i), col(B.invCD, i),
        col(B.fillDiario, i, 4), col(B.costoAcum, i, 2)
      ].join(','));
    }
    const cab = 'dia,demanda_A,orden_A,inv_cd_A,fill_A,costo_A,' +
                'demanda_B,orden_B,inv_cd_B,fill_B,costo_B';
    this._bajar([cab].concat(filas).join('\n'), 'comparacion_A_vs_B.csv');
  },

  /* ---------- Bitácora de eventos ---------- */
  actualizarEventos() {
    const cont = document.getElementById('bitacora');
    cont.innerHTML = this.sim.eventos.slice(0, 14).map(e =>
      '<div class="evento ' + e.tipo + '"><span>d' + e.dia + '</span>' + e.msg + '</div>'
    ).join('');
  },

  /* ---------- Exportar CSV ---------- */
  descargarCSV() {
    this._bajar(this.sim.csv(), 'simulacion_cd_dia' + this.sim.dia + '.csv');
  },

  _bajar(texto, nombre) {
    const blob = new Blob([texto], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }
};

// La página de pruebas reutiliza ESCENARIOS y PARAMS_DEFAULT sin montar la interfaz
window.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('lienzo')) App.init();
});
