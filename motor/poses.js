// Poses de los personajes del mapa. De vez en cuando cambian solos de pose (de frente, de costado
// hacia un lado o el otro, de espaldas) y solo miran al personaje principal mientras hablan con él.
//
// Extras opcionales de cada personaje (datos/personajes.json):
//   "quieto": { "frente", "espalda", "lado" }  imágenes para cuando está solo, sin hablar
//       (Gustavo fumando). Mientras habla usa las normales, según hacia dónde mira.
//   "humo": { "frente": [x, y], "espalda": [x, y], "lado": [x, y] }  humito que sale de ese punto
//       de las imágenes "quieto", en píxeles de la imagen original (la punta del cigarro).
//   "animacion": { "cuadros": [...], "cada": [10, 20], "duracion": 4, "msPorCuadro": 170 }
//       de vez en cuando (cada 10 a 20 segundos) repite esos cuadros un rato (Leonardo y la sopladora).

import { recorteDe } from './texturas.js?v=20261109175224';

const azar = (a, b) => a + Math.random() * (b - a);
// Poses que eligen solos [pose, espejado, peso]: casi siempre de frente, a veces de costado, poco de espaldas.
const POSES = [['frente', false, 5], ['lado', false, 2], ['lado', true, 2], ['espalda', false, 1]];
const CADA_CUANTO = [4, 10]; // segundos entre cambios de pose

export class Poses {
  constructor(escena, entidades) {
    this.escena = escena;
    this.npcs = entidades.filter(e => e.tipo === 'personaje' && e.texturas);
    for (const e of this.npcs) {
      e.pose = { nombre: 'frente', espejo: false };
      e.proximaPose = azar(1, CADA_CUANTO[1]);
      // Los que tienen imágenes extra se anclan al centro de su imagen original: como cada dibujo
      // se recorta distinto (la sopladora sobresale), si no saltarían de costado al cambiar.
      e.anclar = !!(e.texturas.quieto || e.texturas.animacion);
      if (e.texturas.animacion) e.proximaAnimacion = azar(...(e.datos.animacion.cada || [10, 20]));
      if (e.datos.humo) e.humo = this.crearHumo();
      this.mostrar(e);
    }
  }

  // Imagen de una pose: la de "quieto" si está solo y la tiene; si no, la normal.
  claveDe(e, pose) {
    return (!e.hablando && e.texturas.quieto?.[pose]) || e.texturas[pose];
  }

  poner(e, clave, espejo) {
    const s = e.sprite;
    if (s.texture.key !== clave) s.setTexture(clave);
    s.setFlipX(espejo);
    if (e.anclar) {
      // Phaser espeja dentro del mismo rectángulo, así que el ancla espejada queda del otro lado.
      const r = recorteDe(clave);
      const a = r ? (r.ancho / 2 - r.x) / r.w : 0.5;
      s.setOrigin(espejo ? 1 - a : a, 1);
    }
  }

  mostrar(e) {
    this.poner(e, this.claveDe(e, e.pose.nombre), e.pose.espejo);
  }

  // Mira hacia un punto (el personaje principal, al hablar). El dibujo de costado mira a la derecha,
  // salvo que el personaje tenga "ladoMiraIzquierda" (como los animales). Queda así hasta soltar().
  mirarHacia(e, x, y) {
    if (!e.texturas) return;
    e.hablando = true;
    e.animando = null;
    const dx = x - e.datos.x, dy = y - e.datos.y;
    e.pose = Math.abs(dx) > Math.abs(dy)
      ? { nombre: 'lado', espejo: (dx < 0) !== !!e.datos.ladoMiraIzquierda }
      : { nombre: dy < 0 ? 'espalda' : 'frente', espejo: false };
    this.mostrar(e);
  }

  // Termina la charla: vuelve de frente y a cambiar de pose solo.
  soltar(e) {
    if (!e.texturas) return;
    e.hablando = false;
    e.pose = { nombre: 'frente', espejo: false };
    e.proximaPose = azar(...CADA_CUANTO);
    this.mostrar(e);
  }

  cambiarPose(e) {
    // Solo las poses que tienen un dibujo distinto (los animales tienen uno o dos).
    const posibles = POSES.filter(([p, espejo]) =>
      (p === 'frente' || e.texturas[p] !== e.texturas.frente) &&
      !(p === e.pose.nombre && espejo === e.pose.espejo));
    if (!posibles.length) return;
    let n = Math.random() * posibles.reduce((t, p) => t + p[2], 0);
    const [nombre, espejo] = posibles.find(p => (n -= p[2]) < 0) ?? posibles[0];
    e.pose = { nombre, espejo: nombre === 'lado' && espejo };
    this.mostrar(e);
  }

  actualizar(dt) {
    for (const e of this.npcs) {
      if (e.humo) this.moverHumo(e);
      if (e.hablando || e.visible === false) continue;
      const anim = e.datos.animacion;
      if (e.animando) {
        // Repite los cuadros; al terminar vuelve a la pose que tenía.
        e.animando.t += dt;
        if (e.animando.t >= (anim.duracion ?? 4)) {
          e.animando = null;
          e.proximaAnimacion = azar(...(anim.cada || [10, 20]));
          this.mostrar(e);
        } else {
          const cuadros = e.texturas.animacion;
          this.poner(e, cuadros[Math.floor(e.animando.t * 1000 / (anim.msPorCuadro ?? 170)) % cuadros.length], false);
        }
        continue;
      }
      if (e.texturas.animacion && (e.proximaAnimacion -= dt) <= 0) {
        e.animando = { t: 0 };
        continue;
      }
      if ((e.proximaPose -= dt) <= 0) {
        e.proximaPose = azar(...CADA_CUANTO);
        this.cambiarPose(e);
      }
    }
  }

  crearHumo() {
    return this.escena.add.particles(0, 0, 'punto', {
      lifespan: { min: 1500, max: 2300 }, frequency: 220,
      speedY: { min: -34, max: -20 }, speedX: { min: -7, max: 7 }, accelerationX: { min: -6, max: 6 },
      scale: { start: 0.3, end: 1.1 }, alpha: { start: 0.75, end: 0 }, tint: 0xf4f2ee,
      emitting: false,
    });
  }

  // El humito sale de la punta del cigarro, solo mientras fuma (sin hablar).
  moverHumo(e) {
    const punto = !e.hablando && !e.animando && e.visible !== false && e.datos.humo[e.pose.nombre];
    const clave = e.sprite.texture.key;
    const r = punto && recorteDe(clave);
    if (!r || clave !== e.texturas.quieto?.[e.pose.nombre]) {
      if (e.humo.emitting) e.humo.stop();
      return;
    }
    const s = e.sprite;
    let u = (punto[0] - r.x) / r.w;
    const v = (punto[1] - r.y) / r.h;
    if (s.flipX) u = 1 - u;
    e.humo.setPosition(s.x + (u - s.originX) * s.displayWidth, s.y + (v - s.originY) * s.displayHeight);
    e.humo.setDepth(s.depth + 1);
    if (!e.humo.emitting) e.humo.start();
  }
}
