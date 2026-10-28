// Aviso "poné el celular en horizontal", con un celular que gira. Sale en los celulares
// cada vez que se abre o se refresca el juego (antes de la intro, si la hay).
// Sigue solo al tocar en cualquier lugar, y ese toque pone pantalla completa.
// Se configura en datos/mundo.json → "intro" ("girar" es el texto, "sinGirar" lo apaga).

const FUNDIDO = 700; // tiene que coincidir con la transición de .aviso-girar en estilos.css

const pausa = ms => new Promise(r => setTimeout(r, ms));

// En iPhone no existe (Safari no lo permite): ahí no hace nada.
function pantallaCompleta() {
  const raiz = document.documentElement;
  const pedir = raiz.requestFullscreen || raiz.webkitRequestFullscreen;
  if (!pedir || document.fullscreenElement || document.webkitFullscreenElement) return;
  pedir.call(raiz)?.catch?.(() => {});
}

// Solo en pantallas táctiles. Con ?girar se fuerza, para verlo en la PC.
export function hayQueAvisarGirar(config) {
  if (new URLSearchParams(location.search).has('girar')) return true;
  return !config.sinGirar && matchMedia('(pointer: coarse)').matches;
}

export class AvisoGirar {
  constructor(config) {
    this.el = document.createElement('div');
    this.el.className = 'aviso-girar';
    this.el.innerHTML = `
      <div class="intro-girar">
        <svg class="intro-celular" viewBox="-60 -60 120 120" width="150" height="150" aria-hidden="true">
          <path class="intro-flecha" d="M 38 -40 A 52 52 0 0 1 48 -6" fill="none" stroke-width="4" stroke-linecap="round"/>
          <path class="intro-flecha" d="M 41 -12 L 48 -4 L 54 -13" fill="none" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
          <g class="intro-celular-cuerpo">
            <rect x="-20" y="-36" width="40" height="72" rx="7" fill="none" stroke-width="4"/>
            <rect class="intro-celular-pantalla" x="-14" y="-28" width="28" height="52" rx="2"/>
            <circle cx="0" cy="30" r="2.5"/>
          </g>
        </svg>
        <div class="intro-girar-texto"></div>
        <div class="intro-girar-ayuda">Tocá para empezar</div>
      </div>`;
    this.el.querySelector('.intro-girar-texto').textContent =
      config.girar || 'Para una mejor experiencia, poné el celular en horizontal.';
    document.body.appendChild(this.el);
    requestAnimationFrame(() => this.el.querySelector('.intro-girar').classList.add('visible'));

    // El navegador solo permite pantalla completa como respuesta directa a un click o tap.
    this.tocado = new Promise(resolver => {
      this.el.addEventListener('click', () => {
        pantallaCompleta();
        // Si el juego todavía no terminó de cargar, que se note que el toque funcionó.
        this.el.querySelector('.intro-girar-ayuda').textContent = 'Cargando…';
        resolver();
      }, { once: true });
    });
  }

  async ocultar() {
    this.el.classList.add('saliendo');
    await pausa(FUNDIDO);
    this.el.remove();
  }
}
