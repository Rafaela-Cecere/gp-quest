// Escena principal: el mapa de la oficina, el jugador, los personajes y los objetos.
// Todas las posiciones están en píxeles de la imagen del mapa (assets exportados a escala x2).
// La posición de personajes y objetos es la de su base (los pies).

import { CELDA } from './colision.js';
import { MapaEnPiezas, medidasMapa } from './mapa.js';
import { Controles } from './controles.js';
import { Dialogo } from './dialogo.js';
import { Interfaz } from './interfaz.js';
import { Estado } from './estado.js';
import { audiosUsados, altoDe, spritesDe } from './datos.js';
import { crearTexturasBase, crearObjeto, crearCopa, crearSpritePersonaje, crearParticulas, profundidad } from './mundo-vista.js';
import { claveTextura, registrarLienzos } from './texturas.js';
import { Trafico } from './trafico.js';
import { Desafio, precargarDesafio } from './desafio.js';

const PIES = { ancho: 56, alto: 24 }; // caja de colisión en los pies de cada personaje
const ALTO_BASE_SOLIDA = 40;          // alto de la parte que choca en los objetos sólidos
const TILES_VISIBLES = { corto: 8, largo: 13 }; // tiles que entran como mínimo en cada lado de la pantalla
const ESPERA_TRAS_DIALOGO = 300;      // ms, evita reabrir el diálogo con la misma tecla que lo cerró

export class EscenaMundo extends Phaser.Scene {
  constructor() {
    super('mundo');
  }

  init(datos) {
    this.datos = datos;
    this.mundo = datos.mundo;
    this.personajes = datos.personajes;
    this.dialogos = datos.dialogos;
  }

  preload() {
    this.load.on('loaderror', archivo => console.error(`No se pudo cargar: ${archivo.src}`));

    const j = this.mundo.jugador;
    const desde = new URLSearchParams(location.search).get('desde')?.split(',').map(Number);
    this.inicio = desde?.length === 2 ? { x: desde[0], y: desde[1] } : { x: j.inicio.x, y: j.inicio.y };

    // Mapa en piezas: se precargan las que rodean al inicio; el resto se carga al caminar.
    this.mapa = new MapaEnPiezas(this, this.mundo.mapa);
    const { anchoPieza, altoPieza } = this.mundo.mapa;
    this.mapa.precargar(new Phaser.Geom.Rectangle(
      this.inicio.x - anchoPieza, this.inicio.y - altoPieza, anchoPieza * 2, altoPieza * 2));

    // Cada audio usa su ruta como nombre. Las imágenes de personajes y objetos ya vienen
    // preparadas a su tamaño (ver main.js y texturas.js).
    for (const ruta of audiosUsados(this.datos)) this.load.audio(ruta, ruta);
  }

  create() {
    this.estado = this.datos.estado ?? new Estado();
    crearTexturasBase(this);
    registrarLienzos(this, this.datos.lienzos);

    const medidas = medidasMapa(this.mundo.mapa);
    this.anchoMapa = medidas.ancho;
    this.altoMapa = medidas.alto;
    this.mapa.mostrarPrecargadas();
    this.colision = this.datos.colision; // se arma antes de arrancar (ver main.js)

    // Personajes y objetos. Los que tienen diálogos se pueden "hablar".
    this.entidades = [
      ...this.personajes.map(p => this.crearNpc(p)),
      ...this.mundo.objetos.map(o => ({ tipo: 'objeto', datos: o, sprite: crearObjeto(this, o), copa: crearCopa(this, o) })),
    ];
    this.interactuables = this.entidades.filter(e => e.datos.dialogos?.length);
    // Objetos con efectos "al tocar" (como el tacho): también se activan de cerca, como al hablar.
    this.tocables = this.entidades.filter(e => e.tipo === 'objeto' && e.datos.alTocar?.length && !e.datos.dialogos?.length);
    for (const e of this.interactuables) e.sprite.setInteractive({ useHandCursor: true });
    for (const p of this.mundo.particulas) crearParticulas(this, p);
    this.trafico = new Trafico(this, this.mundo.trafico);

    const j = this.mundo.jugador;
    const params = new URLSearchParams(location.search);
    this.pos = { ...this.inicio };
    this.texturasJugador = this.texturasDe(j);
    this.jugadorSombra = this.add.image(0, 0, 'sombra');
    // Hacia dónde mira al empezar: "frente", "espalda", "izquierda" o "derecha".
    this.direccion = j.mirandoAlInicio || 'frente';
    const inicial = { izquierda: 'lado', derecha: 'lado' }[this.direccion] || this.direccion;
    this.jugador = this.add.image(0, 0, this.texturasJugador[inicial]).setOrigin(0.5, 1)
      .setFlipX(this.direccion === 'izquierda');
    this.paso = 0;
    this.actualizarVisibilidad();
    if (this.choca(this.pos.x, this.pos.y)) console.warn('El jugador empieza dentro de una zona bloqueada.');
    this.ubicarJugador();

    // Indicador sobre lo que se puede hablar.
    this.etiqueta = this.add.text(0, 0, '', {
      fontFamily: '"Pixelify Sans", monospace', fontSize: '24px', color: '#ffffff',
      backgroundColor: '#1b1b2fdd', padding: { x: 10, y: 4 },
    }).setOrigin(0.5, 1).setDepth(2e5).setVisible(false);
    this.burbuja = this.add.image(0, 0, 'burbuja').setOrigin(0.5, 1).setDepth(2e5).setVisible(false);

    const cam = this.cameras.main;
    cam.setBackgroundColor('#2f4a22'); // mientras carga una pieza se ve "pasto" en vez de negro
    cam.setBounds(0, 0, this.anchoMapa, this.altoMapa);
    cam.startFollow(this.jugador, true, 0.12, 0.12);
    this.ajustarZoom();
    this.scale.on('resize', () => this.ajustarZoom());

    this.interfaz = new Interfaz(this.mundo, this.personajes, this.estado);
    this.dialogo = new Dialogo(this.dialogos, this.personajes, this.estado, (e, p) => this.aplicarEfecto(e, p));
    this.controles = new Controles(this, p => this.alTocar(p));
    this.ultimoCierre = 0;
    this.dentroDeEvento = new Set();
    this.iniciarSonidos();

    this.input.keyboard.on('keydown', e => {
      if ([' ', 'Enter', 'e', 'E'].includes(e.key) && this.puedeInteractuar() && this.cercano) {
        this.interactuar(this.cercano);
      }
      if (e.key === 'c' || e.key === 'C') this.alternarDepuracion();
    });
    if (params.has('debug')) this.alternarDepuracion();

    // Los desafíos se bajan por detrás cuando ya arrancó el juego, para que después no esperen.
    Promise.resolve(this.datos.intro?.terminada).then(() => {
      for (const d of Object.values(this.mundo.desafios || {})) precargarDesafio(d);
    });

    // ?hablar=<id> abre el diálogo de ese personaje al empezar (para probar diálogos rápido).
    // ?desafio=<id> empieza directamente ese desafío.
    const probar = this.interactuables.find(e => e.datos.id === params.get('hablar'));
    if (params.has('desafio')) Promise.resolve(this.datos.intro?.terminada).then(() => this.empezarDesafio(params.get('desafio')));
    else if (probar) this.hablar(probar);
    else if (!this.estado.terminado) {
      // El aviso del objetivo sale cuando termina la intro (si la hay).
      Promise.resolve(this.datos.intro?.terminada).then(() =>
        this.time.delayedCall(700, () => this.interfaz.mostrarAviso(`Objetivo: ${this.mundo.objetivo.titulo}`, 4.6)));
    }
  }

  // Claves de textura de cada dirección de un personaje (frente, espalda, lado, caminando).
  texturasDe(p) {
    const alto = altoDe(p, this.mundo);
    const s = spritesDe(p);
    const clave = ruta => claveTextura(ruta, alto);
    return {
      frente: clave(s.frente), espalda: clave(s.espalda), lado: clave(s.lado),
      caminando: s.caminando?.map(clave) ?? null,
      caminandoFrente: s.caminandoFrente?.map(clave) ?? null,
      caminandoEspalda: s.caminandoEspalda?.map(clave) ?? null,
    };
  }

  crearNpc(datos) {
    const sombra = this.add.image(datos.x, datos.y, 'sombra').setDepth(datos.y - 1);
    const texturas = this.texturasDe(datos);
    const sprite = crearSpritePersonaje(this, datos, texturas.frente);
    if (datos.alto && datos.alto < this.mundo.altoPersonaje) sombra.setScale(datos.alto / this.mundo.altoPersonaje + 0.3);
    // Respiración sutil para que no parezcan estatuas.
    this.tweens.add({
      targets: sprite, scaleY: 1.025, duration: 900 + Math.random() * 400,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: Math.random() * 800,
    });
    return { tipo: 'personaje', datos, sprite, sombra, texturas };
  }

  // Un personaje mira hacia un punto. El sprite de costado mira a la derecha,
  // salvo que el personaje tenga "ladoMiraIzquierda" (como los animales).
  mirarHacia(entidad, x, y) {
    if (!entidad.texturas) return;
    const dx = x - entidad.datos.x, dy = y - entidad.datos.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      entidad.sprite.setTexture(entidad.texturas.lado).setFlipX((dx < 0) !== !!entidad.datos.ladoMiraIzquierda);
    } else {
      entidad.sprite.setTexture(dy < 0 ? entidad.texturas.espalda : entidad.texturas.frente).setFlipX(false);
    }
  }

  mirarAlFrente(entidad) {
    if (entidad.texturas) entidad.sprite.setTexture(entidad.texturas.frente).setFlipX(false);
  }

  iniciarSonidos() {
    const arrancar = () => {
      // La música se baja por detrás (puede ser pesada, no tiene que demorar el inicio)
      // y entra suave cuando termina la intro (si la hay).
      const m = this.mundo.musica;
      if (m.archivo) {
        const descargada = new Promise(r => {
          if (this.cache.audio.exists(m.archivo)) return r();
          this.load.audio(m.archivo, m.archivo);
          this.load.once(`filecomplete-audio-${m.archivo}`, r);
          this.load.start();
        });
        Promise.all([descargada, this.datos.intro?.terminada]).then(() => {
          this.musica = this.sound.add(m.archivo, { loop: true, volume: 0 });
          this.musica.play();
          this.fundirMusica(0, m.volumen ?? 0.15, 3000);
        });
      }
      this.sonidosAmbiente = this.mundo.sonidos
        .filter(s => this.cache.audio.exists(s.archivo))
        .map(s => {
          const sonido = this.sound.add(s.archivo, { loop: true, volume: 0 });
          sonido.play();
          return { datos: s, sonido };
        });
    };
    this.sonidosAmbiente = [];
    // En el celular el audio recién se habilita con el primer toque.
    if (this.sound.locked) this.sound.once('unlocked', arrancar);
    else arrancar();
  }

  // Zoom según la pantalla: en el lado corto y en el largo tienen que entrar al menos
  // cierta cantidad de tiles (configurable en mundo.json → tilesVisibles). Nunca más que x1.
  ajustarZoom() {
    const { width, height } = this.scale;
    const tile = this.mundo.tile * this.mundo.escala;
    const minimo = this.mundo.tilesVisibles ?? TILES_VISIBLES;
    const corto = Math.min(width, height), largo = Math.max(width, height);
    let zoom = Math.min(1, corto / (minimo.corto * tile), largo / (minimo.largo * tile));
    // Nunca mostrar fuera del mapa.
    zoom = Math.max(zoom, width / this.anchoMapa, height / this.altoMapa);
    this.cameras.main.setZoom(zoom);
  }

  update(time, delta) {
    const bloqueado = this.dialogo.abierto || this.interfaz.bloqueaJuego() || this.datos.intro?.activa || this.desafioActivo;
    if (bloqueado) this.controles.cancelar();
    const v = bloqueado ? { x: 0, y: 0 } : this.controles.vector();
    const dt = Math.min(delta, 50) / 1000;
    const velocidad = this.mundo.jugador.velocidad;

    this.actualizarVisibilidad();
    const moviendo = v.x !== 0 || v.y !== 0;
    if (moviendo) {
      this.mover(v.x * velocidad * dt, v.y * velocidad * dt);
      this.paso += dt * 14 * Math.hypot(v.x, v.y);
    } else {
      this.paso = 0;
    }
    this.animarJugador(v, moviendo);
    this.ubicarJugador();
    this.mapa.actualizar(this.cameras.main.worldView);
    this.trafico.update(dt);
    this.actualizarCercano(time);
    if (!bloqueado) this.revisarEventos();
    this.actualizarVolumenes();
    if (this.textoDepuracion) this.actualizarDepuracion();
  }

  // Personajes y objetos con condición ("si") aparecen o desaparecen según la historia.
  actualizarVisibilidad() {
    for (const e of this.entidades) {
      const visible = this.estado.cumple(e.datos.si, this.personajes);
      if (e.visible === visible) continue;
      e.visible = visible;
      e.sprite.setVisible(visible);
      e.sombra?.setVisible(visible);
      e.copa?.setVisible(visible);
    }
  }

  // Mueve por ejes separados (así se desliza contra las paredes) y en pasos chicos.
  mover(dx, dy) {
    const pasos = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 6));
    const sx = dx / pasos, sy = dy / pasos;
    for (let i = 0; i < pasos; i++) {
      if (sx && !this.choca(this.pos.x + sx, this.pos.y)) this.pos.x += sx;
      if (sy && !this.choca(this.pos.x, this.pos.y + sy)) this.pos.y += sy;
    }
  }

  choca(x, y) {
    const rx = x - PIES.ancho / 2, ry = y - PIES.alto;
    if (this.colision.chocaRect(rx, ry, PIES.ancho, PIES.alto)) return true;
    return this.entidades.some(e => {
      if (!e.visible) return false;
      if (e.tipo === 'personaje') {
        return Math.abs(e.datos.x - x) < PIES.ancho && Math.abs(e.datos.y - y) < PIES.alto;
      }
      if (!e.datos.solido) return false;
      const ancho = e.sprite.displayWidth * 0.8;
      return rx < e.datos.x + ancho / 2 && rx + PIES.ancho > e.datos.x - ancho / 2 &&
        ry < e.datos.y && ry + PIES.alto > e.datos.y - ALTO_BASE_SOLIDA;
    });
  }

  // Elige la imagen del jugador según hacia dónde camina. De costado alterna los cuadros de caminata.
  animarJugador(v, moviendo) {
    const t = this.texturasJugador;
    if (moviendo) {
      if (Math.abs(v.x) >= Math.abs(v.y)) this.direccion = v.x < 0 ? 'izquierda' : 'derecha';
      else this.direccion = v.y < 0 ? 'espalda' : 'frente';
    }
    const deCostado = this.direccion === 'izquierda' || this.direccion === 'derecha';
    // Ciclo de caminata de la dirección actual (si hay cuadros para esa dirección).
    let ciclo = null;
    if (deCostado && t.caminando?.length >= 3) {
      // Ciclo completo de costado: los cuadros en orden.
      ciclo = t.caminando;
    } else if (deCostado && t.caminando) {
      // Con uno o dos cuadros: caminar 1, parado, caminar 2, parado…
      ciclo = [t.caminando[0], t.lado, t.caminando[1] || t.caminando[0], t.lado];
    } else if (this.direccion === 'frente') {
      ciclo = t.caminandoFrente;
    } else if (this.direccion === 'espalda') {
      ciclo = t.caminandoEspalda;
    }
    let clave;
    // Qué tan rápido pasan los cuadros, para que los pies acompañen la velocidad (menos = más rápido).
    const porCuadro = deCostado ? 1.25 : 1.2;
    if (moviendo && ciclo) clave = ciclo[Math.floor(this.paso / porCuadro) % ciclo.length];
    else clave = deCostado ? t.lado : t[this.direccion];
    // Sonido de pasos: de frente y de espalda, dos por ciclo (uno por pie); de costado, uno por ciclo.
    // Sin cuadros, uno por saltito.
    if (moviendo) {
      const cuadrosPorPisada = ciclo && (deCostado ? ciclo.length : ciclo.length / 2);
      const pisada = ciclo ? Math.floor(this.paso / porCuadro / cuadrosPorPisada) : Math.floor(this.paso / Math.PI);
      if (pisada !== this.ultimaPisada) this.sonarPaso();
      this.ultimaPisada = pisada;
    } else {
      this.ultimaPisada = null;
    }
    if (this.jugador.texture.key !== clave) this.jugador.setTexture(clave);
    this.jugador.setFlipX(this.direccion === 'izquierda');
    // Si hay cuadros de caminata, no hace falta el saltito que simula los pasos.
    this.saltoActivo = !ciclo;
  }

  // Cada paso varía un poco el tono para que no suene siempre igual.
  sonarPaso() {
    const j = this.mundo.jugador;
    if (!j.sonidoPasos || this.sound.locked || !this.cache.audio.exists(j.sonidoPasos)) return;
    this.sound.play(j.sonidoPasos, { volume: j.volumenPasos ?? 0.4, detune: Phaser.Math.Between(-150, 150) });
  }

  ubicarJugador() {
    const salto = this.saltoActivo === false ? 0 : Math.abs(Math.sin(this.paso)) * 8;
    this.jugador.setPosition(this.pos.x, this.pos.y - salto).setDepth(this.pos.y);
    this.jugadorSombra.setPosition(this.pos.x, this.pos.y).setDepth(this.pos.y - 1);
  }

  actualizarCercano(time) {
    const rango = this.mundo.distanciaParaHablar;
    let mejor = null, mejorDist = Infinity;
    // Los objetos "al tocar" cuentan solo mientras su condición se cumpla (el tacho, hasta que sale la comadreja).
    const tocables = this.tocables.filter(e => this.estado.cumple(e.datos.alTocarSi, this.personajes));
    for (const e of [...this.interactuables, ...tocables]) {
      if (!e.visible) continue;
      const d = Math.hypot(e.datos.x - this.pos.x, e.datos.y - this.pos.y);
      if (d <= rango && d < mejorDist) { mejor = e; mejorDist = d; }
    }
    this.cercano = mejor;
    const visible = !!mejor && !this.dialogo.abierto && !this.ocupado;
    this.etiqueta.setVisible(visible && !!mejor.datos.nombre);
    this.burbuja.setVisible(visible);
    if (!visible) return;
    const cabeza = mejor.datos.y - mejor.sprite.displayHeight;
    this.etiqueta.setText(mejor.datos.nombre || '').setPosition(mejor.datos.x, cabeza - 8);
    const alturaEtiqueta = mejor.datos.nombre ? 42 : 0;
    this.burbuja.setPosition(mejor.datos.x, cabeza - 8 - alturaEtiqueta + Math.sin(time / 200) * 4);
  }

  puedeInteractuar() {
    return !this.dialogo.abierto && !this.interfaz.bloqueaJuego() && !this.datos.intro?.activa && !this.desafioActivo && !this.ocupado &&
      performance.now() - this.ultimoCierre > ESPERA_TRAS_DIALOGO;
  }

  // Click o tap. En orden: un objeto que se sacude (árbol, tacho), una zona que se activa al
  // tocarla, y si no, hablar con quien esté cerca (tocando en cualquier lugar).
  // Si no hay nadie cerca y se tocó a alguien lejos, avisa que hay que acercarse.
  alTocar(pointer) {
    if (!this.puedeInteractuar()) return;
    const punto = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const objeto = this.objetoTocableEn(punto.x, punto.y);
    if (objeto) {
      this.sacudir(objeto);
      return;
    }
    if (this.tocarZona(punto.x, punto.y)) return;
    if (this.cercano) {
      this.interactuar(this.cercano);
      return;
    }
    const tocado = this.interactuables.some(e => e.visible && e.sprite.getBounds().contains(punto.x, punto.y));
    if (tocado) this.textoFlotante('Acercate para hablar');
  }

  // Zonas de evento marcadas "al tocar": se activan con un click o tap adentro (no caminando).
  tocarZona(x, y) {
    const ev = this.mundo.eventos.find(ev => ev.alTocar &&
      x >= ev.x && x <= ev.x + ev.ancho && y >= ev.y && y <= ev.y + ev.alto);
    if (!ev || !this.estado.cumple(ev.si, this.personajes)) return false;
    if (ev.unaVez) {
      if (this.estado.flags[`evento:${ev.id}`]) return false;
      this.estado.activarFlag(`evento:${ev.id}`);
    }
    for (const efecto of ev.efectos || []) this.aplicarEfecto(efecto, ev);
    return true;
  }

  // Con quien esté cerca: se habla, o si es un objeto "al tocar" (el tacho), se sacude.
  interactuar(entidad) {
    if (this.tocables.includes(entidad)) this.sacudir(entidad);
    else this.hablar(entidad);
  }

  // idDialogo: abre ese diálogo en particular (no el que toque según las condiciones);
  // en ese caso la charla no suma el contacto a la agenda.
  hablar(entidad, idDialogo) {
    this.controles.cancelar();
    this.mirarHacia(entidad, this.pos.x, this.pos.y);
    const datos = idDialogo ? { ...entidad.datos, dialogos: [{ id: idDialogo }] } : entidad.datos;
    this.dialogo.abrir(datos, () => this.alTerminarDialogo(entidad, !idDialogo));
  }

  alTerminarDialogo(entidad, sumaContacto = true) {
    this.ultimoCierre = performance.now();
    if (entidad.texturas) this.time.delayedCall(2500, () => { if (!this.dialogo.abierto) this.mirarAlFrente(entidad); });
    const p = entidad.datos;
    const obj = this.mundo.objetivo;
    const antes = this.estado.cantidadContactos(this.personajes);
    if (sumaContacto && entidad.tipo === 'personaje' && (!p.agendaAlFinal || this.estado.terminado)) {
      if (this.estado.agregarContacto(p.id)) this.interfaz.mostrarAviso(`Nuevo contacto: ${p.nombre}`);
    }
    const despues = this.estado.cantidadContactos(this.personajes);
    if (!this.estado.terminado && antes < obj.contactosNecesarios && despues >= obj.contactosNecesarios) {
      this.time.delayedCall(1500, () => this.felicitar());
    }
    this.interfaz.actualizar();

    if (this.finalPendiente) {
      this.finalPendiente = false;
      this.celebrar();
      this.time.delayedCall(1500, () => this.interfaz.mostrarFinal());
    } else if (this.desafioPendiente) {
      const id = this.desafioPendiente;
      this.desafioPendiente = null;
      this.empezarDesafio(id);
    } else if (this.dialogoPendiente) {
      const abrir = this.dialogoPendiente;
      this.dialogoPendiente = null;
      this.time.delayedCall(150, abrir);
    }
    // Un personaje que se va corriendo (efecto "huir"), cuando se cierra el diálogo.
    const huidas = this.huidasPendientes || [];
    this.huidasPendientes = [];
    for (const efecto of huidas) this.huir(efecto);
  }

  // Sube o baja el volumen de la música de a poco, entre dos valores fijos. No se anima el volumen
  // del sonido directamente: el navegador tarda en aplicarlo y al leerlo devuelve el volumen
  // anterior (por eso la música arrancaba fuerte y después bajaba).
  fundirMusica(desde, hasta, duracion, alTerminar) {
    this.fundidoMusica?.stop();
    const v = { volumen: desde };
    this.musica.setVolume(desde);
    this.fundidoMusica = this.tweens.add({
      targets: v, volumen: hasta, duration: duracion,
      onUpdate: () => this.musica.setVolume(v.volumen),
      onComplete: () => alTerminar?.(),
    });
  }

  // Desafío de preguntas (mundo.json → desafios). Mientras dura, el juego se frena y la música
  // de fondo se calla; al terminar se aplican los efectos de ganar o de perder.
  async empezarDesafio(id) {
    const config = this.mundo.desafios?.[id];
    if (!config) {
      console.warn(`No existe el desafío "${id}".`);
      return;
    }
    this.desafioActivo = true;
    this.controles.cancelar();
    const volumen = this.mundo.musica.volumen ?? 0.15;
    if (this.musica) this.fundirMusica(volumen, 0, 400, () => this.musica.pause());
    const desafio = new Desafio(config);
    const gano = await desafio.correr();
    for (const efecto of (gano ? config.alGanar : config.alPerder) || []) this.aplicarEfecto(efecto, { id });
    await desafio.cerrar();
    if (this.musica) {
      this.musica.resume();
      this.fundirMusica(0, volumen, 2000);
    }
    this.desafioActivo = false;
    this.ultimoCierre = performance.now();
  }

  // Efectos que se pueden poner en las opciones de los diálogos y en los eventos.
  aplicarEfecto(efecto, origen) {
    switch (efecto.tipo) {
      case 'flag':
        this.estado.activarFlag(efecto.nombre, efecto.valor ?? true);
        break;
      case 'quitarFlag':
        this.estado.activarFlag(efecto.nombre, false);
        break;
      case 'contacto':
        if (this.estado.agregarContacto(efecto.id)) {
          const p = this.personajes.find(x => x.id === efecto.id);
          this.interfaz.mostrarAviso(`Nuevo contacto: ${p?.nombre ?? efecto.id}`);
          this.interfaz.actualizar();
        }
        break;
      case 'aviso':
        this.interfaz.mostrarAviso(efecto.texto || '');
        break;
      case 'sonido':
        if (this.cache.audio.exists(efecto.archivo)) this.sound.play(efecto.archivo);
        break;
      case 'dialogo': {
        // "dialogo": uno en particular; "exclamacion": antes le sale un "!" arriba de la cabeza.
        const entidad = this.interactuables.find(e => e.datos.id === efecto.id);
        if (!entidad) break;
        const abrir = () => this.hablar(entidad, efecto.dialogo);
        const seguir = efecto.exclamacion ? () => this.exclamar(entidad, abrir) : abrir;
        if (this.dialogo.abierto) this.dialogoPendiente = seguir;
        else seguir();
        break;
      }
      case 'premio': {
        // Sale del personaje que habla o del objeto tocado, como la palta de los árboles.
        const desde = this.entidades.find(e => e.datos === origen || e.datos.id === origen?.id);
        if (desde) this.darPremio(desde, efecto);
        break;
      }
      case 'aparecer': {
        const entidad = this.entidades.find(e => e.datos.id === efecto.id);
        const desde = this.entidades.find(e => e.datos === origen);
        if (entidad) this.aparecer(entidad, desde, efecto.hablar);
        break;
      }
      case 'huir':
        // Si se eligió en un diálogo, se va cuando el diálogo se cierra.
        if (this.dialogo.abierto) (this.huidasPendientes ??= []).push(efecto);
        else this.huir(efecto);
        break;
      case 'desafio':
        // Si se eligió en un diálogo, empieza cuando el diálogo se cierra.
        this.desafioPendiente = efecto.id;
        if (!this.dialogo.abierto) this.alTerminarDialogo({ tipo: 'evento', datos: {} });
        break;
      case 'final':
        this.estado.terminado = true;
        this.estado.guardar();
        this.finalPendiente = true;
        if (!this.dialogo.abierto) this.alTerminarDialogo({ tipo: 'evento', datos: {} });
        break;
      default:
        console.warn(`Efecto desconocido en "${origen?.id}":`, efecto);
    }
  }

  // Zonas de evento: se disparan al entrar caminando.
  revisarEventos() {
    for (const ev of this.mundo.eventos) {
      if (ev.alTocar) continue; // esas se activan tocándolas (ver tocarZona)
      const dentro = this.pos.x >= ev.x && this.pos.x <= ev.x + ev.ancho &&
        this.pos.y >= ev.y && this.pos.y <= ev.y + ev.alto;
      const estabaDentro = this.dentroDeEvento.has(ev.id);
      if (dentro && !estabaDentro) {
        this.dentroDeEvento.add(ev.id);
        const yaPaso = ev.unaVez && this.estado.flags[`evento:${ev.id}`];
        if (!yaPaso && this.estado.cumple(ev.si, this.personajes)) {
          if (ev.unaVez) this.estado.activarFlag(`evento:${ev.id}`);
          for (const efecto of ev.efectos || []) this.aplicarEfecto(efecto, ev);
        }
      } else if (!dentro && estabaDentro) {
        this.dentroDeEvento.delete(ev.id);
      }
    }
  }

  // Los sonidos de ambiente suenan más fuerte cuanto más cerca estás.
  actualizarVolumenes() {
    for (const { datos, sonido } of this.sonidosAmbiente) {
      const d = Math.hypot(datos.x - this.pos.x, datos.y - this.pos.y);
      const radio = datos.radio || 400;
      sonido.setVolume(Math.max(0, 1 - d / radio) * (datos.volumen ?? 1));
    }
  }

  textoFlotante(texto) {
    const t = this.add.text(this.pos.x, this.pos.y - this.jugador.displayHeight - 10, texto, {
      fontFamily: '"Pixelify Sans", monospace', fontSize: '24px', color: '#ffffff',
      stroke: '#1b1b2f', strokeThickness: 6,
    }).setOrigin(0.5, 1).setDepth(2e5);
    this.tweens.add({ targets: t, y: t.y - 40, alpha: 0, duration: 1200, delay: 400, onComplete: () => t.destroy() });
  }

  // Objeto que se sacude al tocarlo (un árbol, o uno con efectos "al tocar", como el tacho)
  // en ese punto: el de más adelante, y solo si se tocó una parte dibujada.
  objetoTocableEn(x, y) {
    let mejor = null;
    for (const e of this.entidades) {
      if (e.tipo !== 'objeto' || !(e.copa || e.datos.alTocar?.length)) continue;
      if (!e.visible || !e.sprite.getBounds().contains(x, y)) continue;
      const s = e.sprite;
      const lx = Math.floor((x - s.getTopLeft().x) / s.scaleX);
      const ly = Math.floor((y - s.getTopLeft().y) / s.scaleY);
      if (this.textures.getPixelAlpha(lx, ly, s.texture.key) < 100) continue;
      if (!mejor || e.datos.y > mejor.datos.y) mejor = e;
    }
    return mejor;
  }

  // Sacudón del objeto. Los árboles largan hojitas y a veces un premio (mundo.json → arboles);
  // los objetos con efectos "al tocar" (alTocar, si se cumple alTocarSi) los aplican después.
  sacudir(e) {
    const ahora = performance.now();
    if (ahora - (e.ultimaSacudida || 0) < 900) return;
    e.ultimaSacudida = ahora;
    const partes = [e.sprite, e.copa].filter(Boolean);
    this.tweens.killTweensOf(partes);
    partes.forEach(p => p.setAngle(0));
    this.tweens.chain({
      targets: partes,
      tweens: [
        { angle: 1.6, duration: 70 }, { angle: -1.4, duration: 110 }, { angle: 1, duration: 100 },
        { angle: -0.5, duration: 100 }, { angle: 0, duration: 120, ease: 'Sine.easeOut' },
      ],
    });

    if (e.datos.alTocar?.length && this.estado.cumple(e.datos.alTocarSi, this.personajes)) {
      this.time.delayedCall(450, () => { for (const efecto of e.datos.alTocar) this.aplicarEfecto(efecto, e.datos); });
    }
    if (!e.copa) return;

    const d = e.datos, ancho = e.sprite.displayWidth, alto = e.sprite.displayHeight;
    const hojas = this.add.particles(0, 0, 'hoja', {
      x: { min: d.x - ancho * 0.38, max: d.x + ancho * 0.38 },
      y: { min: d.y - alto * 0.9, max: d.y - alto * 0.35 },
      speedX: { min: -70, max: 70 }, speedY: { min: -60, max: 30 }, gravityY: 160,
      rotate: { onEmit: () => Math.random() * 360, onUpdate: (p, k, t, v) => v + 3 },
      scale: { min: 0.8, max: 1.5 },
      alpha: { start: 1, end: 0, ease: 'Quad.easeIn' },
      lifespan: { min: 1300, max: 2300 },
      tint: [0x6fae3a, 0x9bd14a, 0xc6e06a, 0x7fbf45, 0xd9c45a],
      emitting: false,
    }).setDepth(profundidad('arriba', d.y) + 1);
    hojas.explode(24);
    this.time.delayedCall(2500, () => hojas.destroy());

    const a = this.mundo.arboles;
    if (a?.premio && Math.random() < (a.probabilidad ?? 1 / 3)) {
      const premio = { imagen: a.premio, alto: a.altoPremio, texto: a.textoPremio, sonido: a.sonidoPremio, volumen: a.volumenPremio };
      this.time.delayedCall(250, () => this.darPremio(e, premio));
    }
  }

  // Un premio (imagen) salta desde la entidad con un brillo y chispas, suena y avisa (si tiene texto).
  // cfg: { imagen, alto, texto, sonido, volumen }.
  darPremio(e, cfg) {
    const d = e.datos;
    const capa = profundidad('arriba', d.y) + 2;
    // Sube desde la copa, pero sin salirse de lo que se ve en pantalla.
    const x = d.x, desde = d.y - e.sprite.displayHeight * 0.45;
    const hasta = Math.max(desde - 170, this.cameras.main.worldView.y + 130);

    const brillo = this.add.image(x, hasta, 'punto').setTint(0xfff2a8).setBlendMode('ADD').setScale(0).setDepth(capa);
    const premio = this.add.image(x, desde, claveTextura(cfg.imagen, cfg.alto || 110)).setScale(0).setDepth(capa + 1);
    this.tweens.add({ targets: premio, y: hasta, scale: 1, duration: 450, ease: 'Back.easeOut' });
    this.tweens.add({ targets: brillo, scale: 10, duration: 450, ease: 'Back.easeOut' });
    this.tweens.add({ targets: brillo, angle: 360, duration: 2400 });
    this.time.delayedCall(350, () => {
      const chispas = this.add.particles(x, hasta, 'chispa', {
        speed: { min: 220, max: 480 }, angle: { min: 0, max: 360 }, gravityY: 350,
        rotate: { min: 0, max: 360 }, scale: { start: 1.4, end: 0.3 },
        lifespan: { min: 600, max: 1000 }, tint: [0xffd34d, 0xfff2a8, 0x9bd14a, 0xffffff],
        emitting: false,
      }).setDepth(capa + 2);
      chispas.explode(36);
      this.time.delayedCall(1100, () => chispas.destroy());
    });
    // Flota un momento y se va.
    this.tweens.add({ targets: premio, y: hasta - 14, duration: 380, yoyo: true, repeat: 1, delay: 450, ease: 'Sine.easeInOut' });
    this.tweens.add({
      targets: [premio, brillo], alpha: 0, duration: 450, delay: 2000,
      onComplete: () => { premio.destroy(); brillo.destroy(); },
    });
    this.tweens.add({ targets: premio, y: hasta - 90, scale: 0.6, duration: 450, delay: 2000, ease: 'Quad.easeIn' });

    if (cfg.sonido && this.cache.audio.exists(cfg.sonido)) this.sound.play(cfg.sonido, { volume: cfg.volumen ?? 0.5 });
    if (cfg.texto) this.interfaz.mostrarAviso(cfg.texto, 3);
  }

  // Un "!" salta arriba de la cabeza del personaje; después sigue (por ejemplo, abre su diálogo).
  exclamar(entidad, luego) {
    this.controles.cancelar();
    this.ocupado = true;
    this.mirarHacia(entidad, this.pos.x, this.pos.y);
    const cabeza = entidad.datos.y - entidad.sprite.displayHeight - 12;
    const signo = this.add.text(entidad.datos.x, cabeza, '!', {
      fontFamily: '"Pixelify Sans", monospace', fontSize: '72px', fontStyle: '600', color: '#ffd34d',
      stroke: '#1b1b2f', strokeThickness: 10,
    }).setOrigin(0.5, 1).setDepth(2e5).setScale(0);
    this.tweens.add({ targets: signo, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: signo, y: cabeza - 24, duration: 160, yoyo: true, repeat: 1, delay: 260, ease: 'Sine.easeOut' });
    this.time.delayedCall(950, () => {
      signo.destroy();
      this.ocupado = false;
      luego();
    });
  }

  // Un personaje oculto aparece de un salto desde un objeto (por ejemplo, la comadreja del tacho).
  // La condición "si" del personaje la tiene que dejar visible (un efecto "flag" antes de este).
  aparecer(entidad, desde, hablarDespues) {
    this.actualizarVisibilidad();
    const s = entidad.sprite, d = entidad.datos;
    const x0 = desde ? desde.datos.x : d.x, y0 = desde ? desde.datos.y - desde.sprite.displayHeight * 0.6 : d.y;
    const salto = { t: 0 };
    s.setPosition(x0, y0).setAlpha(0);
    entidad.sombra?.setAlpha(0);
    this.ocupado = true;
    this.tweens.add({
      targets: salto, t: 1, duration: 650, ease: 'Sine.easeInOut',
      onUpdate: () => {
        const t = salto.t;
        s.setPosition(x0 + (d.x - x0) * t, y0 + (d.y - y0) * t - Math.sin(Math.PI * t) * 140).setAlpha(Math.min(1, t * 4));
      },
      onComplete: () => {
        s.setPosition(d.x, d.y);
        entidad.sombra?.setAlpha(1);
        this.ocupado = false;
        if (hablarDespues) this.time.delayedCall(250, () => this.hablar(entidad));
      },
    });
    const humo = this.add.particles(x0, y0, 'punto', {
      speed: { min: 60, max: 180 }, angle: { min: 180, max: 360 }, scale: { start: 1.2, end: 0 },
      alpha: { start: 0.8, end: 0 }, lifespan: 600, tint: 0xd8d2c4, emitting: false,
    }).setDepth(s.depth + 1);
    humo.explode(14);
    this.time.delayedCall(800, () => humo.destroy());
  }

  // Un personaje se va corriendo (lejos del jugador) y desaparece; al final activa efecto.flag.
  huir(efecto) {
    const entidad = this.entidades.find(e => e.datos.id === efecto.id);
    if (!entidad) return;
    const s = entidad.sprite, d = entidad.datos;
    const lado = d.x >= this.pos.x ? 1 : -1;
    if (entidad.texturas) s.setTexture(entidad.texturas.lado).setFlipX((lado < 0) !== !!d.ladoMiraIzquierda);
    entidad.sombra?.setVisible(false);
    this.ocupado = true;
    this.tweens.add({ targets: s, y: d.y - 18, duration: 110, yoyo: true, repeat: 4, ease: 'Sine.easeOut' });
    this.tweens.add({
      targets: s, x: d.x + lado * 650, alpha: 0, duration: 1000, ease: 'Quad.easeIn',
      onComplete: () => {
        if (efecto.flag) this.estado.activarFlag(efecto.flag);
        this.actualizarVisibilidad();
        s.setPosition(d.x, d.y).setAlpha(1);
        this.mirarAlFrente(entidad);
        this.ocupado = false;
      },
    });
  }

  // Al llegar a los contactos necesarios: confeti y el diálogo de felicitaciones
  // (mundo.objetivo.dialogoAlCompletar). Si hay un diálogo o desafío en curso, espera a que termine.
  felicitar() {
    const id = this.mundo.objetivo.dialogoAlCompletar;
    if (!id || !this.dialogo.dialogos[id]) {
      this.interfaz.mostrarAviso('¡Ya conocés suficiente gente! Buscá al invitado especial');
      return;
    }
    if (this.dialogo.abierto || this.desafioActivo) {
      this.time.delayedCall(500, () => this.felicitar());
      return;
    }
    this.controles.cancelar();
    this.celebrar();
    this.dialogo.abrir({ id: 'objetivo', dialogos: [{ id }] }, () => { this.ultimoCierre = performance.now(); });
  }

  celebrar() {
    const vista = this.cameras.main.worldView;
    const confeti = this.add.particles(0, 0, 'chispa', {
      x: { min: vista.x, max: vista.right }, y: vista.y - 20,
      speedY: { min: 150, max: 400 }, speedX: { min: -100, max: 100 },
      rotate: { min: 0, max: 360 }, scale: { min: 0.8, max: 1.8 },
      lifespan: 4000, gravityY: 120, quantity: 4, frequency: 30,
      tint: [0xff5a5a, 0xffd34d, 0x5ad1ff, 0x7dff8a, 0xff8ae2],
    }).setDepth(3e5);
    this.time.delayedCall(2500, () => confeti.stop());
    this.time.delayedCall(7000, () => confeti.destroy());
  }

  // Modo depuración (tecla C o ?debug en la dirección): muestra la colisión y coordenadas.
  alternarDepuracion() {
    if (this.capaColision) {
      this.capaColision.destroy();
      this.capaColision = null;
      this.textoDepuracion.remove();
      this.textoDepuracion = null;
      return;
    }
    if (!this.textures.exists('colision-depuracion')) {
      this.textures.addCanvas('colision-depuracion', this.colision.crearLienzo());
    }
    this.capaColision = this.add.image(0, 0, 'colision-depuracion').setOrigin(0)
      .setScale(CELDA).setAlpha(0.4).setDepth(1.5e5);
    this.textoDepuracion = document.createElement('div');
    this.textoDepuracion.className = 'depuracion';
    document.body.appendChild(this.textoDepuracion);
  }

  actualizarDepuracion() {
    const p = this.input.activePointer;
    const m = this.cameras.main.getWorldPoint(p.x, p.y);
    this.textoDepuracion.textContent =
      `Jugador: ${Math.round(this.pos.x)}, ${Math.round(this.pos.y)}  |  Mouse: ${Math.round(m.x)}, ${Math.round(m.y)}`;
  }
}
