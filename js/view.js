/* =========================================================================
   SIM-CD  ·  Capa visual
   - Vista.dibujar(sim)   → animación de la red logística en canvas
   - Grafico.linea(...)   → mini-librería de gráficos (sin dependencias)
   ========================================================================= */

const COLORES = {
  fondo: '#0b1220',
  grid: 'rgba(148,163,184,0.10)',
  ruta: 'rgba(148,163,184,0.28)',
  planta: '#a78bfa',
  cd: '#38bdf8',
  cliente: '#34d399',
  camionRepo: '#c4b5fd',
  camionReparto: '#6ee7b7',
  texto: '#e2e8f0',
  suave: '#94a3b8',
  alerta: '#f87171',
  aviso: '#fbbf24',
  ok: '#4ade80'
};

/* ---------- Helpers de dibujo ---------- */
function rectRedondo(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Punto sobre una curva cuadrática de Bézier
function puntoBezier(p0, pc, p1, t) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * pc.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * pc.y + t * t * p1.y
  };
}

const Vista = {
  canvas: null,
  ctx: null,
  W: 0, H: 0,
  nodos: {},

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.redimensionar();
    window.addEventListener('resize', () => this.redimensionar());
  },

  redimensionar() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.W = Math.max(320, r.width);
    this.H = Math.max(260, r.height);
    this.canvas.width = this.W * dpr;
    this.canvas.height = this.H * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  /* ---------- Cálculo de posiciones ---------- */
  layout(sim) {
    const W = this.W, H = this.H;
    this.nodos.planta = { x: W * 0.11, y: H * 0.5 };
    this.nodos.cd = { x: W * 0.44, y: H * 0.5 };
    const n = sim.clientes.length;
    // Se reserva espacio a la derecha para las etiquetas de cada zona
    const xMin = Math.min(W * 0.62, W - 155);
    const xMax = Math.min(W * 0.74, W - 125);
    this.nodos.clientes = sim.clientes.map((c, i) => {
      const paso = H * 0.76 / Math.max(1, n);
      const y = H * 0.12 + paso * (i + 0.5);
      const x = xMin + (xMax - xMin) * (c.distancia - 0.6) / 0.8;
      return { x: x, y: y };
    });
  },

  /* ---------- Bucle de dibujo ---------- */
  dibujar(sim) {
    const ctx = this.ctx, W = this.W, H = this.H;
    this.layout(sim);

    // Fondo + grilla
    ctx.fillStyle = COLORES.fondo;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = COLORES.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    this._rutas(sim);
    this._nodoPlanta(sim);
    this._nodoCD(sim);
    this._nodosClientes(sim);
    this._camiones(sim);
    this._reloj(sim);
  },

  /* ---------- Rutas ---------- */
  _rutas(sim) {
    const ctx = this.ctx;
    const P = this.nodos.planta, C = this.nodos.cd;

    ctx.save();
    ctx.setLineDash([7, 7]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORES.ruta;

    ctx.beginPath(); ctx.moveTo(P.x + 46, P.y); ctx.lineTo(C.x - 52, C.y); ctx.stroke();

    this.nodos.clientes.forEach((cl) => {
      const ctrl = { x: (C.x + cl.x) / 2, y: (C.y + cl.y) / 2 - (cl.y - C.y) * 0.28 };
      ctx.beginPath();
      ctx.moveTo(C.x + 52, C.y);
      ctx.quadraticCurveTo(ctrl.x, ctrl.y, cl.x - 26, cl.y);
      ctx.stroke();
    });
    ctx.restore();
  },

  /* ---------- Nodo: Planta ---------- */
  _nodoPlanta(sim) {
    const ctx = this.ctx, n = this.nodos.planta;
    const w = 92, h = 92, x = n.x - w / 2, y = n.y - h / 2;
    const produciendo = sim.planta.produccionAyer > 0;

    ctx.save();
    if (produciendo) { ctx.shadowColor = COLORES.planta; ctx.shadowBlur = 22; }
    ctx.fillStyle = 'rgba(167,139,250,0.14)';
    ctx.strokeStyle = COLORES.planta;
    ctx.lineWidth = 2;
    rectRedondo(ctx, x, y, w, h, 12);
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // Chimeneas con humo animado si produce
    ctx.fillStyle = COLORES.planta;
    for (let i = 0; i < 3; i++) {
      const cx = x + 20 + i * 22;
      ctx.fillRect(cx, y + 30 - i * 6, 12, 34 + i * 6);
      if (produciendo) {
        const f = (sim.t * 3 + i * 0.4) % 1;
        ctx.globalAlpha = 0.5 * (1 - f);
        ctx.beginPath();
        ctx.arc(cx + 6, y + 26 - i * 6 - f * 22, 4 + f * 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    this._etiqueta(n.x, y - 12, 'PLANTA', COLORES.planta);
    this._barra(n.x - 46, y + h + 10, 92, 9,
      sim.planta.stock / Math.max(1, sim.p.objetivoStockPlanta * 1.5), COLORES.planta);
    this._texto(n.x, y + h + 34,
      Math.round(sim.planta.stock) + ' u en planta', COLORES.suave, 11);
    this._texto(n.x, y + h + 50,
      'Producción hoy: ' + Math.round(sim.planta.produccionAyer) + ' u/día',
      produciendo ? COLORES.ok : COLORES.suave, 11);
  },

  /* ---------- Nodo: Centro de Distribución ---------- */
  _nodoCD(sim) {
    const ctx = this.ctx, n = this.nodos.cd;
    const w = 108, h = 108, x = n.x - w / 2, y = n.y - h / 2;
    const ocup = sim.cd.stock / Math.max(1, sim.p.capacidadCD);
    const color = ocup > 1 ? COLORES.alerta : ocup < 0.08 ? COLORES.aviso : COLORES.cd;

    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(56,189,248,0.12)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    rectRedondo(ctx, x, y, w, h, 14);
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // "Racks" que se llenan según el inventario
    const filas = 4, cols = 4, total = filas * cols;
    const llenas = Math.round(clamp(ocup, 0, 1) * total);
    let k = 0;
    for (let f = filas - 1; f >= 0; f--) {
      for (let c = 0; c < cols; c++) {
        const bx = x + 12 + c * 22, by = y + 12 + f * 22;
        const idx = (filas - 1 - f) * cols + c;
        ctx.fillStyle = idx < llenas ? color : 'rgba(148,163,184,0.16)';
        rectRedondo(ctx, bx, by, 17, 17, 3);
        ctx.fill();
        k++;
      }
    }

    this._etiqueta(n.x, y - 12, 'CENTRO DE DISTRIBUCIÓN', COLORES.cd);
    this._barra(n.x - 54, y + h + 10, 108, 9, ocup, color);
    this._texto(n.x, y + h + 34,
      Math.round(sim.cd.stock) + ' / ' + sim.p.capacidadCD + ' u  (' +
      Math.round(ocup * 100) + '%)', COLORES.suave, 11);
    this._texto(n.x, y + h + 50,
      'En tránsito: ' + Math.round(sim.cd.enTransito) + ' u', COLORES.suave, 11);

    if (ocup <= 0.001) this._texto(n.x, y - 28, '¡QUIEBRE DE STOCK!', COLORES.alerta, 12, true);
    else if (ocup > 1) this._texto(n.x, y - 28, 'SOBRE CAPACIDAD', COLORES.alerta, 12, true);
  },

  /* ---------- Nodos: Clientes ---------- */
  _nodosClientes(sim) {
    const ctx = this.ctx;
    this.nodos.clientes.forEach((n, i) => {
      const c = sim.clientes[i];
      const r = 22;
      const alerta = c.pendiente > sim.p.demandaMedia * 1.5;
      const col = alerta ? COLORES.aviso : COLORES.cliente;

      ctx.save();
      if (c.recibiendo > 0) {
        ctx.shadowColor = COLORES.ok;
        ctx.shadowBlur = 30 * c.recibiendo;
      }
      ctx.fillStyle = 'rgba(52,211,153,0.14)';
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();

      // icono simple de tienda
      ctx.fillStyle = col;
      ctx.fillRect(n.x - 9, n.y - 3, 18, 12);
      ctx.beginPath();
      ctx.moveTo(n.x - 12, n.y - 3); ctx.lineTo(n.x, n.y - 12); ctx.lineTo(n.x + 12, n.y - 3);
      ctx.closePath(); ctx.fill();

      this._texto(n.x + 32, n.y - 8, c.nombre, COLORES.texto, 12, true, 'left');
      this._texto(n.x + 32, n.y + 7,
        'pend. ' + Math.round(c.pendiente) + ' u', alerta ? COLORES.aviso : COLORES.suave, 11,
        false, 'left');
      this._texto(n.x + 32, n.y + 21,
        'servido ' + (c.demandaTotal > 0
          ? Math.round(100 * c.entregadoTotal / c.demandaTotal) : 100) + '%',
        COLORES.suave, 11, false, 'left');
    });
  },

  /* ---------- Camiones ---------- */
  _camiones(sim) {
    const ctx = this.ctx;
    const P = this.nodos.planta, C = this.nodos.cd;

    sim.camiones.forEach((cam) => {
      if (cam.estado === 'libre') return;
      let pos, ang = 0, color, cap;

      if (cam.tipo === 'repo') {
        const a = { x: P.x + 46, y: P.y }, b = { x: C.x - 52, y: C.y };
        const desv = (cam.carril - (sim.p.camionesReposicion - 1) / 2) * 16;
        const t = cam.estado === 'yendo' ? cam.prog : 1 - cam.prog;
        pos = { x: a.x + (b.x - a.x) * t, y: a.y + desv };
        ang = cam.estado === 'yendo' ? 0 : Math.PI;
        color = COLORES.camionRepo;
        cap = sim.p.capacidadCamionRepo;
      } else {
        const cl = this.nodos.clientes[cam.destino];
        if (!cl) return;
        const a = { x: C.x + 52, y: C.y }, b = { x: cl.x - 26, y: cl.y };
        const ctrl = { x: (C.x + cl.x) / 2, y: (C.y + cl.y) / 2 - (cl.y - C.y) * 0.28 };
        const t = clamp(cam.estado === 'yendo' ? cam.prog : 1 - cam.prog, 0, 1);
        pos = puntoBezier(a, ctrl, b, t);
        const p2 = puntoBezier(a, ctrl, b, clamp(t + 0.02, 0, 1));
        ang = Math.atan2(p2.y - pos.y, p2.x - pos.x);
        if (cam.estado === 'volviendo') ang += Math.PI;
        color = COLORES.camionReparto;
        cap = sim.p.capacidadCamion;
      }

      // dibujo del camión
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(Math.abs(ang) > Math.PI / 2 ? ang + Math.PI : ang);
      const cargado = cam.carga > 0;
      ctx.fillStyle = cargado ? color : 'rgba(148,163,184,0.45)';
      rectRedondo(ctx, -16, -8, 24, 16, 3); ctx.fill();   // caja
      rectRedondo(ctx, 8, -6, 10, 12, 2); ctx.fill();     // cabina
      ctx.fillStyle = 'rgba(15,23,42,0.85)';
      ctx.beginPath(); ctx.arc(-10, 9, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(11, 9, 3.2, 0, Math.PI * 2); ctx.fill();
      // barra de ocupación de la carga
      if (cargado) {
        ctx.fillStyle = 'rgba(15,23,42,0.6)';
        ctx.fillRect(-15, -6, 22, 4);
        ctx.fillStyle = COLORES.ok;
        ctx.fillRect(-15, -6, 22 * clamp(cam.carga / cap, 0, 1), 4);
      }
      ctx.restore();

      if (cargado) this._texto(pos.x, pos.y - 16, Math.round(cam.carga) + 'u', color, 10, true);
    });
  },

  /* ---------- Reloj / cabecera del lienzo ---------- */
  _reloj(sim) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(15,23,42,0.72)';
    rectRedondo(ctx, 12, 12, 178, 46, 8); ctx.fill();
    ctx.restore();
    this._texto(24, 34, 'DÍA ' + sim.dia + ' / ' + sim.p.horizonte,
      COLORES.texto, 16, true, 'left');
    this._texto(24, 50,
      sim.terminada ? 'Simulación finalizada'
        : 'Política ' + (sim.p.politica === 'sQ' ? '(s, Q)' : '(R, S)') +
          (sim.p.patronSemanal ? ' · ' + DIAS_SEMANA[((sim.dia % 7) + 7) % 7] : ''),
      COLORES.suave, 11, false, 'left');

    // Distintivo de promoción en curso
    if (sim.enPromo(sim.dia)) {
      const pulso = 0.55 + 0.45 * Math.sin(sim.t * 8);
      ctx.save();
      ctx.globalAlpha = pulso;
      ctx.fillStyle = 'rgba(251,146,60,0.22)';
      ctx.strokeStyle = '#fb923c';
      ctx.lineWidth = 1.5;
      rectRedondo(ctx, 200, 12, 150, 46, 8);
      ctx.fill(); ctx.stroke();
      ctx.restore();
      this._texto(275, 30, '🔥 PROMOCIÓN', '#fb923c', 13, true);
      this._texto(275, 47, 'demanda ×' + sim.p.promoUplift.toFixed(1),
        COLORES.suave, 10.5);
    }

    // Demanda esperada del día vs. lo que el CD había pronosticado
    if (sim.dia > 0) {
      const real = sim.p.demandaMedia * sim.p.nClientes * sim.factorHoy;
      this._texto(this.W - 16, 24,
        'Demanda esperada hoy: ' + Math.round(real) + ' u',
        COLORES.suave, 10.5, false, 'right');
      this._texto(this.W - 16, 40,
        'Previsión del CD: ' + Math.round(sim.pronosticoHoy) + ' u',
        sim.pronosticoHoy < real * 0.75 ? COLORES.alerta : COLORES.suave,
        10.5, false, 'right');
    }
  },

  /* ---------- Primitivas de texto ---------- */
  _texto(x, y, txt, color, size, bold, align) {
    const ctx = this.ctx;
    ctx.fillStyle = color || COLORES.texto;
    ctx.font = (bold ? '600 ' : '') + (size || 12) +
      'px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y);
  },

  _etiqueta(x, y, txt, color) {
    this._texto(x, y, txt, color, 11, true);
  },

  _barra(x, y, w, h, frac, color) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(148,163,184,0.18)';
    rectRedondo(ctx, x, y, w, h, h / 2); ctx.fill();
    ctx.fillStyle = color;
    rectRedondo(ctx, x, y, Math.max(2, w * clamp(frac, 0, 1)), h, h / 2); ctx.fill();
  }
};

/* =========================================================================
   Mini-librería de gráficos
   ========================================================================= */
const Grafico = {
  linea(canvas, series, opts) {
    opts = opts || {};
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    const W = Math.max(200, r.width), H = Math.max(120, r.height);
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const m = { t: 16, r: 12, b: 22, l: 44 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;

    // rango
    let max = -Infinity, min = Infinity, n = 0;
    series.forEach(s => {
      n = Math.max(n, s.datos.length);
      s.datos.forEach(v => { if (v > max) max = v; if (v < min) min = v; });
    });
    (opts.lineas || []).forEach(l => { if (l.y > max) max = l.y; if (l.y < min) min = l.y; });
    if (!isFinite(max)) { max = 1; min = 0; }
    if (opts.desdeCero !== false) min = Math.min(0, min);
    if (max === min) max = min + 1;
    const pad = (max - min) * 0.08;
    max += pad;

    const X = i => m.l + (n <= 1 ? 0 : iw * i / (n - 1));
    const Y = v => m.t + ih - ih * (v - min) / (max - min);

    // ejes y grilla
    ctx.strokeStyle = 'rgba(148,163,184,0.14)';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64748b';
    ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let k = 0; k <= 4; k++) {
      const v = min + (max - min) * k / 4, y = Y(v);
      ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(W - m.r, y); ctx.stroke();
      ctx.fillText(Grafico.fmt(v), m.l - 6, y);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let k = 0; k <= 4; k++) {
      const i = Math.round((n - 1) * k / 4);
      ctx.fillText(String(i), X(i), m.t + ih + 5);
    }

    // bandas verticales (p. ej. días en promoción)
    if (opts.marcados && opts.marcados.length && n > 1) {
      const semi = iw / (n - 1) / 2 + 0.5;
      ctx.fillStyle = opts.colorMarcado || 'rgba(251,146,60,0.16)';
      opts.marcados.forEach(i => {
        ctx.fillRect(X(i) - semi, m.t, semi * 2, ih);
      });
    }

    // líneas de referencia horizontales (s, S, etc.)
    (opts.lineas || []).forEach(l => {
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = l.color; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(m.l, Y(l.y)); ctx.lineTo(W - m.r, Y(l.y)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = l.color; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(l.etiqueta, m.l + 4, Y(l.y) - 2);
      ctx.restore();
    });

    // series
    series.forEach(s => {
      if (!s.datos.length) return;
      if (s.area && !s.dash) {
        const g = ctx.createLinearGradient(0, m.t, 0, m.t + ih);
        g.addColorStop(0, s.color + '55');
        g.addColorStop(1, s.color + '00');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(X(0), Y(Math.max(min, 0)));
        s.datos.forEach((v, i) => ctx.lineTo(X(i), Y(v)));
        ctx.lineTo(X(s.datos.length - 1), Y(Math.max(min, 0)));
        ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.grosor || 2;
      ctx.lineJoin = 'round';
      ctx.setLineDash(s.dash ? [4, 3] : []);
      ctx.beginPath();
      s.datos.forEach((v, i) => i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)));
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // leyenda
    let lx = m.l + 2;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    series.forEach(s => {
      ctx.fillStyle = s.color;
      ctx.fillRect(lx, m.t - 9, 9, 3);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(s.nombre, lx + 13, m.t - 8);
      lx += 22 + ctx.measureText(s.nombre).width;
    });
  },

  barras(canvas, items, opts) {
    opts = opts || {};
    const fmt = opts.fmt ||
      ((v, total) => Math.round(100 * v / total) + '%  $' + Grafico.fmt(v));
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    const W = Math.max(200, r.width), H = Math.max(120, r.height);
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const total = items.reduce((s, i) => s + i.valor, 0) || 1;
    const m = { t: 10, r: 12, b: 8, l: opts.margenIzq || 96 };
    const ih = H - m.t - m.b;
    const alto = Math.min(20, ih / items.length - 6);
    const max = Math.max.apply(null,
      items.map(i => Math.max(i.valor, i.ref != null ? i.ref : 0))) || 1;
    const anchoUtil = W - m.l - m.r - (opts.reservaEtiqueta || 62);

    items.forEach((it, i) => {
      const y = m.t + i * (ih / items.length);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(it.nombre, m.l - 8, y + alto / 2);

      const w = anchoUtil * (it.valor / max);
      ctx.fillStyle = it.color;
      rectRedondo(ctx, m.l, y, Math.max(2, w), alto, 4); ctx.fill();

      // marca del valor de la referencia A
      if (it.ref != null) {
        const wr = anchoUtil * (it.ref / max);
        ctx.fillStyle = 'rgba(226,232,240,.8)';
        ctx.fillRect(m.l + Math.max(1, wr) - 1, y - 3, 2, alto + 6);
      }

      ctx.fillStyle = '#e2e8f0';
      ctx.textAlign = 'left';
      ctx.fillText(fmt(it.valor, total), m.l + Math.max(2, w) + 8, y + alto / 2);
    });
  },

  fmt(v) {
    const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return (v / 1e3).toFixed(1) + 'k';
    if (a >= 10) return v.toFixed(0);
    return v.toFixed(a < 1 ? 2 : 1);
  }
};
