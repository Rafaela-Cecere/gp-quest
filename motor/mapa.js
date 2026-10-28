// El mapa está dividido en piezas (una grilla de imágenes del mismo tamaño).
// Solo se cargan las piezas cercanas a lo que muestra la cámara; las lejanas se descartan
// para no llenar la memoria (sobre todo en celulares).

export function medidasMapa(mapa) {
  const filas = Math.ceil(mapa.piezas.length / mapa.columnas);
  return { filas, ancho: mapa.columnas * mapa.anchoPieza, alto: filas * mapa.altoPieza };
}

// Posición de cada pieza en el mundo.
export function piezasConPosicion(mapa) {
  return mapa.piezas.map((p, i) => ({
    ...p, i,
    x: (i % mapa.columnas) * mapa.anchoPieza,
    y: Math.floor(i / mapa.columnas) * mapa.altoPieza,
    ancho: mapa.anchoPieza,
    alto: mapa.altoPieza,
  }));
}

const intersecta = (p, r) => p.x < r.right && p.x + p.ancho > r.x && p.y < r.bottom && p.y + p.alto > r.y;

export class MapaEnPiezas {
  // margen: cuánto más allá de la cámara se cargan piezas (en fracción de pieza).
  constructor(escena, mapa, { margen = 0.5, profundidad = -1 } = {}) {
    this.escena = escena;
    this.mapa = mapa;
    this.margen = margen;
    this.profundidad = profundidad;
    this.piezas = piezasConPosicion(mapa).map(p => ({ ...p, estado: 'libre', img: null }));
    escena.load.on('loaderror', archivo => {
      const p = this.piezas.find(x => this.clave(x) === archivo.key);
      if (p) p.estado = 'error';
    });
  }

  clave(p) {
    return `pieza-${p.i}`;
  }

  // Durante preload(): carga las piezas que tocan el rectángulo (por ejemplo, alrededor del inicio).
  precargar(rect) {
    for (const p of this.piezas) {
      if (p.imagen && intersecta(p, rect)) {
        this.escena.load.image(this.clave(p), p.imagen);
        p.estado = 'precargada';
      }
    }
  }

  // Durante create(): dibuja las que ya se precargaron.
  mostrarPrecargadas() {
    for (const p of this.piezas) {
      if (p.estado === 'precargada' && this.escena.textures.exists(this.clave(p))) this.mostrar(p);
      else if (p.estado === 'precargada') p.estado = 'libre';
    }
  }

  mostrar(p) {
    p.img = this.escena.add.image(p.x, p.y, this.clave(p)).setOrigin(0).setDepth(this.profundidad);
    p.estado = 'lista';
  }

  // Llamar seguido (por ejemplo en update) con la vista de la cámara.
  actualizar(vista, activo = true) {
    const mx = this.mapa.anchoPieza * this.margen, my = this.mapa.altoPieza * this.margen;
    const cargar = new Phaser.Geom.Rectangle(vista.x - mx, vista.y - my, vista.width + 2 * mx, vista.height + 2 * my);
    const mantener = new Phaser.Geom.Rectangle(cargar.x - mx, cargar.y - my, cargar.width + 2 * mx, cargar.height + 2 * my);
    for (const p of this.piezas) {
      if (!p.imagen) continue;
      if (activo && p.estado === 'libre' && intersecta(p, cargar)) this.cargar(p);
      else if ((!activo || !intersecta(p, mantener)) && (p.estado === 'lista' || p.estado === 'cargando')) this.liberar(p);
    }
  }

  cargar(p) {
    const escena = this.escena, clave = this.clave(p);
    p.estado = 'cargando';
    escena.load.image(clave, p.imagen);
    escena.load.once(`filecomplete-image-${clave}`, () => {
      if (p.estado === 'cancelada') {
        escena.textures.remove(clave);
        p.estado = 'libre';
      } else {
        this.mostrar(p);
      }
    });
    escena.load.start();
  }

  liberar(p) {
    if (p.estado === 'cargando') {
      p.estado = 'cancelada';
      return;
    }
    p.img?.destroy();
    p.img = null;
    this.escena.textures.remove(this.clave(p));
    p.estado = 'libre';
  }

  // Para reemplazar las imágenes de una pieza (por ejemplo, si se cambió el archivo).
  liberarTodas() {
    for (const p of this.piezas) if (p.estado === 'lista' || p.estado === 'cargando') this.liberar(p);
  }
}
