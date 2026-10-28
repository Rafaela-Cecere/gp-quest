// Cuadro de diálogo con retrato y respuestas de opción múltiple.
// Los diálogos vienen de datos/dialogos.json: cada uno tiene nodos con texto y opciones.

const MS_POR_LETRA = 22;

export class Dialogo {
  constructor(dialogos, personajes, estado, aplicarEfecto) {
    this.dialogos = dialogos;
    this.personajes = personajes;
    this.estado = estado;
    this.aplicarEfecto = aplicarEfecto;
    this.abierto = false;

    this.el = document.createElement('div');
    this.el.className = 'dialogo oculto';
    this.el.innerHTML = `
      <img class="dialogo-retrato" alt="">
      <div class="dialogo-caja">
        <div class="dialogo-nombre"></div>
        <div class="dialogo-texto"></div>
        <div class="dialogo-opciones"></div>
      </div>`;
    document.body.appendChild(this.el);
    this.elRetrato = this.el.querySelector('.dialogo-retrato');
    this.elNombre = this.el.querySelector('.dialogo-nombre');
    this.elTexto = this.el.querySelector('.dialogo-texto');
    this.elOpciones = this.el.querySelector('.dialogo-opciones');

    // Tocar el texto mientras se escribe lo completa de una.
    this.el.querySelector('.dialogo-caja').addEventListener('click', e => {
      if (!e.target.closest('button')) this.completarTexto();
    });
    document.addEventListener('keydown', e => this.alPresionarTecla(e));
  }

  // Abre el primer diálogo del personaje cuya condición se cumpla.
  abrir(personaje, alCerrar) {
    const entrada = (personaje.dialogos || []).find(d => this.estado.cumple(d.si, this.personajes));
    const dialogo = entrada && this.dialogos[entrada.id];
    if (!dialogo) {
      console.warn(`El personaje "${personaje.id}" no tiene un diálogo disponible.`);
      return false;
    }
    this.personaje = personaje;
    this.dialogo = dialogo;
    this.alCerrar = alCerrar;
    this.abierto = true;

    this.el.classList.remove('oculto');
    this.mostrarNodo(dialogo.inicio);
    return true;
  }

  mostrarNodo(id) {
    const nodo = this.dialogo.nodos[id];
    if (!nodo) {
      console.warn(`No existe el nodo "${id}" en el diálogo.`);
      this.cerrar();
      return;
    }
    this.nodo = nodo;
    // Un nodo "narrador" no es el personaje hablando: sin nombre ni retrato.
    const nombre = nodo.narrador ? '' : this.personaje.nombre || '';
    this.elNombre.textContent = nombre;
    this.elNombre.classList.toggle('oculto', !nombre);
    if (nodo.narrador) this.elRetrato.classList.add('oculto');
    else this.mostrarRetrato(nodo.retrato);
    this.elOpciones.innerHTML = '';
    this.escribir(nodo.texto || '', () => this.mostrarOpciones());
  }

  // Un nodo puede cambiar el retrato (por ejemplo, una cara de decepción).
  // Sin retrato se muestra el sprite agrandado (o la imagen, si es un objeto).
  mostrarRetrato(delNodo) {
    const p = this.personaje;
    const retrato = delNodo || p.retrato;
    const imagen = retrato || p.sprite || p.imagen;
    this.elRetrato.classList.toggle('oculto', !imagen);
    if (imagen && this.elRetrato.getAttribute('src') !== imagen) this.elRetrato.src = imagen;
    this.elRetrato.classList.toggle('retrato-sprite', !retrato);
  }

  escribir(texto, alTerminar) {
    clearInterval(this.intervalo);
    this.textoCompleto = texto;
    this.alTerminarTexto = alTerminar;
    let n = 0;
    this.elTexto.textContent = '';
    this.intervalo = setInterval(() => {
      n++;
      this.elTexto.textContent = texto.slice(0, n);
      if (n >= texto.length) this.completarTexto();
    }, MS_POR_LETRA);
  }

  completarTexto() {
    if (!this.alTerminarTexto) return;
    clearInterval(this.intervalo);
    this.elTexto.textContent = this.textoCompleto;
    const fn = this.alTerminarTexto;
    this.alTerminarTexto = null;
    fn();
  }

  opcionesDelNodo() {
    const nodo = this.nodo;
    const opciones = (nodo.opciones || []).filter(o => this.estado.cumple(o.si, this.personajes));
    if (opciones.length) return opciones;
    // Nodo sin opciones: un botón para seguir o para cerrar.
    return nodo.siguiente ? [{ texto: 'Continuar', ir: nodo.siguiente }] : [{ texto: 'Cerrar' }];
  }

  mostrarOpciones() {
    this.opciones = this.opcionesDelNodo();
    this.elOpciones.innerHTML = '';
    this.opciones.forEach((op, i) => {
      const b = document.createElement('button');
      b.className = 'dialogo-opcion';
      b.innerHTML = `<span class="tecla">${i + 1}</span>`;
      b.append(op.texto);
      b.addEventListener('click', () => this.elegir(op));
      this.elOpciones.appendChild(b);
    });
  }

  elegir(op) {
    for (const efecto of op.efectos || []) this.aplicarEfecto(efecto, this.personaje);
    if (!this.abierto) return; // un efecto pudo cerrar el diálogo
    if (op.ir) this.mostrarNodo(op.ir);
    else this.cerrar();
  }

  cerrar() {
    clearInterval(this.intervalo);
    this.alTerminarTexto = null;
    this.abierto = false;
    this.el.classList.add('oculto');
    const fn = this.alCerrar;
    this.alCerrar = null;
    fn?.(this.personaje);
  }

  alPresionarTecla(e) {
    if (!this.abierto) return;
    e.preventDefault(); // evita que Enter/Espacio también "clickeen" el botón con foco
    if (this.alTerminarTexto) {
      if (e.key === 'Enter' || e.key === ' ') this.completarTexto();
      return;
    }
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= this.opciones.length) this.elegir(this.opciones[n - 1]);
    else if ((e.key === 'Enter' || e.key === ' ') && this.opciones.length === 1) this.elegir(this.opciones[0]);
  }
}
