// Minijuego estilo Fruit Ninja: las frutas saltan desde abajo y se cortan arrastrando el mouse
// apretado o deslizando el dedo. Al cortarlas se parten en sus dos mitades y largan jugo.
// Se dibuja en un canvas propio encima del juego (el mundo queda en pausa mientras dura).
// Se configura en datos/mundo.json → "fruitNinja".
//
// Cada fruta usa tres imágenes del mismo tamaño: la entera y sus dos mitades, cada una en su
// lugar dentro del cuadro (superpuestas forman la fruta entera). Así, al cortar, las mitades
// arrancan exactamente donde estaba la fruta y se separan.

const pausa = ms => new Promise(r => setTimeout(r, ms));
const azar = (a, b) => a + Math.random() * (b - a);

const imagenes = new Map(); // ruta → Promise<Image>
const sonidos = new Map();  // ruta → Audio (se clona para sonar varias veces a la vez)

function cargarImagen(ruta) {
  if (!imagenes.has(ruta)) {
    imagenes.set(ruta, new Promise((ok, mal) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => mal(new Error(`No se pudo cargar ${ruta}`));
      img.src = ruta;
    }));
  }
  return imagenes.get(ruta);
}

// Baja de antemano imágenes y sonidos, para que el juego arranque sin esperas.
export function precargarFruitNinja(c) {
  if (!c) return;
  const rutas = [c.fondo, ...(c.frutas || []).flatMap(f => [f.entera, ...(f.mitades || [])])];
  for (const r of rutas) if (r) cargarImagen(r).catch(() => {});
  for (const r of Object.values(c.sonidos || {})) {
    if (!r || sonidos.has(r)) continue;
    const a = new Audio(r);
    a.preload = 'auto';
    sonidos.set(r, a);
  }
}

// Achica una imagen con buena calidad (de a mitades) y borra los píxeles casi transparentes
// (las motitas sueltas alrededor del dibujo).
function achicar(img, ancho, alto) {
  let fuente = img, w = img.width, h = img.height;
  while (w / 2 > ancho && h / 2 > alto) {
    const paso = document.createElement('canvas');
    paso.width = Math.ceil(w / 2);
    paso.height = Math.ceil(h / 2);
    const c = paso.getContext('2d');
    c.imageSmoothingQuality = 'high';
    c.drawImage(fuente, 0, 0, w, h, 0, 0, paso.width, paso.height);
    fuente = paso; w = paso.width; h = paso.height;
  }
  const final = document.createElement('canvas');
  final.width = ancho;
  final.height = alto;
  const c = final.getContext('2d', { willReadFrequently: true });
  c.imageSmoothingQuality = 'high';
  c.drawImage(fuente, 0, 0, w, h, 0, 0, ancho, alto);
  const datos = c.getImageData(0, 0, ancho, alto);
  for (let i = 3; i < datos.data.length; i += 4) if (datos.data[i] < 60) datos.data[i] = 0;
  c.putImageData(datos, 0, 0);
  return final;
}

// Centro y caja de lo dibujado (alfa > 0) en un lienzo, y centro de masa.
function medir(lienzo) {
  const { width: w, height: h } = lienzo;
  const d = lienzo.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1, sx = 0, sy = 0, n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!d[(y * w + x) * 4 + 3]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      sx += x; sy += y; n++;
    }
  }
  if (!n) return { cx: w / 2, cy: h / 2, ancho: w, alto: h, mx: w / 2, my: h / 2 };
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, ancho: x1 - x0, alto: y1 - y0, mx: sx / n, my: sy / n };
}

// Prepara una fruta para que su dibujo mida "tam" píxeles de lado.
async function prepararFruta(f, tam) {
  const [entera, ...mitades] = await Promise.all([f.entera, ...f.mitades].map(cargarImagen));
  // Primero se mide a baja resolución para saber cuánto ocupa el dibujo dentro del cuadro.
  const muestra = achicar(entera, 160, Math.round(160 * entera.height / entera.width));
  const m = medir(muestra);
  const escala = tam / Math.max(m.ancho, m.alto) * (muestra.width / entera.width);
  const ancho = Math.round(entera.width * escala), alto = Math.round(entera.height * escala);
  const lienzos = [entera, ...mitades].map(img => achicar(img, ancho, alto));
  const centro = medir(lienzos[0]);
  return {
    color: f.jugo || '#e8c547',
    entera: lienzos[0],
    mitades: lienzos.slice(1).map(l => { const mm = medir(l); return { lienzo: l, dx: mm.mx - centro.cx, dy: mm.my - centro.cy }; }),
    cx: centro.cx, cy: centro.cy,
    radio: Math.max(centro.ancho, centro.alto) * 0.45,
  };
}

// Distancia de un punto a un segmento.
function distSegmento(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const largo2 = dx * dx + dy * dy;
  const t = largo2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / largo2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export class FruitNinja {
  constructor(config) {
    this.c = config;
    window.fruitNinja = this; // acceso desde la consola del navegador, para revisar problemas
    precargarFruitNinja(config);
    this.el = document.createElement('div');
    this.el.className = 'fruta-juego';
    this.el.innerHTML = `
      <canvas class="fruta-lienzo"></canvas>
      <div class="fruta-hud">
        <div class="fruta-contador"></div>
        <div class="fruta-escapadas"></div>
      </div>
      <button class="fruta-salir" title="Salir">✕</button>
      <div class="fruta-mensaje"></div>`;
    document.body.appendChild(this.el);
    this.lienzo = this.el.querySelector('.fruta-lienzo');
    this.ctx = this.lienzo.getContext('2d');
    this.elContador = this.el.querySelector('.fruta-contador');
    this.elEscapadas = this.el.querySelector('.fruta-escapadas');
    this.elMensaje = this.el.querySelector('.fruta-mensaje');

    this.frutas = [];    // en el aire, enteras
    this.mitades = [];   // cayendo después del corte
    this.gotas = [];     // jugo
    this.manchas = [];   // jugo pegado en el fondo, que se desvanece
    this.estela = [];    // puntos recientes del corte
    this.cortadas = 0;
    this.escapadas = 0;

    this.medir = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      this.W = innerWidth;
      this.H = innerHeight;
      this.lienzo.width = Math.round(this.W * dpr);
      this.lienzo.height = Math.round(this.H * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Gravedad (px/s²): cuanto más alta, más rápido suben y bajan las frutas (velocidad en mundo.json).
      this.g = this.H * 1.6 * (this.c.velocidad ?? 1) ** 2;
      this.prepararFondo();
    };
    addEventListener('resize', this.medir);

    this.lienzo.addEventListener('pointerdown', e => this.empezarCorte(e));
    this.lienzo.addEventListener('pointermove', e => this.moverCorte(e));
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) this.lienzo.addEventListener(t, () => { this.cortando = false; });
    this.el.querySelector('.fruta-salir').addEventListener('click', () => { this.abandonado = true; this.terminar?.(); });
  }

  sonar(cual) {
    const ruta = this.c.sonidos?.[cual];
    if (!ruta) return;
    const audio = sonidos.get(ruta)?.cloneNode() ?? new Audio(ruta);
    audio.volume = this.c.volumenSonidos ?? 0.6;
    audio.play().catch(() => {});
  }

  // El fondo, ajustado a la pantalla y apagado (menos color y luz) para que resalten las frutas.
  prepararFondo() {
    const img = this.imgFondo;
    if (!img) return;
    const f = document.createElement('canvas');
    f.width = this.lienzo.width;
    f.height = this.lienzo.height;
    const c = f.getContext('2d');
    const escala = Math.max(f.width / img.width, f.height / img.height);
    const w = img.width * escala, h = img.height * escala;
    if ('filter' in c) c.filter = 'saturate(0.55) brightness(0.6) blur(1.5px)';
    c.drawImage(img, (f.width - w) / 2, (f.height - h) / 2, w, h);
    c.filter = 'none';
    c.fillStyle = 'filter' in c ? 'rgba(12, 12, 28, 0.25)' : 'rgba(12, 12, 28, 0.5)';
    c.fillRect(0, 0, f.width, f.height);
    this.fondo = f;
  }

  empezarCorte(e) {
    this.cortando = true;
    this.lienzo.setPointerCapture?.(e.pointerId);
    this.estela = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    this.largoCorte = 0;
    this.cortoAlgo = false;
    this.sonoAire = false;
  }

  moverCorte(e) {
    if (!this.cortando) return;
    const ant = this.estela[this.estela.length - 1];
    const p = { x: e.clientX, y: e.clientY, t: performance.now() };
    this.estela.push(p);
    this.largoCorte += Math.hypot(p.x - ant.x, p.y - ant.y);
    if (!this.jugando) return;
    for (const f of [...this.frutas]) {
      if (distSegmento(f.x, f.y, ant.x, ant.y, p.x, p.y) <= f.tipo.radio) this.cortar(f, p.x - ant.x, p.y - ant.y);
    }
    // Un tajo largo que no le pegó a nada: suena el "fiu" en el aire.
    if (!this.cortoAlgo && !this.sonoAire && this.largoCorte > 140) {
      this.sonoAire = true;
      this.sonar('aire');
    }
  }

  cortar(f, sx, sy) {
    this.frutas.splice(this.frutas.indexOf(f), 1);
    this.cortadas++;
    this.cortoAlgo = true;
    this.sonar('corte');
    const t = f.tipo;
    // Gira la fruta para que la línea del corte quede a lo largo del tajo.
    const [m1, m2] = t.mitades;
    const eje = Math.atan2(m1.dy - m2.dy, m1.dx - m2.dx);
    let rot = Math.atan2(sy, sx) + Math.PI / 2 - eje;
    const vuelta = Math.PI * 2;
    const cerca = r => ((r - f.rot) % vuelta + vuelta * 1.5) % vuelta - vuelta / 2;
    if (Math.abs(cerca(rot + Math.PI)) < Math.abs(cerca(rot))) rot += Math.PI;
    for (const m of t.mitades) {
      const cos = Math.cos(rot), sin = Math.sin(rot);
      const dx = m.dx * cos - m.dy * sin, dy = m.dx * sin + m.dy * cos;
      const largo = Math.hypot(dx, dy) || 1;
      this.mitades.push({
        lienzo: m.lienzo, cx: t.cx, cy: t.cy, x: f.x, y: f.y, rot,
        vx: f.vx * 0.5 + dx / largo * 230, vy: Math.min(f.vy, 0) * 0.3 + dy / largo * 230 - 120,
        giro: (dx > 0 ? 1 : -1) * azar(3, 6),
      });
    }
    // Jugo: gotitas que salen disparadas y una mancha en el fondo.
    for (let i = 0; i < 22; i++) {
      const ang = Math.random() * Math.PI * 2, v = azar(120, 520);
      this.gotas.push({ x: f.x, y: f.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 120,
        r: azar(2.5, 6.5), color: t.color, vida: azar(0.5, 0.9) });
    }
    this.manchas.push({
      x: f.x, y: f.y, color: t.color, alfa: 0.7,
      gotas: Array.from({ length: 9 }, (_, i) => ({ dx: i ? azar(-1, 1) * t.radio * 1.3 : 0, dy: i ? azar(-1, 1) * t.radio * 1.3 : 0, r: i ? azar(0.15, 0.45) * t.radio : t.radio * 0.8 })),
    });
    this.actualizarHud();
  }

  lanzar(tipo) {
    const W = this.W, H = this.H, tam = tipo.radio * 2;
    const x = azar(W * 0.18, W * 0.82), y = H + tam * 0.6;
    const cima = azar(H * 0.15, H * 0.42);
    const vy = -Math.sqrt(2 * this.g * (y - cima));
    const subida = -vy / this.g;
    const vx = (azar(W * 0.3, W * 0.7) - x) / (subida * 2);
    this.frutas.push({ tipo, x, y, vx, vy, rot: azar(0, Math.PI * 2), giro: azar(-2.5, 2.5) });
  }

  actualizarHud() {
    this.elContador.textContent = `Cortadas: ${this.cortadas}/${this.total}`;
    this.elEscapadas.textContent = '✗'.repeat(this.escapadas);
  }

  avisar(texto, clase = '') {
    this.elMensaje.className = `fruta-mensaje ${clase}`;
    this.elMensaje.textContent = texto;
    void this.elMensaje.offsetWidth;
    this.elMensaje.classList.add('visible');
  }

  paso(dt) {
    const g = this.g, H = this.H;
    for (const f of [...this.frutas]) {
      f.vy += g * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.giro * dt;
      if (f.vy > 0 && f.y > H + f.tipo.radio * 2) {
        this.frutas.splice(this.frutas.indexOf(f), 1);
        this.escapadas++;
        this.actualizarHud();
        this.avisar('¡Se escapó una!', 'chico');
      }
    }
    for (const m of this.mitades) { m.vy += g * dt; m.x += m.vx * dt; m.y += m.vy * dt; m.rot += m.giro * dt; }
    this.mitades = this.mitades.filter(m => m.y < H + 300);
    for (const p of this.gotas) { p.vy += g * 0.8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vida -= dt; }
    this.gotas = this.gotas.filter(p => p.vida > 0);
    for (const s of this.manchas) s.alfa -= dt * 0.28;
    this.manchas = this.manchas.filter(s => s.alfa > 0);
    const ahora = performance.now();
    this.estela = this.estela.filter(p => ahora - p.t < 130);
  }

  dibujar() {
    const c = this.ctx, W = this.W, H = this.H;
    if (this.fondo) {
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(this.fondo, 0, 0);
      c.restore();
    } else {
      c.fillStyle = '#1b1b2f';
      c.fillRect(0, 0, W, H);
    }
    for (const s of this.manchas) {
      c.globalAlpha = s.alfa;
      c.fillStyle = s.color;
      for (const gt of s.gotas) { c.beginPath(); c.arc(s.x + gt.dx, s.y + gt.dy, gt.r, 0, Math.PI * 2); c.fill(); }
    }
    c.globalAlpha = 1;
    const sprite = (lienzo, x, y, rot, cx, cy) => {
      c.save();
      c.translate(x, y);
      c.rotate(rot);
      c.drawImage(lienzo, -cx, -cy);
      c.restore();
    };
    for (const m of this.mitades) sprite(m.lienzo, m.x, m.y, m.rot, m.cx, m.cy);
    for (const f of this.frutas) sprite(f.tipo.entera, f.x, f.y, f.rot, f.tipo.cx, f.tipo.cy);
    for (const p of this.gotas) {
      c.globalAlpha = Math.min(1, p.vida * 2);
      c.fillStyle = p.color;
      c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
    // Estela del corte: más gruesa en la punta, con un brillo suave.
    const e = this.estela;
    if (e.length > 1) {
      c.lineCap = 'round';
      for (let i = 1; i < e.length; i++) {
        const k = i / (e.length - 1);
        c.strokeStyle = `rgba(255, 255, 255, ${0.25 + 0.75 * k})`;
        c.shadowColor = 'rgba(190, 230, 255, 0.9)';
        c.shadowBlur = 12;
        c.lineWidth = 2 + 9 * k;
        c.beginPath(); c.moveTo(e[i - 1].x, e[i - 1].y); c.lineTo(e[i].x, e[i].y); c.stroke();
      }
      c.shadowBlur = 0;
    }
  }

  // Juega una partida. Devuelve { gano, cortadas, total, abandonado }.
  async correr() {
    requestAnimationFrame(() => this.el.classList.add('visible'));
    const tam = Math.max(64, Math.min(140, Math.min(innerWidth, innerHeight) * 0.17));
    const [fondo, ...tipos] = await Promise.all([
      this.c.fondo ? cargarImagen(this.c.fondo).catch(() => null) : null,
      ...this.c.frutas.map(f => prepararFruta(f, tam)),
    ]);
    this.imgFondo = fondo;
    this.medir();
    this.total = this.c.cantidad ?? 12;
    this.actualizarHud();

    // Bucle de dibujo (corre también durante la cuenta regresiva, para ver la estela).
    let antes = performance.now(), vivo = true;
    const cuadro = ahora => {
      if (!vivo) return;
      const dt = Math.min(0.05, (ahora - antes) / 1000);
      antes = ahora;
      this.paso(dt);
      this.dibujar();
      requestAnimationFrame(cuadro);
    };
    requestAnimationFrame(cuadro);
    const fin = new Promise(r => { this.terminar = r; });

    this.sonar('inicio');
    this.avisar(this.c.titulo || '¡Cortá todas las frutas!');
    await Promise.race([pausa(1600), fin]);
    for (const n of ['3', '2', '1']) {
      if (this.abandonado) break;
      this.avisar(n, 'grande');
      await Promise.race([pausa(650), fin]);
    }

    // Tandas: al principio de a una, hacia el final hasta cuatro juntas.
    if (!this.abandonado) {
      this.avisar('¡Ya!', 'grande');
      this.jugando = true;
      const bolsa = [];
      const siguienteTipo = () => {
        if (!bolsa.length) bolsa.push(...[...tipos].sort(() => Math.random() - 0.5));
        return bolsa.pop();
      };
      const tandas = [1, 1, 2, 1, 2, 3, 2, 3, 4, 3, 4];
      let lanzadas = 0;
      for (let i = 0; lanzadas < this.total && !this.abandonado; i++) {
        const n = Math.min(tandas[Math.min(i, tandas.length - 1)], this.total - lanzadas);
        for (let k = 0; k < n; k++) this.lanzar(siguienteTipo());
        lanzadas += n;
        this.sonar('lanzar');
        const v = this.c.velocidad ?? 1;
        await Promise.race([pausa(Math.max(1100, 1700 - i * 70) / v), fin]);
      }
      // Espera a que caigan las últimas.
      while (this.frutas.length && !this.abandonado) await Promise.race([pausa(100), fin]);
      this.jugando = false;
    }

    const gano = !this.abandonado && this.escapadas === 0 && this.cortadas >= this.total;
    if (!this.abandonado) {
      await pausa(600);
      this.elMensaje.classList.remove('visible');
      const cartel = document.createElement('div');
      cartel.className = `fruta-resultado ${gano ? 'gano' : 'perdio'}`;
      cartel.innerHTML = '<div class="fruta-resultado-titulo"></div><div class="fruta-resultado-detalle"></div><div class="fruta-resultado-ayuda">Tocá para volver a la fiesta</div>';
      cartel.children[0].textContent = gano ? '¡Las cortaste todas!' : `Se ${this.escapadas === 1 ? 'escapó una fruta' : `escaparon ${this.escapadas} frutas`}`;
      cartel.children[1].textContent = `Cortaste ${this.cortadas} de ${this.total}`;
      this.el.appendChild(cartel);
      await pausa(900);
      await Promise.race([new Promise(r => this.el.addEventListener('pointerup', r, { once: true })), fin]);
    }
    vivo = false;
    return { gano, cortadas: this.cortadas, total: this.total, abandonado: !!this.abandonado };
  }

  async cerrar() {
    removeEventListener('resize', this.medir);
    this.el.classList.remove('visible');
    await pausa(400);
    this.el.remove();
  }
}
