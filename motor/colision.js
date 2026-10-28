// Colisión del mundo: una grilla de celdas chicas (8 px) que dice dónde no se puede caminar.
// Se arma leyendo las imágenes de colisión de cada pieza del mapa: lo rojo bloquea.

import { medidasMapa, piezasConPosicion } from './mapa.js';

export const CELDA = 8;

export function cargarImagen(ruta) {
  return new Promise((resolver, rechazar) => {
    const img = new Image();
    img.onload = () => resolver(img);
    img.onerror = () => rechazar(new Error(`No se pudo cargar ${ruta}`));
    img.src = ruta;
  });
}

// Arma la colisión de todo el mapa leyendo la imagen de colisión de cada pieza, de a una
// (sin pasar por la placa de video, para no gastar memoria).
export async function cargarColision(mapa) {
  const { ancho, alto } = medidasMapa(mapa);
  const colision = new MapaColision(ancho, alto);
  for (const p of piezasConPosicion(mapa)) {
    if (!p.colision) continue;
    try {
      colision.pegar(muestrear(await cargarImagen(p.colision)), p.x, p.y);
    } catch (e) {
      console.warn(e.message);
    }
  }
  return colision;
}

let lienzo = null;

export const esRojo = (r, g, b) => r > 150 && g < 100 && b < 100;

// Lee una imagen de colisión y devuelve sus celdas (1 = bloqueado), muestreando el centro de cada una.
export function muestrear(imagen) {
  const w = imagen.width, h = imagen.height;
  lienzo ??= document.createElement('canvas');
  lienzo.width = w;
  lienzo.height = h;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(imagen, 0, 0);
  const px = ctx.getImageData(0, 0, w, h).data;
  const columnas = Math.ceil(w / CELDA), filas = Math.ceil(h / CELDA);
  const celdas = new Uint8Array(columnas * filas);
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < columnas; c++) {
      const x = Math.min(c * CELDA + CELDA / 2, w - 1);
      const y = Math.min(f * CELDA + CELDA / 2, h - 1);
      const i = (y * w + x) * 4;
      if (esRojo(px[i], px[i + 1], px[i + 2])) celdas[f * columnas + c] = 1;
    }
  }
  lienzo.width = lienzo.height = 1; // libera la memoria del lienzo grande
  return { columnas, filas, celdas };
}

export class MapaColision {
  constructor(ancho, alto) {
    this.ancho = ancho;
    this.alto = alto;
    this.columnas = Math.ceil(ancho / CELDA);
    this.filas = Math.ceil(alto / CELDA);
    this.bloqueado = new Uint8Array(this.columnas * this.filas);
  }

  // Copia las celdas de una pieza en su lugar del mundo.
  pegar(muestra, x0, y0) {
    const c0 = Math.round(x0 / CELDA), f0 = Math.round(y0 / CELDA);
    for (let f = 0; f < muestra.filas; f++) {
      const fila = f0 + f;
      if (fila < 0 || fila >= this.filas) continue;
      for (let c = 0; c < muestra.columnas; c++) {
        const col = c0 + c;
        if (col < 0 || col >= this.columnas) continue;
        this.bloqueado[fila * this.columnas + col] = muestra.celdas[f * muestra.columnas + c];
      }
    }
  }

  // ¿El rectángulo (en píxeles del mapa) toca alguna zona bloqueada o sale del mapa?
  chocaRect(x, y, w, h) {
    if (x < 0 || y < 0 || x + w > this.ancho || y + h > this.alto) return true;
    const c0 = Math.floor(x / CELDA), c1 = Math.floor((x + w - 1) / CELDA);
    const f0 = Math.floor(y / CELDA), f1 = Math.floor((y + h - 1) / CELDA);
    for (let f = f0; f <= f1; f++) {
      for (let c = c0; c <= c1; c++) {
        if (this.bloqueado[f * this.columnas + c]) return true;
      }
    }
    return false;
  }

  // Lienzo de una celda por píxel: rojo donde está bloqueado (para mostrarlo agrandado x8).
  crearLienzo() {
    const canvas = document.createElement('canvas');
    canvas.width = this.columnas;
    canvas.height = this.filas;
    const ctx = canvas.getContext('2d');
    const imagen = ctx.createImageData(this.columnas, this.filas);
    for (let i = 0; i < this.bloqueado.length; i++) {
      if (!this.bloqueado[i]) continue;
      imagen.data[i * 4] = 255;
      imagen.data[i * 4 + 1] = 40;
      imagen.data[i * 4 + 2] = 40;
      imagen.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(imagen, 0, 0);
    return canvas;
  }
}
