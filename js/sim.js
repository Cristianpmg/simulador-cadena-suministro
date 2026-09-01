/* =========================================================================
   SIM-CD  ·  Motor de simulación de cadena de suministro
   Planta  →  Centro de Distribución (CD)  →  Clientes
   -------------------------------------------------------------------------
   Modelo: avance por pasos de tiempo (time-step) con reloj continuo para las
   animaciones y eventos discretos al inicio de cada día.
   Unidad de tiempo: DÍA.  Unidad de flujo: UNIDAD de producto.
   ========================================================================= */

/* ------------------------------------------------------------------
   1. Generador aleatorio con semilla (reproducibilidad de escenarios)
   ------------------------------------------------------------------ */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------
   2. Utilidades estadísticas
   ------------------------------------------------------------------ */
const Est = {
  rng: Math.random,

  normal(mu, sigma) {
    let u = 0, v = 0;
    while (u === 0) u = Est.rng();
    while (v === 0) v = Est.rng();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mu + sigma * z;
  },

  poisson(lambda) {
    if (lambda <= 0) return 0;
    if (lambda > 30) return Math.max(0, Math.round(Est.normal(lambda, Math.sqrt(lambda))));
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= Est.rng(); } while (p > L);
    return k - 1;
  },

  // Función error (aproximación Abramowitz & Stegun 7.1.26)
  erf(x) {
    const s = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
          a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const t = 1 / (1 + p * x);
    const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return s * y;
  },

  // Φ(z): probabilidad acumulada normal estándar
  phi(z) { return 0.5 * (1 + Est.erf(z / Math.SQRT2)); },

  // Φ⁻¹(p): inversa normal estándar (algoritmo de Acklam)
  invPhi(p) {
    if (p <= 0) return -6;
    if (p >= 1) return 6;
    const a = [-39.6968302866538, 220.946098424521, -275.928510446969,
               138.357751867269, -30.6647980661472, 2.50662827745924];
    const b = [-54.4760987982241, 161.585836858041, -155.698979859887,
               66.8013118877197, -13.2806815528857];
    const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184,
               -2.54973253934373, 4.37466414146497, 2.93816398269878];
    const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
    const pl = 0.02425;
    let q, r;
    if (p < pl) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
             ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p <= 1 - pl) {
      q = p - 0.5; r = q * q;
      return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
             (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    }
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  },

  // G(z): función de pérdida normal unitaria — usada para el fill rate teórico
  lossFn(z) {
    const pdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
    return pdf - z * (1 - Est.phi(z));
  },

  media(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; },

  varianza(a) {
    if (a.length < 2) return 0;
    const m = Est.media(a);
    return a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1);
  },

  desv(a) { return Math.sqrt(Est.varianza(a)); }
};

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Perfil típico de retail por día de la semana (lunes = 0). Promedia 1.0
const PESOS_SEMANA = [0.85, 0.80, 0.85, 0.95, 1.25, 1.45, 0.85];
const DIAS_SEMANA = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

/* ------------------------------------------------------------------
   3. Parámetros por defecto del modelo
   ------------------------------------------------------------------ */
const PARAMS_DEFAULT = {
  // --- Demanda y clientes ---
  nClientes: 4,
  demandaMedia: 25,          // unidades/día por cliente
  demandaSigma: 8,           // desviación estándar diaria
  distribucion: 'normal',    // 'normal' | 'poisson' | 'constante'
  faltantes: 'backorder',    // 'backorder' | 'perdida'

  // --- Patrón determinístico de la demanda ---
  estacionalAmplitud: 0,     // A: amplitud relativa de la onda estacional (0 = sin ciclo)
  estacionalPeriodo: 90,     // T: días de un ciclo completo
  patronSemanal: false,      // perfil típico de retail por día de la semana
  tendenciaAnual: 0,         // % de crecimiento anual de la demanda base

  // --- Promociones ---
  promoActiva: false,
  promoCada: 30,             // cada cuántos días arranca una promoción
  promoDuracion: 3,          // días que dura
  promoUplift: 3,            // multiplicador de la demanda durante la promoción
  promoResaca: 0.5,          // fracción del extra que se "roba" a los días siguientes
  promoInformada: false,     // el CD conoce el calendario (colaboración tipo CPFR)
  anticipacion: 5,           // días antes de la campaña en que empieza a acumular stock

  // --- Previsión de demanda del CD ---
  prevision: 'fija',         // 'fija' | 'media_movil' | 'suavizamiento'
  ventanaPrevision: 14,      // N días de la media móvil
  alfa: 0.3,                 // α del suavizamiento exponencial
  nivelServicio: 0.95,       // objetivo de la política dinámica y del panel teórico

  // --- Política de inventario del CD ---
  politica: 'sQ',            // 'sQ' (revisión continua) | 'RS' (revisión periódica)
  puntoReorden: 420,         // s
  cantidadPedido: 400,       // Q
  periodoRevision: 7,        // R (días)
  nivelObjetivo: 1100,       // S
  stockInicialCD: 600,
  capacidadCD: 1800,

  // --- Planta ---
  capacidadProduccion: 160,  // unidades/día
  objetivoStockPlanta: 900,  // política de reposición interna de la planta
  stockInicialPlanta: 700,

  // --- Transporte ---
  camionesReposicion: 2,     // Planta → CD
  capacidadCamionRepo: 500,
  leadTimeMedio: 3,          // días de viaje Planta → CD
  leadTimeSigma: 0.6,
  camionesReparto: 4,        // CD → Clientes
  capacidadCamion: 120,
  tiempoViajeCliente: 0.45,  // días de viaje base (se escala por distancia)
  cargaMinimaPct: 60,        // no sale un camión con menos de este % de su capacidad…
  esperaMaxima: 1,           // …salvo que el pedido lleve esperando estos días

  // --- Costos e ingresos ---
  costoMantener: 0.45,       // $/unidad/día
  costoPedido: 250,          // $/orden emitida a la planta
  costoQuiebre: 9,           // $/unidad pendiente/día (o por unidad perdida)
  costoViajeReparto: 130,    // $/viaje CD → cliente
  costoViajeRepo: 420,       // $/viaje Planta → CD
  costoProduccion: 10,       // $/unidad
  costoSetup: 500,           // $/arranque de producción
  precioVenta: 26,           // $/unidad entregada

  // --- Simulación ---
  horizonte: 180,            // días
  semilla: 42
};

/* ------------------------------------------------------------------
   4. Clase principal de simulación
   ------------------------------------------------------------------ */
class Simulacion {

  constructor(params) {
    this.p = Object.assign({}, PARAMS_DEFAULT, params || {});
    this.reset();
  }

  /* ---------- Reinicio completo del estado ---------- */
  reset(params) {
    if (params) this.p = Object.assign({}, this.p, params);
    const p = this.p;

    Est.rng = mulberry32(p.semilla);

    this.t = 0;              // reloj continuo (días)
    this.dia = 0;            // día entero en curso
    this.terminada = false;

    this.planta = {
      stock: p.stockInicialPlanta,
      producidoTotal: 0,
      produccionAyer: 0,
      arranques: 0,
      ordenes: []            // órdenes del CD pendientes de despacho
    };

    this.cd = {
      stock: p.stockInicialCD,
      enTransito: 0,
      ordenesEmitidas: 0,
      recibidoTotal: 0,
      despachadoTotal: 0
    };

    // Clientes con distintas distancias al CD (factor 0.6 a 1.4)
    this.clientes = [];
    for (let i = 0; i < p.nClientes; i++) {
      const f = p.nClientes === 1 ? 1 : 0.6 + 0.8 * (i / (p.nClientes - 1));
      this.clientes.push({
        id: i,
        nombre: 'Zona ' + String.fromCharCode(65 + i),
        distancia: f,
        pendiente: 0,
        demandaTotal: 0,
        entregadoTotal: 0,
        perdidoTotal: 0,
        espera: 0,           // días que lleva con pedido sin servir
        recibiendo: 0        // intensidad del "flash" al recibir (animación)
      });
    }

    this.camiones = [];
    for (let i = 0; i < p.camionesReposicion; i++)
      this.camiones.push(this._nuevoCamion('repo', i));
    for (let i = 0; i < p.camionesReparto; i++)
      this.camiones.push(this._nuevoCamion('reparto', i));

    this.costos = { mantener: 0, pedido: 0, quiebre: 0, transporte: 0, produccion: 0, setup: 0 };
    this.tot = {
      demanda: 0,        // unidades pedidas por los clientes
      cubiertoInmediato: 0, // unidades con stock disponible al llegar el pedido
      servido: 0,        // unidades asignadas desde el stock del CD (a un camión)
      entregado: 0,      // unidades que llegaron físicamente al cliente
      perdido: 0,
      ingresos: 0,
      unidadDias: 0,     // unidad·día de espera (ley de Little)
      diasConQuiebre: 0
    };

    this.hist = {
      dia: [], invCD: [], invPlanta: [], enTransito: [],
      demanda: [], entregas: [], ordenes: [], pendientes: [],
      fillDiario: [], costoAcum: [],
      produccion: [], prevision: [], sDin: []
    };

    // --- estado de la previsión de demanda del CD ---
    this.Dhat = p.demandaMedia * p.nClientes;              // D̂: demanda diaria estimada
    this.sigmaHat = Math.sqrt(p.nClientes) * p.demandaSigma; // σ̂
    this.MAD = this.sigmaHat / 1.25;
    this.obs = [];                 // demanda observada (desestacionalizada si corresponde)
    this.pronosticoHoy = this.Dhat;
    this.errAbs = 0; this.errReal = 0;
    this.factorHoy = 1;
    this.horizonteHoy = p.leadTimeMedio;
    this.sDin = p.puntoReorden;    // s, Q y S efectivos (fijos o recalculados)
    this.QDin = p.cantidadPedido;
    this.SDin = p.nivelObjetivo;

    this.eventos = [];
    this.proximaRevision = 0;
    // acumuladores camión·día ocupado, separados por flota
    this._diasReparto = 0;
    this._diasRepo = 0;

    this._log('Simulación reiniciada · semilla ' + p.semilla, 'info');
  }

  _nuevoCamion(tipo, idx) {
    return {
      id: tipo + '-' + idx,
      tipo: tipo,
      estado: 'libre',       // 'libre' | 'yendo' | 'volviendo'
      carga: 0,
      destino: null,
      prog: 0,
      dur: 1,
      carril: idx
    };
  }

  _log(msg, tipo) {
    this.eventos.unshift({ dia: this.dia, msg: msg, tipo: tipo || 'info' });
    if (this.eventos.length > 60) this.eventos.pop();
  }

  /* ---------- Métricas auxiliares ---------- */
  pendienteClientes() { return this.clientes.reduce((s, c) => s + c.pendiente, 0); }

  ordenesAbiertas() { return this.planta.ordenes.reduce((s, o) => s + o.restante, 0); }

  // Posición de inventario = disponible + en tránsito + pendiente de envío − backorders
  posicionInventario() {
    return this.cd.stock + this.cd.enTransito + this.ordenesAbiertas() - this.pendienteClientes();
  }

  camionesLibres(tipo) {
    return this.camiones.filter(c => c.tipo === tipo && c.estado === 'libre');
  }

  /* ==================================================================
     AVANCE CONTINUO — mueve camiones y dispara el día al cruzar el entero
     ================================================================== */
  // Wrapper público: subdivide el avance en pasos pequeños para que el
  // resultado sea idéntico corriendo animado o en modo "al final".
  avanzar(dt) {
    const MAX = 0.05;
    let restante = dt, guardia = 0;
    while (restante > 1e-9 && !this.terminada && guardia++ < 200000) {
      const paso = Math.min(MAX, restante);
      this._paso(paso);
      restante -= paso;
    }
  }

  _paso(dt) {
    if (this.terminada) return;
    const p = this.p;

    while (Math.floor(this.t + dt) > this.dia && !this.terminada) {
      const resto = (this.dia + 1) - this.t;
      this._moverCamiones(resto);
      this.t = this.dia + 1;
      dt -= resto;
      this.dia++;
      this._nuevoDia();
      if (this.dia >= p.horizonte) {
        this.terminada = true;
        this._log('Horizonte alcanzado (' + p.horizonte + ' días)', 'ok');
        return;
      }
    }
    if (dt > 0) { this._moverCamiones(dt); this.t += dt; }

    // decaimiento del destello visual en los clientes
    for (const c of this.clientes) c.recibiendo = Math.max(0, c.recibiendo - dt * 4);
  }

  _moverCamiones(dt) {
    let liberados = false;
    for (const cam of this.camiones) {
      if (cam.estado === 'libre') continue;
      // solo se contabiliza el tiempo realmente ocupado dentro de este paso
      const usado = Math.min(dt, Math.max(0, (1 - cam.prog) * cam.dur));
      if (cam.tipo === 'repo') this._diasRepo += usado; else this._diasReparto += usado;
      cam.prog += dt / cam.dur;
      if (cam.prog < 1) continue;

      if (cam.estado === 'yendo') {
        // --- llegada al destino ---
        if (cam.tipo === 'repo') {
          this.cd.stock += cam.carga;
          this.cd.enTransito -= cam.carga;
          this.cd.recibidoTotal += cam.carga;
          this._log('Llega reposición de ' + Math.round(cam.carga) + ' u al CD', 'ok');
        } else {
          const cli = this.clientes[cam.destino];
          if (cli) {
            cli.entregadoTotal += cam.carga;
            cli.recibiendo = 1;
          }
          this.tot.entregado += cam.carga;
          this.tot.ingresos += cam.carga * this.p.precioVenta;
        }
        cam.estado = 'volviendo';
        cam.prog = 0;
        cam.carga = 0;
      } else {
        cam.estado = 'libre';
        cam.prog = 0;
        cam.destino = null;
        liberados = true;
      }
    }
    // Un camión que queda libre puede volver a cargar de inmediato:
    // el despacho es continuo, no solo al inicio del día.
    if (liberados && this.dia > 0) {
      this._despachar();
      this._despacharReposicion();
    }
  }

  /* ==================================================================
     EVENTOS DE INICIO DE DÍA
     ================================================================== */
  _nuevoDia() {
    this._produccion();                          // 1. La planta fabrica
    this._pronosticar();                         // 2. El CD pronostica la demanda de hoy
    const dHoy = this._demanda();                // 3. Llegan los pedidos reales
    this._actualizarPrevision(dHoy);             // 4. Se corrige la previsión con lo visto
    this._politicaDinamica();                    // 5. Se recalculan s, Q y S si corresponde
    this._despachar();                           // 6. El CD carga camiones de reparto
    const ordenHoy = this._revisarInventario();  // 7. Política de inventario del CD
    this._despacharReposicion();                 // 8. La planta envía al CD
    this._evaluarFaltantes();                    // 9. Se mide el faltante del día
    this._costosDelDia();                        // 10. Se devengan costos
    this._registrar(dHoy, ordenHoy);
  }

  // Pronóstico que el CD hace para el día en curso, antes de ver la demanda
  _pronosticar() {
    const p = this.p;
    const f = (p.prevision !== 'fija' && p.promoInformada) ? this.factorDemanda(this.dia) : 1;
    this.pronosticoHoy = this.Dhat * f;
  }

  /* --- 1. Producción --------------------------------------------- */
  _produccion() {
    const p = this.p;
    const necesidad = Math.max(
      p.objetivoStockPlanta - this.planta.stock,
      this.ordenesAbiertas() - this.planta.stock
    );
    const prod = clamp(Math.round(necesidad), 0, p.capacidadProduccion);
    if (prod > 0) {
      if (this.planta.produccionAyer === 0) {
        this.costos.setup += p.costoSetup;
        this.planta.arranques++;
      }
      this.planta.stock += prod;
      this.planta.producidoTotal += prod;
      this.costos.produccion += prod * p.costoProduccion;
    }
    this.planta.produccionAyer = prod;
  }

  /* ==================================================================
     PATRÓN DETERMINÍSTICO DE LA DEMANDA
     La demanda de cada día es:  μ · f(t) + ruido aleatorio
     donde f(t) = tendencia × estacionalidad × día-de-semana × promoción.
     f(t) es la parte PREDECIBLE: si el CD la conociera, no habría sorpresa.
     ================================================================== */

  // Duración efectiva: una campaña no puede durar más que su propio ciclo,
  // porque entonces la "promoción" sería permanente y dejaría de serlo.
  duracionPromo() {
    return Math.max(1, Math.min(this.p.promoDuracion, this.p.promoCada - 1));
  }

  // ¿El día d cae dentro de una promoción?
  enPromo(d) {
    const p = this.p;
    if (!p.promoActiva || p.promoCada <= 0) return false;
    return (d % p.promoCada) < this.duracionPromo();
  }

  // Factor de la promoción: pico durante la campaña y "resaca" después,
  // porque el cliente adelantó compras que ya no repetirá (forward buying).
  factorPromo(d) {
    const p = this.p;
    if (!p.promoActiva || p.promoCada <= 0) return 1;
    const dur = this.duracionPromo();
    const fase = d % p.promoCada;
    if (fase < dur) return p.promoUplift;

    const diasResaca = Math.max(1, Math.min(dur * 2, p.promoCada - dur));
    if (fase < dur + diasResaca) {
      const extra = (p.promoUplift - 1) * dur;               // demanda adelantada
      return Math.max(0, 1 - p.promoResaca * extra / diasResaca);
    }
    return 1;
  }

  // Factor determinístico completo del día d
  factorDemanda(d) {
    const p = this.p;
    let f = 1 + (p.tendenciaAnual / 100) * (d / 365);
    if (p.estacionalAmplitud > 0 && p.estacionalPeriodo > 0)
      f *= 1 + p.estacionalAmplitud * Math.sin(2 * Math.PI * d / p.estacionalPeriodo);
    if (p.patronSemanal) f *= PESOS_SEMANA[((d % 7) + 7) % 7];
    f *= this.factorPromo(d);
    return Math.max(0, f);
  }

  /* --- 2. Demanda ------------------------------------------------- */
  _demanda() {
    const p = this.p;
    // Stock realmente disponible para la demanda de hoy: el backlog que viene
    // de días anteriores ya tiene comprometida su parte.
    const disponible = Math.max(0, this.cd.stock - this.pendienteClientes());
    const f = this.factorDemanda(this.dia);
    this.factorHoy = f;
    const mu = p.demandaMedia * f;
    // La varianza crece con el nivel (supuesto tipo Poisson): σ_t = σ·√f
    const sigma = p.demandaSigma * Math.sqrt(f);

    let total = 0;
    for (const c of this.clientes) {
      let d;
      if (p.distribucion === 'poisson') d = Est.poisson(mu);
      else if (p.distribucion === 'constante') d = mu;
      else d = Est.normal(mu, sigma);
      d = Math.max(0, Math.round(d));
      c.pendiente += d;
      c.demandaTotal += d;
      total += d;
    }
    this.tot.demanda += total;
    // Fill rate tipo 2: fracción de la demanda que encuentra stock al llegar.
    // Es independiente de la política de despacho — el retraso por consolidar
    // carga se mide aparte, con la espera media del pedido.
    this.tot.cubiertoInmediato += Math.min(total, disponible);
    return total;
  }

  /* ==================================================================
     PREVISIÓN DE DEMANDA DEL CD
     Aquí nace el efecto látigo (Lee, Padmanabhan & Whang, 1997):
     el CD no observa la demanda futura, la ESTIMA. Un peak de promoción
     sube D̂ y σ̂, eso sube el punto de reorden, y eso dispara una orden
     mucho mayor que el peak que la originó.
     Si promoInformada = true el CD conoce el calendario, desestacionaliza
     lo observado y planifica con el factor real: la amplificación cae.
     ================================================================== */
  _actualizarPrevision(dHoy) {
    const p = this.p;

    // Error del pronóstico hecho para hoy. Se usa WMAPE = Σ|F−A| / ΣA:
    // el MAPE clásico se dispara al infinito en los días de resaca, cuando
    // la demanda real cae casi a cero.
    if (this.dia > 1) {
      this.errAbs += Math.abs(this.pronosticoHoy - dHoy);
      this.errReal += dHoy;
    }

    if (p.prevision === 'fija') {
      this.Dhat = p.demandaMedia * p.nClientes;
      this.sigmaHat = Math.sqrt(p.nClientes) * p.demandaSigma;
      return;
    }

    // Si conoce el calendario, quita el patrón antes de proyectar
    const f = p.promoInformada ? Math.max(0.05, this.factorDemanda(this.dia)) : 1;
    const dBase = dHoy / f;

    this.obs.push(dBase);
    if (this.obs.length > 120) this.obs.shift();

    if (p.prevision === 'media_movil') {
      const n = Math.max(2, Math.round(p.ventanaPrevision));
      const w = this.obs.slice(-n);
      this.Dhat = Est.media(w);
      this.sigmaHat = Math.max(1, Est.desv(w));
    } else {
      // Suavizamiento exponencial simple + MAD (σ ≈ 1.25·MAD)
      this.Dhat = p.alfa * dBase + (1 - p.alfa) * this.Dhat;
      this.MAD = p.alfa * Math.abs(dBase - this.Dhat) + (1 - p.alfa) * this.MAD;
      this.sigmaHat = Math.max(1, 1.25 * this.MAD);
    }
  }

  /* Horizonte de planificación.
     Normalmente basta con cubrir el lead time. Pero si el CD conoce el
     calendario y viene una campaña, extiende el horizonte hasta el final de
     esa campaña: así empieza a acumular stock ANTES, en vez de pedirlo
     cuando ya es tarde. Eso es pre-construir inventario (pre-build), y es
     lo que de verdad aporta la planificación colaborativa. */
  horizontePlanificacion() {
    const p = this.p;
    const L = p.leadTimeMedio;
    if (p.prevision === 'fija' || !p.promoActiva || !p.promoInformada) return L;

    const alcance = Math.ceil(L + p.anticipacion);
    for (let k = 1; k <= alcance; k++) {
      const d = this.dia + k;
      if (this.enPromo(d) && !this.enPromo(d - 1))        // arranca una campaña
        return Math.max(L, k + p.promoDuracion - 1);      // cubrir hasta que termine
    }
    return L;
  }

  // Demanda esperada durante el horizonte de planificación
  demandaPrevista(H) {
    const p = this.p;
    if (p.prevision === 'fija' || !p.promoInformada) return this.Dhat * H;
    const n = Math.max(1, Math.ceil(H));
    let s = 0;
    for (let k = 1; k <= n; k++) s += this.factorDemanda(this.dia + k);
    return this.Dhat * (s / n) * H;
  }

  // Recalcula s, Q y S cuando la política es dinámica
  _politicaDinamica() {
    const p = this.p;
    if (p.prevision === 'fija') {
      this.sDin = p.puntoReorden;
      this.QDin = p.cantidadPedido;
      this.SDin = p.nivelObjetivo;
      return;
    }
    const D = Math.max(1, this.Dhat), sd = this.sigmaHat;
    const L = p.leadTimeMedio, sL = p.leadTimeSigma;
    const z = Est.invPhi(clamp(p.nivelServicio, 0.5, 0.999));
    // El stock de seguridad cubre solo el riesgo ALEATORIO del lead time;
    // la parte predecible del patrón ya está dentro de la demanda prevista.
    const sigmaLT = Math.sqrt(L * sd * sd + D * D * sL * sL);
    const sigmaRL = Math.sqrt((L + p.periodoRevision) * sd * sd + D * D * sL * sL);

    const H = this.horizontePlanificacion();
    this.horizonteHoy = H;
    const prevista = this.demandaPrevista(H);

    // Se agrega el sub-disparo: la revisión es diaria, no continua
    this.QDin = Math.max(20, Math.round(Math.sqrt(2 * D * p.costoPedido / p.costoMantener)));
    this.sDin = Math.max(0, Math.round(prevista + z * sigmaLT + D / 2));
    this.SDin = Math.max(20, Math.round(prevista + D * p.periodoRevision + z * sigmaRL));
  }

  /* --- 3. Despacho a clientes -------------------------------------
     Regla de consolidación: un camión no sale con menos de
     cargaMinimaPct % de su capacidad, salvo que el pedido del cliente
     ya lleve esperando esperaMaxima días.
     ----------------------------------------------------------------- */
  _despachar() {
    const p = this.p;
    const minCarga = p.capacidadCamion * (p.cargaMinimaPct / 100);

    for (const cam of this.camionesLibres('reparto')) {
      if (this.cd.stock <= 0) break;

      // se prioriza al cliente con mayor pedido pendiente
      const cands = this.clientes
        .filter(c => c.pendiente > 0)
        .sort((a, b) => b.pendiente - a.pendiente);

      let elegido = null, qty = 0;
      for (const c of cands) {
        const q = Math.min(p.capacidadCamion, c.pendiente, this.cd.stock);
        if (q <= 0) continue;
        if (q >= minCarga || c.espera >= p.esperaMaxima) { elegido = c; qty = q; break; }
      }
      if (!elegido) break;

      this.cd.stock -= qty;
      this.cd.despachadoTotal += qty;
      this.tot.servido += qty;
      elegido.pendiente -= qty;
      cam.carga = qty;
      cam.destino = elegido.id;
      cam.estado = 'yendo';
      cam.prog = 0;
      cam.dur = Math.max(0.05, p.tiempoViajeCliente * elegido.distancia);
      this.costos.transporte += p.costoViajeReparto;
    }
  }

  /* --- 6. Faltantes al cierre del día ------------------------------
     Se distingue el pedido que solo espera su camión (retraso logístico,
     no penalizado) del faltante REAL: la parte del pedido que el CD no
     puede cubrir porque no tiene stock. Solo esa parte es quiebre.
     ----------------------------------------------------------------- */
  _evaluarFaltantes() {
    const p = this.p;
    const pend = this.pendienteClientes();
    const faltante = Math.max(0, pend - this.cd.stock);

    this.tot.unidadDias += pend;   // ley de Little: L acumulado

    if (faltante > 0) {
      this.tot.diasConQuiebre++;
      this.costos.quiebre += faltante * p.costoQuiebre;

      if (p.faltantes === 'perdida') {
        // se pierde definitivamente lo que el CD no alcanzó a cubrir
        let restante = faltante;
        for (const c of this.clientes) {
          if (restante <= 0) break;
          const q = Math.min(c.pendiente, restante);
          c.pendiente -= q;
          c.perdidoTotal += q;
          this.tot.perdido += q;
          restante -= q;
        }
        this._log('Venta perdida: ' + Math.round(faltante) + ' u', 'bad');
      } else {
        this._log('Faltante de ' + Math.round(faltante) + ' u en backorder', 'bad');
      }
    }
    for (const c of this.clientes) c.espera = c.pendiente > 0 ? c.espera + 1 : 0;
  }

  /* --- 4. Política de inventario del CD ---------------------------- */
  _revisarInventario() {
    const p = this.p;
    let pedido = 0;

    if (p.politica === 'sQ') {
      let ip = this.posicionInventario();
      let guardia = 0;
      while (ip <= this.sDin && guardia < 20) {
        pedido += this.QDin;
        ip += this.QDin;
        guardia++;
      }
    } else { // Revisión periódica (R, S)
      if (this.dia >= this.proximaRevision) {
        this.proximaRevision = this.dia + p.periodoRevision;
        const ip = this.posicionInventario();
        pedido = Math.max(0, Math.round(this.SDin - ip));
      }
    }

    if (pedido > 0) {
      this.planta.ordenes.push({ dia: this.dia, cantidad: pedido, restante: pedido });
      this.cd.ordenesEmitidas++;
      this.costos.pedido += p.costoPedido;
      this._log('CD emite orden de ' + pedido + ' u a la planta', 'warn');
    }
    return pedido;
  }

  /* --- 5. Despacho Planta → CD ------------------------------------ */
  _despacharReposicion() {
    const p = this.p;
    const libres = this.camionesLibres('repo');
    for (const cam of libres) {
      const orden = this.planta.ordenes[0];
      if (!orden || this.planta.stock <= 0) break;
      const qty = Math.min(orden.restante, p.capacidadCamionRepo, this.planta.stock);
      if (qty <= 0) break;
      this.planta.stock -= qty;
      orden.restante -= qty;
      if (orden.restante <= 0) this.planta.ordenes.shift();
      this.cd.enTransito += qty;
      cam.carga = qty;
      cam.destino = 'cd';
      cam.estado = 'yendo';
      cam.prog = 0;
      cam.dur = Math.max(0.2, Est.normal(p.leadTimeMedio, p.leadTimeSigma));
      this.costos.transporte += p.costoViajeRepo;
    }
  }

  /* --- 6. Costos diarios ------------------------------------------ */
  _costosDelDia() {
    const p = this.p;
    this.costos.mantener += (this.cd.stock + this.planta.stock) * p.costoMantener;
  }

  /* --- Registro histórico ------------------------------------------ */
  _registrar(demandaHoy, ordenHoy) {
    const h = this.hist;
    h.dia.push(this.dia);
    h.invCD.push(this.cd.stock);
    h.invPlanta.push(this.planta.stock);
    h.enTransito.push(this.cd.enTransito);
    h.demanda.push(demandaHoy);
    h.ordenes.push(ordenHoy);
    h.entregas.push(this.cd.despachadoTotal);
    h.pendientes.push(this.pendienteClientes());
    h.fillDiario.push(this.tot.demanda > 0 ? this.tot.entregado / this.tot.demanda : 1);
    h.costoAcum.push(this.costoTotal());
    h.produccion.push(this.planta.produccionAyer);
    h.prevision.push(this.pronosticoHoy);
    h.sDin.push(this.sDin);
  }

  // Coeficiente de variación de una serie agregada por semanas
  _cvSemanal(serie) {
    const s = this._agregarSemanal(serie);
    const m = Est.media(s);
    return m > 0 ? Est.desv(s) / m : 0;
  }

  // Suma una serie diaria en cubos de 7 días (descarta la semana incompleta)
  _agregarSemanal(arr) {
    const out = [];
    for (let i = 0; i + 7 <= arr.length; i += 7) {
      let s = 0;
      for (let j = i; j < i + 7; j++) s += arr[j];
      out.push(s);
    }
    return out.length ? out : [Est.media(arr) * 7];
  }

  costoTotal() {
    const c = this.costos;
    return c.mantener + c.pedido + c.quiebre + c.transporte + c.produccion + c.setup;
  }

  /* ==================================================================
     INDICADORES (KPI)
     ================================================================== */
  kpis() {
    const p = this.p, h = this.hist;
    const dias = Math.max(1, this.dia);
    const fill = this.tot.demanda > 0 ? this.tot.cubiertoInmediato / this.tot.demanda : 1;
    const invProm = Est.media(h.invCD);
    const demProm = this.tot.demanda / dias;
    const costo = this.costoTotal();

    // Efecto látigo: variabilidad relativa en cada eslabón de la cadena.
    // Se agrega por semanas: día a día las órdenes son cero casi siempre (por
    // el loteo Q) y el coeficiente de variación se dispara sin significado.
    const cvDem = this._cvSemanal(h.demanda);
    const cvOrd = this._cvSemanal(h.ordenes);
    const cvProd = this._cvSemanal(h.produccion);

    return {
      dia: this.dia,
      horizonte: p.horizonte,
      fillRate: fill,
      nivelServicioCiclo: 1 - this.tot.diasConQuiebre / dias,
      inventarioProm: invProm,
      diasCobertura: demProm > 0 ? invProm / demProm : 0,
      rotacion: invProm > 0 ? (this.tot.entregado / dias) * 365 / invProm : 0,
      costoTotal: costo,
      costoPorUnidad: this.tot.entregado > 0 ? costo / this.tot.entregado : 0,
      margen: this.tot.ingresos - costo,
      ingresos: this.tot.ingresos,
      // Ley de Little: W = L / λ  (espera media de una unidad pedida)
      esperaMedia: this.tot.demanda > 0 ? this.tot.unidadDias / this.tot.demanda : 0,
      utilReparto: p.camionesReparto ? this._diasReparto / (p.camionesReparto * dias) : 0,
      utilRepo: p.camionesReposicion ? this._diasRepo / (p.camionesReposicion * dias) : 0,
      utilPlanta: this.planta.producidoTotal / (p.capacidadProduccion * dias),
      bullwhip: cvDem > 0 ? cvOrd / cvDem : 0,
      bullwhipPlanta: cvDem > 0 ? cvProd / cvDem : 0,
      cvDemanda: cvDem, cvOrdenes: cvOrd, cvProduccion: cvProd,
      // WMAPE: error absoluto de la previsión del CD, ponderado por la demanda
      mape: this.errReal > 0 ? this.errAbs / this.errReal : 0,
      sDin: this.sDin, QDin: this.QDin, SDin: this.SDin,
      pendiente: this.pendienteClientes(),
      perdido: this.tot.perdido,
      demandaTotal: this.tot.demanda,
      entregado: this.tot.entregado,
      ordenes: this.cd.ordenesEmitidas
    };
  }

  /* ==================================================================
     MODELO TEÓRICO — valores óptimos de referencia
     ================================================================== */
  teoria(nivelServicioObjetivo) {
    const p = this.p;
    const beta = nivelServicioObjetivo != null ? nivelServicioObjetivo : p.nivelServicio;

    // Media y varianza del factor determinístico a lo largo del horizonte
    const H = Math.max(1, p.horizonte);
    let fMedio = 0;
    for (let d = 0; d < H; d++) fMedio += this.factorDemanda(d);
    fMedio /= H;
    let varF = 0;
    for (let d = 0; d < H; d++) {
      const e = this.factorDemanda(d) - fMedio;
      varF += e * e;
    }
    varF /= H;

    const D = p.demandaMedia * p.nClientes * fMedio;   // demanda diaria media real

    // Ley de la varianza total:  Var(D) = E_f[Var(D|f)] + Var_f(E[D|f])
    //   · el primer término es el ruido aleatorio del día
    //   · el segundo es la variación que introduce el propio patrón
    const varUnit = p.distribucion === 'poisson' ? p.demandaMedia
                  : p.distribucion === 'constante' ? 0
                  : p.demandaSigma * p.demandaSigma;
    const varRuido = p.nClientes * varUnit * fMedio;
    const varPatron = Math.pow(p.demandaMedia * p.nClientes, 2) * varF;
    const sigmaD = Math.sqrt(varRuido + varPatron);

    const L = p.leadTimeMedio, sigmaL = p.leadTimeSigma;

    // EOQ (Harris):  Q* = sqrt(2·D·K/h)
    const EOQ = Math.sqrt(2 * D * p.costoPedido / p.costoMantener);

    // Desviación de la demanda durante el lead time (lead time estocástico)
    const sigmaLT = Math.sqrt(L * sigmaD * sigmaD + D * D * sigmaL * sigmaL);

    const z = Est.invPhi(beta);
    const SS = z * sigmaLT;                    // stock de seguridad

    /* Sub-disparo (undershoot).
       El inventario no se revisa de forma continua sino una vez al día, así
       que cuando se detecta que la posición cayó bajo s, ya la sobrepasó.
       En promedio la sobrepasa media revisión de demanda. Ignorarlo hace que
       el punto de reorden teórico entregue MENOS servicio del pedido. */
    const R = p.politica === 'sQ' ? 1 : p.periodoRevision;
    const undershoot = D * R / 2;

    const ROP = D * L + SS + undershoot;       // punto de reorden s*
    const S = D * (L + p.periodoRevision) + z *
      Math.sqrt((L + p.periodoRevision) * sigmaD * sigmaD + D * D * sigmaL * sigmaL);

    // Fill rate esperado con el s y Q actuales (función de pérdida normal),
    // evaluado en la posición EFECTIVA al momento de emitir la orden
    const sEfectivo = p.puntoReorden - undershoot;
    const zAct = sigmaLT > 0 ? (sEfectivo - D * L) / sigmaLT : 6;
    const fillEsperado = p.cantidadPedido > 0
      ? clamp(1 - (sigmaLT * Est.lossFn(zAct)) / p.cantidadPedido, 0, 1)
      : 0;

    // Costo diario teórico del modelo EOQ + stock de seguridad
    // (con demanda nula el EOQ es 0: no hay ciclos de pedido que costear)
    const costoTeorico = (EOQ / 2 + SS) * p.costoMantener +
      (EOQ > 0 ? (D / EOQ) * p.costoPedido : 0);

    return {
      D: D, sigmaD: sigmaD, L: L, sigmaLT: sigmaLT, z: z, beta: beta,
      fMedio: fMedio,
      // qué fracción de la varianza diaria viene del patrón y no del azar
      pesoPatron: (varRuido + varPatron) > 0 ? varPatron / (varRuido + varPatron) : 0,
      estacional: p.estacionalAmplitud > 0 || p.patronSemanal || p.promoActiva ||
                  p.tendenciaAnual !== 0,
      EOQ: Math.round(EOQ),
      SS: Math.round(SS),
      undershoot: undershoot,
      R: R,
      ROP: Math.round(ROP),
      S: Math.round(S),
      fillEsperado: fillEsperado,
      costoDiarioTeorico: costoTeorico,
      camionesNecesarios: Math.max(1, Math.ceil((D / p.capacidadCamion) * (2 * p.tiempoViajeCliente))),
      utilPlantaTeorica: D / p.capacidadProduccion
    };
  }

  /* ---------- Exportación de datos ---------- */
  csv() {
    const h = this.hist;
    const cab = 'dia,dia_semana,en_promo,factor_demanda,demanda,prevision_cd,orden_cd,' +
      'produccion,inv_cd,inv_planta,en_transito,pendiente,s_efectivo,fill_acum,costo_acum';
    const filas = h.dia.map((d, i) => [
      d, DIAS_SEMANA[((d % 7) + 7) % 7], this.enPromo(d) ? 1 : 0,
      this.factorDemanda(d).toFixed(3),
      h.demanda[i], h.prevision[i].toFixed(1), h.ordenes[i], h.produccion[i],
      Math.round(h.invCD[i]), Math.round(h.invPlanta[i]), Math.round(h.enTransito[i]),
      Math.round(h.pendientes[i]), Math.round(h.sDin[i]),
      h.fillDiario[i].toFixed(4), h.costoAcum[i].toFixed(2)
    ].join(','));
    return [cab].concat(filas).join('\n');
  }
}
