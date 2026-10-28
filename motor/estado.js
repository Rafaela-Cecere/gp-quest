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
    if (cond.contactosMinimos != null && this.cantidadContactos(personajes) < cond.contactosMinimos) return false;
    return true;
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
