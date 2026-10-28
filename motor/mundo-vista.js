// Cómo se dibujan las cosas del mundo. Lo usan el juego y el editor, así se ven igual en los dos.

import { claveTextura } from './texturas.js';

export const CAPAS = {
  suelo: 'Suelo (debajo de los personajes)',
  normal: 'Normal (se ordena con los personajes)',
  arriba: 'Arriba (por encima de todo)',
};

// Profundidad de dibujo: en la capa normal, lo que está más abajo en la pantalla tapa a lo de arriba.
export function profundidad(capa, yBase) {
  if (capa === 'suelo') return -0.5 + yBase / 1e7;
  if (capa === 'arriba') return 1e5 + yBase;
  return yBase;
}

export function color(hex) {
  return parseInt(String(hex).replace('#', ''), 16);
}

export function crearTexturasBase(escena) {
  const g = escena.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x000000, 0.28).fillEllipse(36, 12, 72, 24);
  g.generateTexture('sombra', 72, 24);
  g.clear();
  // Globito de diálogo con tres puntos.
  g.fillStyle(0x000000, 1).fillRoundedRect(0, 0, 52, 38, 12).fillTriangle(18, 36, 34, 36, 26, 48);
  g.fillStyle(0xffffff, 1).fillRoundedRect(3, 3, 46, 32, 10).fillTriangle(21, 34, 31, 34, 26, 43);
  g.fillStyle(0x1b1b2f, 1).fillRect(12, 16, 6, 6).fillRect(23, 16, 6, 6).fillRect(34, 16, 6, 6);
  g.generateTexture('burbuja', 52, 48);
  g.clear();
  g.fillStyle(0xffffff, 1).fillRect(0, 0, 6, 10);
  g.generateTexture('chispa', 6, 10);
  g.clear();
  // Hojita (clara con borde oscuro; se tiñe de verdes al usarla, así se ve sobre la copa).
  g.fillStyle(0x333333, 1).fillEllipse(11, 7, 22, 14);
  g.fillStyle(0xffffff, 1).fillEllipse(11, 7, 17, 9);
  g.fillStyle(0xbbbbbb, 1).fillRect(4, 6, 14, 2);
  g.generateTexture('hoja', 22, 14);
  g.destroy();

  // Punto de luz suave para partículas.
  const lienzo = escena.textures.createCanvas('punto', 32, 32);
  const ctx = lienzo.getContext();
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  lienzo.refresh();
}

// clave: la textura a usar (por defecto, la imagen preparada al alto del objeto).
// Con "alto" la imagen ya viene al tamaño final; sin "alto" se usa el tamaño original × escala.
export function crearObjeto(escena, o, clave = claveTextura(o.imagen, o.alto)) {
  const img = escena.add.image(o.x, o.y, clave).setOrigin(0.5, 1);
  img.setScale(o.alto ? 1 : o.escala || 1).setFlipX(!!o.espejo);
  img.setDepth(profundidad(o.capa, o.y));
  return img;
}

// Parte del objeto que va por encima de todo (por ejemplo, la copa de un árbol cuyo tronco
// queda debajo del personaje). Misma posición y tamaño que la imagen principal.
export function crearCopa(escena, o) {
  if (!o.copa) return null;
  return crearObjeto(escena, { ...o, imagen: o.copa, capa: 'arriba' });
}

export function crearSpritePersonaje(escena, p, clave) {
  const sprite = escena.add.image(p.x, p.y, clave).setOrigin(0.5, 1).setDepth(p.y);
  if (p.tinte) sprite.setTint(color(p.tinte));
  return sprite;
}

// Aparece y desaparece suavemente a lo largo de la vida de la partícula.
const desvanecer = max => ({ onUpdate: (particula, clave, t) => Math.sin(t * Math.PI) * max });

export const PRESETS_PARTICULAS = {
  luciernagas: {
    nombre: 'Luciérnagas', textura: 'punto',
    config: () => ({
      lifespan: { min: 2500, max: 5000 }, speed: { min: 5, max: 25 },
      scale: { min: 0.25, max: 0.45 }, alpha: desvanecer(1), tint: 0xd9ff7a, blendMode: 'ADD',
    }),
  },
  brillos: {
    nombre: 'Brillos', textura: 'punto',
    config: () => ({
      lifespan: { min: 600, max: 1200 }, speed: 0,
      scale: { onUpdate: (p, k, t) => Math.sin(t * Math.PI) * 0.4 }, tint: 0xffffff, blendMode: 'ADD',
    }),
  },
  burbujas: {
    nombre: 'Burbujas', textura: 'punto',
    config: () => ({
      lifespan: { min: 2000, max: 3500 }, speedY: { min: -45, max: -15 }, speedX: { min: -5, max: 5 },
      scale: { min: 0.15, max: 0.35 }, alpha: desvanecer(0.7), tint: 0xbfe9ff,
    }),
  },
  humo: {
    nombre: 'Humo', textura: 'punto',
    config: () => ({
      lifespan: 3000, speedY: { min: -40, max: -20 }, speedX: { min: -10, max: 10 },
      scale: { start: 0.5, end: 2 }, alpha: { start: 0.35, end: 0 }, tint: 0x999999,
    }),
  },
  chispas: {
    nombre: 'Chispas', textura: 'punto',
    config: () => ({
      lifespan: { min: 600, max: 1200 }, speedY: { min: -90, max: -40 }, speedX: { min: -15, max: 15 },
      scale: { start: 0.3, end: 0 }, tint: 0xffa040, blendMode: 'ADD',
    }),
  },
  hojas: {
    nombre: 'Hojas', textura: 'chispa',
    config: () => ({
      lifespan: { min: 4000, max: 6000 }, speedX: { min: -30, max: 30 }, speedY: { min: 10, max: 30 },
      gravityY: 20, rotate: { min: 0, max: 360 }, scale: { min: 0.6, max: 1 },
      alpha: desvanecer(1), tint: [0x6fae3a, 0x8cc84b, 0x4e8a2a],
    }),
  },
  confeti: {
    nombre: 'Confeti', textura: 'chispa',
    config: () => ({
      lifespan: { min: 3000, max: 5000 }, speedX: { min: -40, max: 40 }, speedY: { min: 20, max: 80 },
      gravityY: 60, rotate: { min: 0, max: 360 }, alpha: desvanecer(1),
      tint: [0xff5a5a, 0xffd34d, 0x5ad1ff, 0x7dff8a, 0xff8ae2],
    }),
  },
};

// p: { preset, x, y, ancho, alto, cantidad (por segundo), color, capa }
export function crearParticulas(escena, p) {
  const preset = PRESETS_PARTICULAS[p.preset] || PRESETS_PARTICULAS.luciernagas;
  const config = preset.config();
  if (p.color) config.tint = color(p.color);
  config.frequency = 1000 / Math.max(0.2, p.cantidad || 5);
  config.emitZone = { type: 'random', source: new Phaser.Geom.Rectangle(0, 0, p.ancho, p.alto) };
  const emisor = escena.add.particles(p.x, p.y, preset.textura, config);
  emisor.setDepth(profundidad(p.capa || 'arriba', p.y + p.alto));
  emisor.fastForward?.(3000); // que arranque ya lleno, no vacío
  return emisor;
}
