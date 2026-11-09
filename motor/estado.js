// Estado de la partida: contactos conocidos y flags de la historia.
// Se guarda en el navegador para no perder el progreso si se cierra la pestaña.

const CLAVE = 'juego-gp-partida';

export class Estado {
  constructor() {
    this.contactos = [];
    this.flags = {};
    this.terminado = false;
    this.introVista = false; // la intro sale solo la primera vez (o después de reiniciar)
    this.cargar();
  }

  cargar() {
    try {
      if (new URLSearchParams(location.search).has('reiniciar')) localStorage.removeItem(CLAVE);
      const guardado = JSON.parse(localStorage.getItem(CLAVE));
      if (guardado) Object.assign(this, guardado);
    } catch { /* sin almacenamiento disponible: se juega igual, sin guardar */ }
  }

  guardar() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify({
        contactos: this.contactos, flags: this.flags, terminado: this.terminado, introVista: this.introVista,
      }));
    } catch { /* idem */ }
  }

  reiniciar() {
    this.contactos = [];
    this.flags = {};
    this.terminado = false;
    this.introVista = false;
    this.guardar();
  }

  conoce(id) {
    return this.contactos.includes(id);
  }

  // Devuelve true si el contacto es nuevo.
  agregarContacto(id) {
    if (this.conoce(id)) return false;
    this.contactos.push(id);
    this.guardar();
    return true;
  }

  activarFlag(nombre, valor = true) {
    this.flags[nombre] = valor;
    this.guardar();
  }

  // Condiciones que se usan en los datos ("si": {...}). Todas las que estén deben cumplirse.
  cumple(cond, personajes) {
    if (!cond) return true;
    if (cond.flag && !this.flags[cond.flag]) return false;
    if (cond.sinFlag && this.flags[cond.sinFlag]) return false;
    if (cond.conoce && !this.conoce(cond.conoce)) return false;
    if (cond.noConoce && this.conoce(cond.noConoce)) return false;
    if (cond.contactosMinimos != null && this.cantidadContactos(personajes) < cond.contactosMinimos) return false;
    if (cond.desafiosCompletos && !this.desafiosCompletos()) return false;
    // "azar": probabilidad en % de que se cumpla (se sortea cada vez que se abre el diálogo).
    if (cond.azar != null && Math.random() * 100 >= cond.azar) return false;
    return true;
  }

  // ---------- Objetivo: desafiar al equipo de 3D ----------
  // Los personajes marcados "desafiar" son los que hay que desafiar. Un desafío ganado deja la
  // flag "desafio-<id>-ganado". Hay que asignar this.mundo y this.personajes (lo hace main.js).

  equipo() {
    return (this.personajes || []).filter(p => p.desafiar).map(p => p.id);
  }

  ganoDesafio(id) {
    return !!this.flags[`desafio-${id}-ganado`];
  }

  desafiosGanados() {
    return this.equipo().filter(id => this.ganoDesafio(id));
  }

  // Ganados todos los del equipo que ya tienen un desafío armado (en mundo.desafios).
  // Así, mientras se van agregando desafíos, alcanza con ganar los que existen.
  desafiosCompletos() {
    const disponibles = this.equipo().filter(id => this.mundo?.desafios?.[id]);
    return disponibles.length > 0 && disponibles.every(id => this.ganoDesafio(id));
  }

  // Contactos que cuentan para el objetivo: no cuentan los que se agregan recién al final
  // (el fundador) ni los marcados "noCuenta" (por ejemplo, los animales).
  cantidadContactos(personajes) {
    return this.contactos.filter(id => {
      const p = personajes.find(x => x.id === id);
      return p && !p.agendaAlFinal && !p.noCuenta;
    }).length;
  }
}
