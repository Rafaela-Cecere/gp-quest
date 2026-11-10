// Prepara las imágenes de personajes y objetos al tamaño en que se ven en el juego.
// Los PNG originales son grandes (por ejemplo 400×850): se recortan los bordes transparentes
// y se achican con buena calidad, así en pantalla quedan nítidos y ocupan poca memoria.

import { cargarImagen } from './colision.js?v=20261110015204';

// alto: alto final en píxeles del mundo (0 = tamaño original, sin recortar).
export function claveTextura(ruta, alto) {
  return alto ? `${ruta}#${Math.round(alto)}` : ruta;
}

// Rectángulo con contenido (sin los bordes transparentes).
function recorte(img) {
  const lienzo = document.createElement('canvas');
  lienzo.width = img.width;
  lienzo.height = img.height;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const datos = ctx.getImageData(0, 0, img.width, img.height).data;
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (datos[(y * img.width + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w: img.width, h: img.height };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// Achica en pasos de a la mitad: da un resultado mucho más limpio que hacerlo de una.
function achicar(img, r, ancho, alto) {
  let fuente = img, fx = r.x, fy = r.y, fw = r.w, fh = r.h;
  while (fw / 2 > ancho && fh / 2 > alto) {
    const paso = document.createElement('canvas');
    paso.width = Math.ceil(fw / 2);
    paso.height = Math.ceil(fh / 2);
    const ctx = paso.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fuente, fx, fy, fw, fh, 0, 0, paso.width, paso.height);
    fuente = paso; fx = 0; fy = 0; fw = paso.width; fh = paso.height;
  }
  const final = document.createElement('canvas');
  final.width = ancho;
  final.height = alto;
  const ctx = final.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(fuente, fx, fy, fw, fh, 0, 0, ancho, alto);
  return final;
}

const pendientes = new Map();
const recortes = new Map(); // clave → parte de la imagen original que quedó { x, y, w, h, ancho, alto }

// Qué parte de la imagen original quedó en la textura (para ubicar puntos de la imagen original).
export const recorteDe = clave => recortes.get(clave);

// Devuelve (y recuerda) el lienzo listo para usar como textura.
export function prepararImagen(ruta, alto) {
  const clave = claveTextura(ruta, alto);
  if (!pendientes.has(clave)) {
    pendientes.set(clave, cargarImagen(ruta).then(img => {
      if (!alto) return img;
      const r = recorte(img);
      recortes.set(clave, { ...r, ancho: img.width, alto: img.height });
      const ancho = Math.max(1, Math.round((r.w * alto) / r.h));
      return achicar(img, r, ancho, Math.round(alto));
    }));
  }
  return pendientes.get(clave);
}

// Registra la textura en la escena (si ya está, no hace nada). Devuelve la clave.
export async function asegurarTextura(escena, ruta, alto) {
  const clave = claveTextura(ruta, alto);
  if (escena.textures.exists(clave)) return clave;
  const lienzo = await prepararImagen(ruta, alto);
  if (escena.textures.exists(clave)) return clave;
  if (lienzo instanceof HTMLCanvasElement) escena.textures.addCanvas(clave, lienzo);
  else escena.textures.addImage(clave, lienzo);
  return clave;
}

// Un grupo de imágenes del mismo tamaño (los cuadros de un personaje, dibujados en el mismo lienzo)
// se recorta con un único marco: el que abarca el contenido de todas. Si se recortara cada una por
// su lado, al pasar de un cuadro a otro el personaje cambiaría de tamaño y se correría.
async function prepararGrupo(pedidos) {
  const imagenes = await Promise.all(pedidos.map(p => cargarImagen(p.ruta).catch(e => { console.warn(e.message); return null; })));
  const validas = imagenes.filter(Boolean);
  if (!validas.length) return;
  const mismoTamano = validas.every(img => img.width === validas[0].width && img.height === validas[0].height);
  let marco = null;
  if (mismoTamano) {
    for (const img of validas) {
      const r = recorte(img);
      marco = marco
        ? (({ x0, y0, x1, y1 }) => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }))({
          x0: Math.min(marco.x, r.x), y0: Math.min(marco.y, r.y),
          x1: Math.max(marco.x + marco.w, r.x + r.w), y1: Math.max(marco.y + marco.h, r.y + r.h),
        })
        : r;
    }
  }
  pedidos.forEach((p, i) => {
    const img = imagenes[i];
    const clave = claveTextura(p.ruta, p.alto);
    if (!img || !p.alto || pendientes.has(clave)) return;
    const r = marco || recorte(img);
    recortes.set(clave, { ...r, ancho: img.width, alto: img.height });
    const ancho = Math.max(1, Math.round((r.w * p.alto) / r.h));
    pendientes.set(clave, Promise.resolve(achicar(img, r, ancho, Math.round(p.alto))));
  });
}

// Prepara muchas de una, de a algunas por vez para no saturar la memoria.
// Devuelve un Map clave → lienzo, para registrarlas después en la escena.
export async function prepararLienzos(pedidos, deAPedazos = 6) {
  const grupos = new Map();
  for (const p of pedidos) if (p.grupo && p.ruta) (grupos.get(p.grupo) ?? grupos.set(p.grupo, []).get(p.grupo)).push(p);
  for (const lista of grupos.values()) {
    const unicosGrupo = [...new Map(lista.map(p => [claveTextura(p.ruta, p.alto), p])).values()];
    await prepararGrupo(unicosGrupo);
  }
  const unicos = [...new Map(pedidos.filter(p => p.ruta).map(p => [claveTextura(p.ruta, p.alto), p])).values()];
  const lienzos = new Map();
  for (let i = 0; i < unicos.length; i += deAPedazos) {
    await Promise.all(unicos.slice(i, i + deAPedazos).map(p => prepararImagen(p.ruta, p.alto)
      .then(l => lienzos.set(claveTextura(p.ruta, p.alto), l))
      .catch(e => console.warn(e.message))));
  }
  return lienzos;
}

export function registrarLienzos(escena, lienzos) {
  for (const [clave, lienzo] of lienzos) {
    if (escena.textures.exists(clave)) continue;
    if (lienzo instanceof HTMLCanvasElement) escena.textures.addCanvas(clave, lienzo);
    else escena.textures.addImage(clave, lienzo);
  }
}
