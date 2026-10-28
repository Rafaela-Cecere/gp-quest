// Entrada del jugador.
// PC: flechas o WASD para moverse, click para interactuar.
// Celular: deslizar el dedo para moverse (el joystick aparece fijo donde se apoyó el dedo,
// y en un lugar nuevo cada vez que se vuelve a apoyar), tap para interactuar.

const UMBRAL_DESLIZAR = 14; // px de pantalla: menos que esto es un tap
const RADIO_JOYSTICK = 60;

export class Controles {
  constructor(escena, alTocar) {
    this.alTocar = alTocar;
    this.teclas = escena.input.keyboard.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D');
    this.toque = null;

    this.joyBase = document.createElement('div');
    this.joyBase.className = 'joystick';
    this.joyPalanca = document.createElement('div');
    this.joyPalanca.className = 'joystick-palanca';
    this.joyBase.appendChild(this.joyPalanca);
    document.body.appendChild(this.joyBase);

    const input = escena.input;
    input.on('pointerdown', p => {
      if (this.toque) return; // ignora un segundo dedo
      this.toque = { id: p.id, x0: p.x, y0: p.y, x: p.x, y: p.y, tactil: p.wasTouch, deslizando: false };
    });
    input.on('pointermove', p => {
      const t = this.toque;
      if (!t || t.id !== p.id) return;
      t.x = p.x;
      t.y = p.y;
      const dx = t.x - t.x0, dy = t.y - t.y0;
      const largo = Math.hypot(dx, dy);
      if (!t.deslizando && t.tactil && largo > UMBRAL_DESLIZAR) t.deslizando = true;
      this.dibujarJoystick();
    });
    const soltar = p => {
      const t = this.toque;
      if (!t || t.id !== p.id) return;
      this.toque = null;
      this.dibujarJoystick();
      if (!t.deslizando) this.alTocar(p);
    };
    input.on('pointerup', soltar);
    input.on('pointerupoutside', soltar);
    // Por las dudas: si el navegador corta el toque (sale una notificación, se suelta sobre un
    // botón, etc.), el joystick desaparece igual cuando no queda ningún dedo apoyado.
    // Se espera un instante para no ganarle a Phaser, que usa el mismo "soltar" para detectar el tap.
    const sinDedos = e => {
      if (e.touches?.length) return;
      setTimeout(() => {
        if (!this.toque) return;
        this.toque = null;
        this.dibujarJoystick();
      }, 50);
    };
    addEventListener('touchend', sinDedos);
    addEventListener('touchcancel', sinDedos);
    addEventListener('pointercancel', sinDedos);
  }

  // Dirección de movimiento: vector con largo entre 0 y 1.
  vector() {
    const k = this.teclas;
    let x = 0, y = 0;
    if (k.LEFT.isDown || k.A.isDown) x -= 1;
    if (k.RIGHT.isDown || k.D.isDown) x += 1;
    if (k.UP.isDown || k.W.isDown) y -= 1;
    if (k.DOWN.isDown || k.S.isDown) y += 1;
    if (x || y) {
      const largo = Math.hypot(x, y);
      return { x: x / largo, y: y / largo };
    }

    const t = this.toque;
    if (t && t.deslizando) {
      const dx = t.x - t.x0, dy = t.y - t.y0;
      const largo = Math.hypot(dx, dy);
      if (largo < 4) return { x: 0, y: 0 };
      const fuerza = Math.min(1, largo / (RADIO_JOYSTICK * 0.6));
      return { x: (dx / largo) * fuerza, y: (dy / largo) * fuerza };
    }
    return { x: 0, y: 0 };
  }

  // Corta cualquier movimiento en curso (por ejemplo, al abrir un diálogo).
  cancelar() {
    this.toque = null;
    this.dibujarJoystick();
  }

  dibujarJoystick() {
    const t = this.toque;
    if (!t || !t.deslizando) {
      this.joyBase.style.display = 'none';
      return;
    }
    // El joystick queda fijo donde se apoyó el dedo (hasta soltarlo). La palanca no sale del círculo.
    this.joyBase.style.display = 'block';
    this.joyBase.style.left = `${t.x0}px`;
    this.joyBase.style.top = `${t.y0}px`;
    const dx = t.x - t.x0, dy = t.y - t.y0;
    const escala = Math.min(1, RADIO_JOYSTICK / (Math.hypot(dx, dy) || 1));
    this.joyPalanca.style.transform = `translate(${dx * escala}px, ${dy * escala}px)`;
  }
}
