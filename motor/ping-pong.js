// Minijuego de ping pong: la paleta negra (la compu) te tira la pelota y vos la devolvés moviendo
// la paleta roja de costado (mouse apretado, dedo o flechas). Gana el primero que llega a N puntos.
// Se dibuja en un canvas propio encima del juego (el mundo queda en pausa mientras dura).
// Se configura en datos/mundo.json → "pingPong".
//
// La mesa del fondo está en perspectiva: la pelota se mueve en metros sobre una mesa de verdad
// (1,525 × 2,74 m) y se proyecta sobre la imagen; por eso se achica al alejarse.
// Las paletas vienen en imágenes del mismo tamaño que el fondo, cada una ya en su lugar.

const pausa = ms => new Promise(r => setTimeout(r, ms));
const azar = (a, b) => a + Math.random() * (b - a);
const limitar = (v, a, b) => Math.max(a, Math.min(b, v));

// Mesa (metros). z = 0 es el borde de tu lado y z = LARGO el del rival; y es la altura sobre la mesa.
const MEDIO_ANCHO = 0.7625, LARGO = 2.74, ALTO_RED = 0.1525, ALTO_MESA = 0.76;
// Dónde se le pega a la pelota: un poco detrás de cada punta de la mesa.
const Z_JUGADOR = -0.6, Z_RIVAL = LARGO + 0.6;
// Cómo se ve la mesa en Fondo-Tenis.png (1774 × 887 px): centro, horizonte, borde cercano y
// cuántos píxeles mide un metro en el borde cercano. Se pueden cambiar en mundo.json → pingPong.vista.
const VISTA = { ancho: 1774, alto: 887, cx: 904, horizonte: 329, profundidad: 389, metro: 383, k: 1.07 };
// Centro de la cara de cada paleta dentro de su imagen (donde se le pega a la pelota).
const CARA_JUGADOR = { x: 732, y: 745 }, CARA_RIVAL = { x: 980, y: 447 };

const ALCANCE = 0.19;        // qué tan lejos del centro de la paleta todavía se le pega (m)
const DURACION_TIRO = 1.05;  // segundos desde el golpe hasta el pique, al principio del peloteo
const DURACION_MINIMA = 0.6;
const GRAVEDAD = 4;          // más suave que la real, para que se pueda seguir con la vista
const REBOTE = 0.75;

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
export function precargarPingPong(c) {
  if (!c) return;
  for (const r of [c.fondo, c.paletaJugador, c.paletaRival, c.pelota]) if (r) cargarImagen(r).catch(() => {});
  for (const r of Object.values(c.sonidos || {})) {
    if (!r || sonidos.has(r)) continue;
    const a = new Audio(r);
    a.preload = 'auto';
    sonidos.set(r, a);
  }
}

// Recorta una paleta a lo dibujado; guarda dónde queda ese recorte dentro de la imagen original.
function recortar(img) {
  const l = document.createElement('canvas');
  l.width = img.width;
  l.height = img.height;
  const c = l.getContext('2d', { willReadFrequently: true });
  c.drawImage(img, 0, 0);
  const d = c.getImageData(0, 0, l.width, l.height).data;
  let x0 = l.width, y0 = l.height, x1 = -1, y1 = -1;
  for (let y = 0; y < l.height; y++) {
    for (let x = 0; x < l.width; x++) {
      if (d[(y * l.width + x) * 4 + 3] < 40) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { lienzo: l, x: 0, y: 0 };
  const r = document.createElement('canvas');
  r.width = x1 - x0 + 1;
  r.height = y1 - y0 + 1;
  r.getContext('2d').drawImage(l, -x0, -y0);
  return { lienzo: r, x: x0, y: y0 };
}

export class PingPong {
  constructor(config) {
    this.c = config;
    this.v = { ...VISTA, ...config.vista };
    window.pingPong = this; // acceso desde la consola del navegador, para revisar problemas
    precargarPingPong(config);
    this.el = document.createElement('div');
    this.el.className = 'fruta-juego';
    this.el.innerHTML = `
      <canvas class="fruta-lienzo ping-lienzo"></canvas>
      <div class="fruta-hud"><div class="ping-marcador"></div></div>
      <button class="fruta-salir" title="Salir">✕</button>
      <div class="fruta-mensaje"></div>`;
    document.body.appendChild(this.el);
    this.lienzo = this.el.querySelector('.fruta-lienzo');
    this.ctx = this.lienzo.getContext('2d');
    this.elMarcador = this.el.querySelector('.ping-marcador');
    this.elMensaje = this.el.querySelector('.fruta-mensaje');

    this.puntos = { jugador: 0, rival: 0 };
    this.golpes = 0;       // golpes del peloteo actual (cuantos más, más rápido)
    this.pelota = null;
    this.estela = [];
    this.destellos = [];
    this.teclas = new Set();

    // Paletas: x es la posición de costado (m) en su plano de golpe; y, la altura de la cara.
    const v = this.v;
    const sJ = this.escalaEn(Z_JUGADOR), sR = this.escalaEn(Z_RIVAL);
    const reposo = (cara, z, s) => ({
      x: (cara.x - v.cx) / (v.metro * s),
      y: (v.horizonte + v.profundidad * s - cara.y) / (v.metro * s),
    });
    this.jugador = { ...reposo(CARA_JUGADOR, Z_JUGADOR, sJ), golpe: 0 };
    this.jugador.reposoY = this.jugador.y;
    this.jugador.objetivo = this.jugador.x;
    this.rival = { ...reposo(CARA_RIVAL, Z_RIVAL, sR), golpe: 0, reaccion: 0, error: 0 };
    this.rival.reposoY = this.rival.y;

    this.medir = () => {
      this.dpr = Math.min(devicePixelRatio || 1, 2);
      this.W = innerWidth;
      this.H = innerHeight;
      this.lienzo.width = Math.round(this.W * this.dpr);
      this.lienzo.height = Math.round(this.H * this.dpr);
      // El fondo cubre la pantalla, pero sin cortar la mesa (en pantallas angostas queda con bordes).
      this.escala = Math.min(Math.max(this.W / v.ancho, this.H / v.alto), this.W / 760);
      this.ox = limitar(this.W / 2 - v.cx * this.escala, this.W - v.ancho * this.escala, 0);
      if (v.ancho * this.escala < this.W) this.ox = (this.W - v.ancho * this.escala) / 2;
      this.oy = (this.H - v.alto * this.escala) / 2;
    };
    addEventListener('resize', this.medir);

    // Mientras está apretado (o con el dedo apoyado), la paleta va hacia donde está el puntero.
    const seguir = e => {
      if (e.pointerType === 'mouse' && !(e.buttons & 1)) return;
      const x = (e.clientX - this.ox) / this.escala;
      this.jugador.objetivo = limitar((x - v.cx) / (v.metro * sJ), -1.1, 1.1);
    };
    this.lienzo.addEventListener('pointerdown', e => { this.lienzo.setPointerCapture?.(e.pointerId); seguir(e); });
    this.lienzo.addEventListener('pointermove', seguir);
    this.alTeclear = e => {
      const k = e.key.toLowerCase();
      if (!['arrowleft', 'arrowright', 'a', 'd'].includes(k)) return;
      e.preventDefault();
      if (e.type === 'keydown') this.teclas.add(k); else this.teclas.delete(k);
    };
    addEventListener('keydown', this.alTeclear);
    addEventListener('keyup', this.alTeclear);
    this.el.querySelector('.fruta-salir').addEventListener('click', () => { this.abandonado = true; this.terminar?.(); });
  }

  escalaEn(z) { return 1 / (1 + this.v.k * z / LARGO); }

  // De metros sobre la mesa a píxeles del fondo.
  proyectar(x, y, z) {
    const v = this.v, s = this.escalaEn(z);
    return { x: v.cx + x * v.metro * s, y: v.horizonte + v.profundidad * s - y * v.metro * s, s };
  }

  sonar(cual) {
    const ruta = this.c.sonidos?.[cual];
    if (!ruta) return;
    const audio = sonidos.get(ruta)?.cloneNode() ?? new Audio(ruta);
    audio.volume = this.c.volumenSonidos ?? 0.6;
    audio.play().catch(() => {});
  }

  actualizarHud() {
    this.elMarcador.textContent = `Vos ${this.puntos.jugador} – ${this.puntos.rival} Rival`;
  }

  avisar(texto, clase = '') {
    this.elMensaje.className = `fruta-mensaje ${clase}`;
    this.elMensaje.textContent = texto;
    void this.elMensaje.offsetWidth;
    this.elMensaje.classList.add('visible');
  }

  // Cuánto tarda un tiro hasta picar: cada golpe del peloteo (y cada punto jugado) lo acelera un poco.
  duracionTiro() {
    const jugados = this.puntos.jugador + this.puntos.rival;
    const t = Math.max(DURACION_MINIMA, DURACION_TIRO * 0.95 ** this.golpes) * (1 - 0.015 * jugados);
    return t / (this.c.velocidad ?? 1);
  }

  // Tira la pelota desde "o" para que pique en (xPique, zPique). Si no pasaría la red, la tira más alta.
  tirar(o, xPique, zPique, desde) {
    const T0 = this.duracionTiro();
    const g = GRAVEDAD * (DURACION_TIRO / T0) ** 2; // más rápido, pero con la misma forma de arco
    let T = T0, vz, vy;
    for (let i = 0; i < 15; i++) {
      vz = (zPique - o.z) / T;
      vy = (0.5 * g * T * T - o.y) / T;
      const tRed = (LARGO / 2 - o.z) / vz;
      if (o.y + vy * tRed - 0.5 * g * tRed * tRed > ALTO_RED + 0.06) break;
      T *= 1.08;
    }
    this.pelota = { x: o.x, y: o.y, z: o.z, vx: (xPique - o.x) / T, vy, vz, g, desde, pico: false };
    this.estela = [];
  }

  sacar() {
    const r = this.rival;
    this.golpes = 0;
    this.pelota = { x: r.x, y: r.y, z: Z_RIVAL, vx: 0, vy: 0, vz: 0, g: 0, quieta: true };
    this.estela = [];
    this.saque = 0.5;
  }

  // El rival devuelve: a veces al azar, a veces lejos de donde estás vos.
  golpeRival() {
    const p = this.pelota, j = this.jugador;
    const lejos = Math.random() < 0.4;
    const x = lejos ? -Math.sign(j.x || 1) * azar(0.3, 0.68) : azar(-0.68, 0.68);
    this.rival.golpe = 0.18;
    this.sonar('golpe');
    this.destello(p);
    this.tirar({ x: p.x, y: p.y, z: Z_RIVAL }, x, azar(0.5, 1.1), 'rival');
  }

  // Le pegaste: según en qué parte de la paleta pegó, sale hacia un lado o el otro.
  golpeJugador(p) {
    const j = this.jugador, r = this.rival;
    const lado = limitar((p.x - j.x) / ALCANCE, -1, 1);
    this.golpes++;
    j.golpe = 0.18;
    this.sonar('golpe');
    this.destello(p);
    this.tirar({ x: p.x, y: p.y, z: Z_JUGADOR }, limitar(lado * 0.75 + azar(-0.08, 0.08), -0.7, 0.7), azar(1.9, 2.5), 'jugador');
    // El rival tarda un poquito en reaccionar y a veces calcula mal.
    const nivel = this.c.nivelRival ?? 1;
    r.reaccion = azar(0.18, 0.3) / nivel;
    r.error = Math.random() < 0.1 / nivel ? (Math.random() < 0.5 ? -1 : 1) * azar(0.2, 0.32) : azar(-0.04, 0.04);
  }

  destello(p) {
    const q = this.proyectar(p.x, p.y, p.z);
    this.destellos.push({ x: q.x, y: q.y, s: q.s, t: 0 });
  }

  fallar(ganador) {
    if (this.fallo) return;
    this.fallo = { ganador, t: 0.8 };
  }

  anotar(ganador) {
    this.puntos[ganador]++;
    this.actualizarHud();
    if (ganador === 'jugador') {
      this.sonar('puntoGanado');
      this.avisar('¡Punto!', 'chico bien');
    } else {
      this.sonar('puntoPerdido');
      this.avisar('Punto para el rival', 'chico');
    }
    this.pelota = null;
    this.fallo = null;
    this.alTerminarPunto?.();
  }

  paso(dt) {
    const j = this.jugador, r = this.rival;
    // Tu paleta: sigue al puntero (o se mueve con las flechas), rápido pero no instantáneo.
    const dir = (this.teclas.has('arrowright') || this.teclas.has('d')) - (this.teclas.has('arrowleft') || this.teclas.has('a'));
    if (dir) j.objetivo = limitar(j.x + dir * 0.4, -1.1, 1.1);
    j.x += limitar(j.objetivo - j.x, -4 * dt, 4 * dt);

    const p = this.pelota;
    // Las caras de las paletas suben o bajan para ir a buscar la pelota cuando se acerca.
    const altura = (pal, viene) => {
      const objetivo = viene ? limitar(p.y, 0.06, 0.55) : pal.reposoY;
      pal.y += (objetivo - pal.y) * Math.min(1, dt * 8);
    };
    altura(j, p && !p.quieta && p.vz < 0 && p.z < LARGO / 2);
    altura(r, p && !p.quieta && p.vz > 0 && p.z > LARGO / 2);
    j.golpe = Math.max(0, j.golpe - dt);
    r.golpe = Math.max(0, r.golpe - dt);

    // El rival va hacia donde calcula que va a llegar la pelota; si no, vuelve hacia el medio.
    const velRival = 0.95 * (this.c.nivelRival ?? 1);
    let objetivo = 0.1;
    if (p && !p.quieta && p.desde === 'jugador' && !this.fallo) {
      r.reaccion -= dt;
      objetivo = r.reaccion > 0 ? r.x : p.x + p.vx * (Z_RIVAL - p.z) / p.vz + r.error;
    }
    if (!p?.quieta) r.x += limitar(objetivo - r.x, -velRival * dt, velRival * dt);

    for (const d of this.destellos) d.t += dt;
    this.destellos = this.destellos.filter(d => d.t < 0.3);

    if (this.fallo && (this.fallo.t -= dt) <= 0) {
      this.anotar(this.fallo.ganador);
      return;
    }
    if (!p) return;
    if (p.quieta) {
      p.x = r.x;
      p.y = r.y;
      if ((this.saque -= dt) <= 0 && this.jugando) this.golpeRival();
      return;
    }

    const antes = { ...p };
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    p.vy -= p.g * dt;
    p.y += p.vy * dt;
    const sobreMesa = Math.abs(p.x) <= MEDIO_ANCHO + 0.02 && p.z >= 0 && p.z <= LARGO;
    if (p.y <= 0 && antes.y >= 0 && p.vy < 0 && sobreMesa) {
      p.y = 0;
      p.vy = -p.vy * REBOTE;
      p.pico = true;
      this.sonar('pique');
    } else if (p.y < -ALTO_MESA && p.vy < 0) {
      // Pasto: rebota bajito.
      p.y = -ALTO_MESA;
      p.vy = -p.vy * 0.45;
    }

    // ¿Cruzó el plano de alguna paleta?
    const cruza = (z0, z1, zp) => (z0 - zp) * (z1 - zp) <= 0 && z0 !== z1;
    if (!this.fallo && p.vz < 0 && cruza(antes.z, p.z, Z_JUGADOR)) {
      const k = (Z_JUGADOR - antes.z) / (p.z - antes.z);
      const x = antes.x + (p.x - antes.x) * k, y = antes.y + (p.y - antes.y) * k;
      if (Math.abs(x - j.x) <= ALCANCE) this.golpeJugador({ x, y });
      else this.fallar('rival');
    } else if (!this.fallo && p.vz > 0 && cruza(antes.z, p.z, Z_RIVAL)) {
      const k = (Z_RIVAL - antes.z) / (p.z - antes.z);
      p.x = antes.x + (p.x - antes.x) * k;
      p.y = antes.y + (p.y - antes.y) * k;
      p.z = Z_RIVAL;
      if (Math.abs(p.x - r.x) <= ALCANCE - 0.02) this.golpeRival();
      else this.fallar('jugador');
    }

    if (p.z < -1.4) {
      this.estela = []; // ya pasó de largo (y se dejó de dibujar)
      return;
    }
    this.estela.push(this.proyectar(p.x, p.y, p.z));
    if (this.estela.length > 6) this.estela.shift();
  }

  dibujar() {
    const c = this.ctx, v = this.v;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = '#12121f';
    c.fillRect(0, 0, this.W, this.H);
    const e = this.escala * this.dpr;
    c.setTransform(e, 0, 0, e, this.ox * this.dpr, this.oy * this.dpr);
    if (this.fondo) c.drawImage(this.fondo, 0, 0, v.ancho, v.alto);

    const p = this.pelota;
    const diametro = 0.07 * (this.c.tamPelota ?? 1) * v.metro;
    // Sombra de la pelota sobre la mesa: más chica y clara cuanto más alta está.
    if (p && Math.abs(p.x) <= MEDIO_ANCHO && p.z >= 0 && p.z <= LARGO && p.y >= 0) {
      const q = this.proyectar(p.x, 0, p.z);
      const a = Math.max(0, 0.35 * (1 - p.y / 0.9));
      c.fillStyle = `rgba(10, 30, 60, ${a})`;
      c.beginPath();
      c.ellipse(q.x, q.y, diametro * q.s * 0.6, diametro * q.s * 0.25, 0, 0, Math.PI * 2);
      c.fill();
    }

    // Lo más lejano primero: paleta del rival, pelota y tu paleta (salvo que la pelota ya las haya pasado).
    const paleta = (img, cara, pal, z) => {
      if (!img) return;
      const q = this.proyectar(pal.x, pal.y, z);
      const k = 1 + pal.golpe * 0.5;
      c.save();
      c.translate(q.x, q.y);
      c.scale(k, k);
      c.rotate(-pal.golpe * 0.9);
      c.drawImage(img.lienzo, img.x - cara.x, img.y - cara.y);
      c.restore();
    };
    const capas = [
      { z: Z_RIVAL, dibujar: () => paleta(this.imgRival, CARA_RIVAL, this.rival, Z_RIVAL) },
      { z: Z_JUGADOR, dibujar: () => paleta(this.imgJugador, CARA_JUGADOR, this.jugador, Z_JUGADOR) },
    ];
    // (Si se te pasó, deja de dibujarse antes de llegar a la cámara.)
    if (p && p.z > -1.4) capas.push({ z: p.z + (p.quieta ? -0.01 : 0), dibujar: () => this.dibujarPelota(p, diametro) });
    capas.sort((a, b) => b.z - a.z).forEach(x => x.dibujar());

    for (const d of this.destellos) {
      const k = d.t / 0.3;
      c.strokeStyle = `rgba(255, 255, 255, ${1 - k})`;
      c.lineWidth = 6 * d.s;
      c.beginPath();
      c.arc(d.x, d.y, diametro * d.s * (0.6 + k * 1.6), 0, Math.PI * 2);
      c.stroke();
    }
  }

  dibujarPelota(p, diametro) {
    const c = this.ctx;
    // Estela suave, para que se note la velocidad.
    this.estela.forEach((q, i) => {
      c.fillStyle = `rgba(255, 255, 255, ${0.05 + i * 0.04})`;
      c.beginPath();
      c.arc(q.x, q.y, diametro * q.s * 0.4, 0, Math.PI * 2);
      c.fill();
    });
    const q = this.proyectar(p.x, p.y, p.z);
    const d = diametro * q.s;
    // Del otro lado de la red y más baja que ella: se ve a través de la red.
    c.globalAlpha = p.z > LARGO / 2 && p.y < ALTO_RED && p.y > -0.05 ? 0.6 : 1;
    if (this.imgPelota) {
      const lado = d / 0.68; // la pelota ocupa más o menos el 68% de su imagen
      c.drawImage(this.imgPelota, q.x - lado / 2, q.y - lado / 2, lado, lado);
    } else {
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(q.x, q.y, d / 2, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  // Juega un partido. Devuelve { gano, puntos, abandonado }.
  async correr() {
    requestAnimationFrame(() => this.el.classList.add('visible'));
    const opcional = r => r ? cargarImagen(r).catch(() => null) : null;
    const [fondo, jugador, rival, pelota] = await Promise.all(
      [this.c.fondo, this.c.paletaJugador, this.c.paletaRival, this.c.pelota].map(opcional));
    this.fondo = fondo;
    this.imgJugador = jugador && recortar(jugador);
    this.imgRival = rival && recortar(rival);
    this.imgPelota = pelota;
    this.medir();
    const meta = this.c.puntos ?? 5;
    this.actualizarHud();

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
    this.avisar(this.c.titulo || `¡El primero a ${meta} gana!`);
    await Promise.race([pausa(1600), fin]);
    for (const n of ['3', '2', '1']) {
      if (this.abandonado) break;
      this.avisar(n, 'grande');
      await Promise.race([pausa(650), fin]);
    }

    if (!this.abandonado) {
      this.avisar('¡Ya!', 'grande');
      this.jugando = true;
      while (!this.abandonado && this.puntos.jugador < meta && this.puntos.rival < meta) {
        this.sacar();
        await Promise.race([new Promise(r => { this.alTerminarPunto = r; }), fin]);
        if (!this.abandonado) await Promise.race([pausa(900), fin]);
      }
      this.jugando = false;
    }

    const gano = !this.abandonado && this.puntos.jugador >= meta;
    if (!this.abandonado) {
      this.elMensaje.classList.remove('visible');
      const cartel = document.createElement('div');
      cartel.className = `fruta-resultado ${gano ? 'gano' : 'perdio'}`;
      cartel.innerHTML = '<div class="fruta-resultado-titulo"></div><div class="fruta-resultado-detalle"></div><div class="fruta-resultado-ayuda">Tocá para volver a la fiesta</div>';
      cartel.children[0].textContent = gano ? '¡Ganaste el partido!' : 'Perdiste el partido';
      cartel.children[1].textContent = `${this.puntos.jugador} a ${this.puntos.rival}`;
      this.el.appendChild(cartel);
      await pausa(900);
      await Promise.race([new Promise(r => this.el.addEventListener('pointerup', r, { once: true })), fin]);
    }
    vivo = false;
    return { gano, puntos: { ...this.puntos }, abandonado: !!this.abandonado };
  }

  async cerrar() {
    removeEventListener('resize', this.medir);
    removeEventListener('keydown', this.alTeclear);
    removeEventListener('keyup', this.alTeclear);
    this.el.classList.remove('visible');
    await pausa(400);
    this.el.remove();
  }
}
