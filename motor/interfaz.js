// Interfaz sobre el juego: objetivo, agenda de contactos, avisos y pantalla final.

export class Interfaz {
  constructor(mundo, personajes, estado) {
    this.mundo = mundo;
    this.personajes = personajes;
    this.estado = estado;

    this.hud = document.createElement('div');
    this.hud.className = 'hud';
    this.hud.innerHTML = `
      <button class="hud-boton hud-pantalla" title="Pantalla completa" aria-label="Pantalla completa">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>
        </svg>
      </button>
      <button class="hud-boton hud-agenda" title="Agenda de contactos">Agenda <span class="hud-contador"></span></button>`;
    document.body.appendChild(this.hud);
    this.elContador = this.hud.querySelector('.hud-contador');
    this.hud.querySelector('.hud-agenda').addEventListener('click', () => this.abrirAgenda());

    // Pantalla completa. En iPhone el navegador no lo permite: ahí el botón no aparece
    // (se puede usar "Agregar a pantalla de inicio" desde Safari).
    const botonPantalla = this.hud.querySelector('.hud-pantalla');
    const raiz = document.documentElement;
    const pedir = raiz.requestFullscreen || raiz.webkitRequestFullscreen;
    if (!pedir) botonPantalla.classList.add('oculto');
    botonPantalla.addEventListener('click', () => {
      const actual = document.fullscreenElement || document.webkitFullscreenElement;
      if (actual) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else pedir.call(raiz)?.catch?.(() => {});
    });

    this.agenda = document.createElement('div');
    this.agenda.className = 'modal oculto';
    this.agenda.innerHTML = `
      <div class="modal-caja agenda-caja">
        <div class="agenda-desplazable">
          <div class="agenda-objetivo"></div>
          <div class="modal-titulo">Agenda de contactos <span class="agenda-total"></span></div>
          <div class="agenda-grilla"></div>
        </div>
        <div class="modal-botones">
          <button class="boton-secundario agenda-reiniciar">Reiniciar partida</button>
          <button class="boton agenda-cerrar">Cerrar</button>
        </div>
      </div>`;
    document.body.appendChild(this.agenda);
    this.agenda.querySelector('.agenda-cerrar').addEventListener('click', () => this.cerrarAgenda());
    this.agenda.querySelector('.agenda-reiniciar').addEventListener('click', () => {
      if (confirm('¿Borrar el progreso y empezar de nuevo?')) this.reiniciar();
    });
    this.agenda.addEventListener('click', e => { if (e.target === this.agenda) this.cerrarAgenda(); });

    this.final = document.createElement('div');
    this.final.className = 'modal oculto';
    this.final.innerHTML = `
      <div class="modal-caja final-caja">
        <div class="final-titulo">¡Lo lograste!</div>
        <p class="final-texto"></p>
        <div class="modal-botones">
          <button class="boton-secundario final-reiniciar">Jugar de nuevo</button>
          <button class="boton final-seguir">Seguir explorando</button>
        </div>
      </div>`;
    document.body.appendChild(this.final);
    this.final.querySelector('.final-seguir').addEventListener('click', () => this.final.classList.add('oculto'));
    this.final.querySelector('.final-reiniciar').addEventListener('click', () => this.reiniciar());

    this.aviso = document.createElement('div');
    this.aviso.className = 'aviso';
    document.body.appendChild(this.aviso);

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.cerrarAgenda();
      if ((e.key === 'q' || e.key === 'Q' || e.key === 'Tab') && !this.bloqueaJuego()) {
        e.preventDefault();
        this.abrirAgenda();
      }
    });

    this.actualizar();
  }

  // Mientras haya una ventana abierta, el personaje no se mueve.
  bloqueaJuego() {
    return !this.agenda.classList.contains('oculto') || !this.final.classList.contains('oculto');
  }

  conocibles() {
    return this.personajes.filter(p => !p.agendaAlFinal || this.estado.conoce(p.id));
  }

  textoObjetivo() {
    const obj = this.mundo.objetivo;
    const cantidad = this.estado.cantidadContactos(this.personajes);
    if (this.estado.terminado) return '¡Objetivo cumplido! Seguí conociendo gente.';
    if (cantidad < obj.contactosNecesarios) {
      return `${obj.titulo} Llevás ${cantidad} de ${obj.contactosNecesarios}.`;
    }
    return `${obj.titulo} ¡Ya podés conocer al invitado especial, buscalo!`;
  }

  actualizar() {
    this.elContador.textContent = `${this.estado.contactos.length}/${this.conocibles().length}`;
  }

  // Por defecto dura 2,6 s (ver .aviso en estilos.css); se puede pedir más.
  mostrarAviso(texto, segundos = 2.6) {
    this.aviso.textContent = texto;
    this.aviso.style.animationDuration = `${segundos}s`;
    this.aviso.classList.remove('visible');
    void this.aviso.offsetWidth; // reinicia la animación
    this.aviso.classList.add('visible');
  }

  abrirAgenda() {
    const lista = this.conocibles();
    this.agenda.querySelector('.agenda-objetivo').innerHTML = '<span class="agenda-objetivo-titulo">Objetivo</span>';
    this.agenda.querySelector('.agenda-objetivo').append(this.textoObjetivo());
    this.agenda.querySelector('.agenda-total').textContent = `${this.estado.contactos.length}/${lista.length}`;
    const grilla = this.agenda.querySelector('.agenda-grilla');
    grilla.innerHTML = '';
    for (const p of lista) {
      const conocido = this.estado.conoce(p.id);
      const tarjeta = document.createElement('div');
      tarjeta.className = 'tarjeta' + (conocido ? '' : ' tarjeta-bloqueada');
      const img = document.createElement('img');
      img.src = p.retrato || p.sprite;
      if (!p.retrato) img.className = 'tarjeta-sprite';
      const nombre = document.createElement('div');
      nombre.className = 'tarjeta-nombre';
      nombre.textContent = conocido ? p.nombre : '???';
      const puesto = document.createElement('div');
      puesto.className = 'tarjeta-puesto';
      puesto.textContent = conocido ? p.puesto || '' : 'Todavía no se conocen';
      tarjeta.append(img, nombre, puesto);
      if (conocido && p.frase) {
        const frase = document.createElement('div');
        frase.className = 'tarjeta-frase';
        frase.textContent = `"${p.frase}"`;
        tarjeta.append(frase);
      }
      grilla.appendChild(tarjeta);
    }
    this.agenda.classList.remove('oculto');
  }

  cerrarAgenda() {
    this.agenda.classList.add('oculto');
  }

  mostrarFinal() {
    const n = this.estado.contactos.length;
    const total = this.conocibles().length;
    this.final.querySelector('.final-texto').textContent =
      `Conociste al invitado especial y a ${n} de ${total} personas. ¡Feliz fin de año!`;
    this.final.classList.remove('oculto');
  }

  reiniciar() {
    this.estado.reiniciar();
    location.reload();
  }
}
