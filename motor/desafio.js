// Desafío: una "batalla" de preguntas contra un personaje (por ejemplo, Arturo).
// El jugador aparece de espaldas a la izquierda, el rival arriba a la derecha y el cuadro de
// diálogo abajo a la derecha. Empieza con una entrada de unos segundos al ritmo de la música;
// después el rival pregunta y el jugador elige. Con cierta cantidad de errores se pierde.
// Se configura en datos/mundo.json → "desafios".

const MS_POR_LETRA = 22;
const pausa = ms => new Promise(r => setTimeout(r, ms));

// Mezcla una lista (para que la respuesta correcta no esté siempre en el mismo lugar).
function mezclar(lista) {
  const l = [...lista];
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]];
  }
  return l;
}

// Música y sonidos de cada desafío, ya descargados (ver precargarDesafio).
const musicas = new Map();
const sonidos = new Map();

// Baja de antemano las imágenes y la música, para que la entrada no espere nada.
export function precargarDesafio(config) {
  const imagenes = [...Object.values(config.rival?.splash || {}), ...Object.values(config.jugador?.splash || {})];
  for (const ruta of imagenes) new Image().src = ruta;
  if (config.musica && !musicas.has(config.musica)) {
    const audio = new Audio(config.musica);
    audio.preload = 'auto';
    audio.loop = true;
    musicas.set(config.musica, audio);
  }
  for (const ruta of Object.values(config.sonidos || {})) {
    if (sonidos.has(ruta)) continue;
    const audio = new Audio(ruta);
    audio.preload = 'auto';
    sonidos.set(ruta, audio);
  }
}

export class Desafio {
  constructor(config) {
    this.c = config;
    precargarDesafio(config);
    this.musica = musicas.get(config.musica);

    this.el = document.createElement('div');
    this.el.className = 'desafio';
    this.el.innerHTML = `
      <div class="desafio-fondo"></div>
      <div class="desafio-rayos"></div>
      <img class="desafio-jugador" alt="">
      <img class="desafio-rival" alt="">
      <div class="desafio-titulo"></div>
      <div class="desafio-marcador"></div>
      <div class="desafio-caja dialogo-caja">
        <div class="dialogo-nombre"></div>
        <div class="dialogo-texto"></div>
        <div class="dialogo-opciones"></div>
      </div>
      <div class="desafio-resultado"></div>
      <div class="desafio-destello"></div>`;
    document.body.appendChild(this.el);
    const $ = s => this.el.querySelector(s);
    this.elJugador = $('.desafio-jugador');
    this.elRival = $('.desafio-rival');
    this.elTitulo = $('.desafio-titulo');
    this.elMarcador = $('.desafio-marcador');
    this.elCaja = $('.desafio-caja');
    this.elTexto = $('.dialogo-texto');
    this.elOpciones = $('.dialogo-opciones');
    this.elResultado = $('.desafio-resultado');
    $('.dialogo-nombre').textContent = config.rival?.nombre || '';

    // Tocar el cuadro mientras se escribe completa el texto; las teclas 1, 2… eligen.
    this.elCaja.addEventListener('click', e => { if (!e.target.closest('button')) this.completarTexto(); });
    this.teclas = e => {
      if (this.alTerminarTexto && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.completarTexto(); return; }
      const botones = [...this.elOpciones.querySelectorAll('button')];
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= botones.length) botones[n - 1].click();
      else if ((e.key === 'Enter' || e.key === ' ') && botones.length === 1) { e.preventDefault(); botones[0].click(); }
    };
    document.addEventListener('keydown', this.teclas);
  }

  splash(jugador, rival) {
    if (jugador) this.elJugador.src = this.c.jugador.splash[jugador];
    if (rival) this.elRival.src = this.c.rival.splash[rival];
  }

  // Sonidos de "correcta", "incorrecta" y "victoria" (mundo.json → desafios → sonidos).
  sonar(cual) {
    const ruta = this.c.sonidos?.[cual];
    if (!ruta) return;
    const audio = sonidos.get(ruta)?.cloneNode() ?? new Audio(ruta);
    audio.volume = this.c.volumenSonidos ?? 0.5;
    audio.play().catch(() => {});
  }

  escribir(texto) {
    return new Promise(resolver => {
      clearInterval(this.intervalo);
      this.textoCompleto = texto;
      this.alTerminarTexto = resolver;
      this.elOpciones.innerHTML = '';
      let n = 0;
      this.elTexto.textContent = '';
      this.intervalo = setInterval(() => {
        this.elTexto.textContent = texto.slice(0, ++n);
        if (n >= texto.length) this.completarTexto();
      }, MS_POR_LETRA);
    });
  }

  completarTexto() {
    if (!this.alTerminarTexto) return;
    clearInterval(this.intervalo);
    this.elTexto.textContent = this.textoCompleto;
    const fn = this.alTerminarTexto;
    this.alTerminarTexto = null;
    fn();
  }

  // Muestra botones y devuelve el elegido.
  elegir(opciones) {
    return new Promise(resolver => {
      this.elOpciones.innerHTML = '';
      opciones.forEach((op, i) => {
        const b = document.createElement('button');
        b.className = 'dialogo-opcion';
        b.innerHTML = `<span class="tecla">${i + 1}</span>`;
        b.append(op.texto);
        b.addEventListener('click', () => { this.elOpciones.innerHTML = ''; resolver(op); }, { once: true });
        this.elOpciones.appendChild(b);
      });
    });
  }

  continuar(texto = 'Continuar') {
    return this.elegir([{ texto }]);
  }

  // Un punto por pregunta: vacío, acertada o errada.
  marcar(i, bien) {
    const punto = this.elMarcador.children[i];
    punto.classList.add(bien ? 'bien' : 'mal');
    punto.textContent = bien ? '✓' : '✗';
  }

  sacudir() {
    this.el.classList.remove('sacudir');
    void this.el.offsetWidth; // reinicia la animación
    this.el.classList.add('sacudir');
  }

  // Entrada: el rival desafiante en el centro con rayos y el título, al ritmo de la música;
  // al final se mueve a su lugar (arriba a la derecha) y pasa a su cara de las preguntas.
  async entrada() {
    const duracion = this.c.duracionEntrada ?? 4000;
    this.splash('neutral', 'desafiante');
    this.elTitulo.textContent = this.c.titulo || '';
    await Promise.all([this.elRival.decode(), this.elJugador.decode()].map(p => p.catch(() => {})));
    // Cuánto hay que correr al rival para que quede en el centro (un poco más abajo, por el título).
    const r = this.elRival.getBoundingClientRect();
    const dx = innerWidth / 2 - (r.left + r.width / 2);
    const dy = innerHeight * 0.67 - (r.top + r.height / 2);
    this.elRival.style.setProperty('--al-centro', `translate(${dx}px, ${dy}px)`);

    if (this.musica) {
      this.musica.currentTime = 0;
      this.musica.volume = this.c.volumen ?? 0.15;
      this.musica.play().catch(() => {});
    }
    this.el.classList.add('entrando');
    this.sacudir();
    await pausa(duracion * 0.75);
    // Se va a su lugar y cambia de cara.
    this.el.classList.add('acomodando');
    await pausa(duracion * 0.15);
    this.splash(null, 'pregunta');
    await pausa(duracion * 0.1);
    this.el.classList.remove('entrando', 'acomodando');
    this.el.classList.add('peleando');
  }

  // Devuelve true si el jugador ganó.
  async correr() {
    requestAnimationFrame(() => this.el.classList.add('visible'));
    await pausa(50);
    const preguntas = this.c.preguntas || [];
    const maxErrores = this.c.erroresParaPerder ?? 2;
    this.elMarcador.innerHTML = preguntas.map(() => '<span></span>').join('');
    await this.entrada();

    let errores = 0;
    for (const [i, p] of preguntas.entries()) {
      this.splash('neutral', 'pregunta');
      await this.escribir(p.texto);
      const elegida = await this.elegir(mezclar(p.respuestas));
      const bien = !!elegida.correcta;
      this.marcar(i, bien);
      if (!bien) {
        errores++;
        this.sacudir();
      }
      this.sonar(bien ? 'correcta' : 'incorrecta');
      this.splash(bien ? 'festejo' : 'derrotado', bien ? 'correcta' : 'incorrecta');
      await this.escribir(elegida.reaccion || '');
      await this.continuar();
      // Con el último error, después del comentario de la respuesta viene el texto de perder.
      if (errores >= maxErrores) break;
    }

    const gano = errores < maxErrores;
    this.splash(gano ? 'festejo' : 'derrotado', gano ? 'gana' : 'pierde');
    if (gano) {
      // La música del desafío se corta: suena solo la de victoria, y después silencio hasta salir.
      this.musica?.pause();
      this.sonar('victoria');
    } else {
      this.sacudir();
    }
    await this.escribir((gano ? this.c.textoGanar : this.c.textoPerder) || '');
    await this.continuar();

    // Cartel final.
    this.elCaja.classList.add('oculto');
    this.elResultado.innerHTML = '<div class="desafio-resultado-titulo"></div><div class="desafio-resultado-ayuda">Tocá para volver a la fiesta</div>';
    this.elResultado.firstChild.textContent = gano ? (this.c.cartelGanar || '¡GANASTE!') : (this.c.cartelPerder || 'PERDISTE');
    this.elResultado.classList.add('visible', gano ? 'gano' : 'perdio');
    this.el.classList.add(gano ? 'final-gano' : 'final-perdio');
    await pausa(1200);
    await new Promise(r => this.el.addEventListener('click', r, { once: true }));
    return gano;
  }

  async cerrar() {
    document.removeEventListener('keydown', this.teclas);
    clearInterval(this.intervalo);
    this.el.classList.remove('visible');
    // La música baja de a poco.
    const m = this.musica;
    if (m) {
      const v0 = m.volume;
      for (let k = 1; k <= 10; k++) { m.volume = v0 * (1 - k / 10); await pausa(60); }
      m.pause();
    } else {
      await pausa(600);
    }
    this.el.remove();
  }
}
