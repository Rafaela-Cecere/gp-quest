// Autos que pasan por la calle. Cada recorrido va de (x, y) a (x2, y2); cada tanto sale un auto
// con una de sus imágenes elegida al azar. Las imágenes miran hacia abajo (el frente abajo).

import { claveTextura } from './texturas.js';

const DESVANECER = 300; // px al principio y al final del recorrido donde el auto aparece/desaparece

export class Trafico {
  constructor(escena, recorridos) {
    this.escena = escena;
    this.autos = [];
    this.recorridos = recorridos.filter(r => r.imagenes?.length).map(r => ({
      ...r, proximo: Math.random() * 2,
    }));
  }

  update(dt) {
    for (const r of this.recorridos) {
      r.proximo -= dt;
      if (r.proximo <= 0) {
        this.salir(r);
        const min = r.cadaMin ?? 4, max = r.cadaMax ?? 10;
        r.proximo = min + Math.random() * Math.max(0, max - min);
      }
    }
    for (const a of this.autos) {
      a.recorrido += a.velocidad * dt;
      const t = a.recorrido / a.largo;
      const x = a.r.x + (a.r.x2 - a.r.x) * t, y = a.r.y + (a.r.y2 - a.r.y) * t;
      a.sprite.setPosition(x, y).setDepth(y + a.sprite.displayHeight / 2);
      const borde = Math.min(a.recorrido, a.largo - a.recorrido);
      a.sprite.setAlpha(Phaser.Math.Clamp(borde / DESVANECER, 0, 1));
      if (a.recorrido >= a.largo) a.terminado = true;
    }
    for (const a of this.autos.filter(x => x.terminado)) a.sprite.destroy();
    this.autos = this.autos.filter(x => !x.terminado);
  }

  salir(r) {
    const ruta = r.imagenes[Math.floor(Math.random() * r.imagenes.length)];
    const clave = claveTextura(ruta, r.largo);
    if (!this.escena.textures.exists(clave)) return;
    const dx = r.x2 - r.x, dy = r.y2 - r.y;
    const sprite = this.escena.add.image(r.x, r.y, clave).setOrigin(0.5).setAlpha(0);
    sprite.setRotation(Math.atan2(dy, dx) - Math.PI / 2);
    // Misma velocidad para todos los del recorrido: así nunca se chocan entre sí.
    this.autos.push({ r, sprite, recorrido: 0, largo: Math.hypot(dx, dy), velocidad: r.velocidad || 300 });
  }
}
