// Carga de los datos del juego (los mismos que edita el editor visual).

export const ARCHIVOS = {
  mundo: 'datos/mundo.json',
  personajes: 'datos/personajes.json',
  dialogos: 'datos/dialogos.json',
};

async function cargarJSON(ruta) {
  const respuesta = await fetch(ruta, { cache: 'no-store' });
  if (!respuesta.ok) throw new Error(`No se pudo cargar ${ruta}`);
  try {
    return await respuesta.json();
  } catch (e) {
    throw new Error(`Hay un error de formato en ${ruta}: ${e.message}`);
  }
}

export async function cargarDatos() {
  const [mundo, personajes, dialogos] = await Promise.all([
    cargarJSON(ARCHIVOS.mundo),
    cargarJSON(ARCHIVOS.personajes),
    cargarJSON(ARCHIVOS.dialogos),
  ]);
  return { mundo: normalizarMundo(mundo), personajes, dialogos };
}

// Completa las listas que pueden faltar en archivos viejos.
export function normalizarMundo(mundo) {
  for (const lista of ['objetos', 'sonidos', 'particulas', 'eventos', 'trafico']) mundo[lista] ??= [];
  mundo.musica ??= { archivo: '', volumen: 0.5 };
  mundo.altoPersonaje ??= 192;
  mundo.intro ??= {};
  return mundo;
}

// Alto en pantalla de un personaje (los animales u otros pueden tener su propio alto).
export const altoDe = (p, mundo) => p.alto || mundo.altoPersonaje;

// Todas las imágenes de un personaje, según hacia dónde mira.
export function spritesDe(p) {
  return {
    frente: p.sprite,
    espalda: p.spriteEspalda || p.sprite,
    lado: p.spriteLado || p.sprite,
    // Caminando de costado: cuadros que se intercalan con el sprite de costado.
    caminando: p.caminando?.length ? p.caminando : null,
    // Caminando de frente y de espalda: el ciclo completo de cuadros, en orden.
    caminandoFrente: p.caminandoFrente?.length ? p.caminandoFrente : null,
    caminandoEspalda: p.caminandoEspalda?.length ? p.caminandoEspalda : null,
  };
}

// Qué imágenes hay que preparar y a qué tamaño: [{ ruta, alto }].
export function texturasUsadas({ mundo, personajes }) {
  const pedidos = [];
  const agregarPersonaje = p => {
    const alto = altoDe(p, mundo);
    const todas = [p.sprite, p.spriteEspalda, p.spriteLado,
      ...(p.caminando || []), ...(p.caminandoFrente || []), ...(p.caminandoEspalda || [])];
    for (const ruta of todas) {
      if (ruta) pedidos.push({ ruta, alto });
    }
  };
  agregarPersonaje(mundo.jugador);
  personajes.forEach(agregarPersonaje);
  for (const o of mundo.objetos) {
    pedidos.push({ ruta: o.imagen, alto: o.alto || 0 });
    if (o.copa) pedidos.push({ ruta: o.copa, alto: o.alto || 0 });
  }
  for (const t of mundo.trafico) for (const ruta of t.imagenes || []) pedidos.push({ ruta, alto: t.largo || 0 });
  if (mundo.arboles?.premio) pedidos.push({ ruta: mundo.arboles.premio, alto: mundo.arboles.altoPremio || 110 });
  return pedidos;
}

const EXT_IMAGEN = /\.(png|jpe?g|gif|webp)$/i;
const EXT_AUDIO = /\.(mp3|ogg|wav)$/i;
const EXT_VIDEO = /\.(webm|mp4)$/i;
export const esImagen = ruta => EXT_IMAGEN.test(ruta);
export const esAudio = ruta => EXT_AUDIO.test(ruta);
export const esVideo = ruta => EXT_VIDEO.test(ruta);

// Recorre todos los efectos (diálogos y eventos) para saber qué sonidos hay que precargar.
function* todosLosEfectos({ mundo, dialogos }) {
  for (const d of Object.values(dialogos)) {
    for (const nodo of Object.values(d.nodos || {})) {
      for (const op of nodo.opciones || []) yield* op.efectos || [];
    }
  }
  for (const ev of mundo.eventos) yield* ev.efectos || [];
}

// Todos los audios que usa el juego, para precargarlos. La música no: se baja por detrás (escena-mundo.js).
export function audiosUsados(datos) {
  const { mundo } = datos;
  const audios = new Set();
  for (const s of mundo.sonidos) audios.add(s.archivo);
  if (mundo.jugador.sonidoPasos) audios.add(mundo.jugador.sonidoPasos);
  if (mundo.arboles?.sonidoPremio) audios.add(mundo.arboles.sonidoPremio);
  for (const ef of todosLosEfectos(datos)) if (ef.tipo === 'sonido' && ef.archivo) audios.add(ef.archivo);
  audios.delete(undefined);
  audios.delete('');
  return audios;
}
