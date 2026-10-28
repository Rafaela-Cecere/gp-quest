// Pantalla de introducción: fondo negro, una animación (opcional) y textos que van apareciendo
// de a uno. Después, en negro, el contador de personas conocidas, y con un fundido empieza el juego.
// Tocar la pantalla (o una tecla) adelanta al siguiente texto. "Saltar" la termina.
// Se configura en datos/mundo.json → "intro".

import { esVideo } from './datos.js';

const MS_POR_LETRA = 47;   // cuánto tiempo queda cada texto según su largo
const MS_MINIMO = 2310;
const FUNDIDO = 700;       // tiene que coincidir con la transición de .intro-* en estilos.css

const pausa = ms => new Promise(r => setTimeout(r, ms));

export class Intro {
  constructor(config, { conocidas, total }) {
    this.config = config;
    this.conocidas = conocidas;
    this.total = config.total ?? total;
    this.saltada = false;

    this.el = document.createElement('div');
    this.el.className = 'intro';
    this.el.innerHTML = `
      <div class="intro-escena">
        <div class="intro-texto"></div>
        <div class="intro-animacion"></div>
      </div>
      <div class="intro-contador"></div>
      <button class="intro-saltar" type="button">Saltar ›</button>`;
    document.body.appendChild(this.el);
    this.elEscena = this.el.querySelector('.intro-escena');
    this.elTexto = this.el.querySelector('.intro-texto');
    this.elContador = this.el.querySelector('.intro-contador');

    const anim = config.animacion;
    const contenedor = this.el.querySelector('.intro-animacion');
    if (config.cuadros?.length) {
      // Animación cuadro por cuadro (como el bus): se repite en loop.
      const img = document.createElement('img');
      img.src = config.cuadros[0];
      contenedor.appendChild(img);
      config.cuadros.forEach(ruta => { new Image().src = ruta; }); // precarga, para que no parpadee
      let i = 0;
      this.reloj = setInterval(() => {
        i = (i + 1) % config.cuadros.length;
        img.src = config.cuadros[i];
      }, 1000 / (config.cuadrosPorSegundo || 8));
      // Movimiento extra: un temblequeo suave, como un motor en marcha.
      if (!config.sinTemblor) contenedor.classList.add('intro-temblor');
    } else if (anim) {
      const media = document.createElement(esVideo(anim) ? 'video' : 'img');
      media.src = anim;
      if (media.tagName === 'VIDEO') Object.assign(media, { autoplay: true, loop: true, muted: true, playsInline: true });
      contenedor.appendChild(media);
    }

    // Tocar o apretar una tecla adelanta; el botón salta todo.
    const adelantar = () => this.adelantar?.();
    this.el.addEventListener('pointerdown', e => { if (!e.target.closest('.intro-saltar')) adelantar(); });
    this.teclas = e => { if (e.key !== 'Escape') adelantar(); else this.saltar(); };
    document.addEventListener('keydown', this.teclas);
    this.el.querySelector('.intro-saltar').addEventListener('click', () => this.saltar());
  }

  // Espera un tiempo, o menos si la persona toca la pantalla.
  esperar(ms) {
    if (this.saltada) return Promise.resolve();
    return new Promise(resolver => {
      const fin = () => { clearTimeout(t); this.adelantar = null; resolver(); };
      const t = setTimeout(fin, ms);
      this.adelantar = fin;
    });
  }

  saltar() {
    this.saltada = true;
    this.adelantar?.();
  }

  // Muestra los textos y el contador. Termina cuando ya se puede pasar al juego.
  async correr() {
    requestAnimationFrame(() => this.elEscena.classList.add('visible'));
    for (const [i, linea] of (this.config.lineas || []).entries()) {
      if (this.saltada) break;
      this.elTexto.textContent = linea;
      this.elTexto.classList.add('visible');
      // El primer texto puede quedar un rato más (mundo.json → intro.extraPrimerTexto, en segundos).
      const extra = i === 0 ? (this.config.extraPrimerTexto ?? 0) * 1000 : 0;
      await this.esperar(Math.max(MS_MINIMO, linea.length * MS_POR_LETRA) + extra);
      this.elTexto.classList.remove('visible');
      if (!this.saltada) await pausa(FUNDIDO);
    }
    if (this.saltada) return;
    this.elEscena.classList.remove('visible');
    await pausa(FUNDIDO);
    const plantilla = this.config.contador || 'PERSONAS CONOCIDAS: {conocidas}/{total}';
    this.elContador.textContent = plantilla.replace('{conocidas}', this.conocidas).replace('{total}', this.total);
    this.elContador.classList.add('visible');
    await this.esperar(2500);
  }

  // Fundido al juego.
  async ocultar() {
    document.removeEventListener('keydown', this.teclas);
    this.el.classList.add('saliendo');
    await pausa(1000);
    clearInterval(this.reloj);
    this.el.remove();
  }
}
