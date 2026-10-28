// Punto de entrada: carga los datos del juego y arranca Phaser.
// Si es la primera vez, muestra la intro mientras el juego carga por detrás.

import { EscenaMundo } from './escena-mundo.js';
import { cargarDatos, texturasUsadas } from './datos.js';
import { cargarColision } from './colision.js';
import { prepararLienzos } from './texturas.js';
import { Estado } from './estado.js';
import { Intro } from './intro.js';
import { AvisoGirar, hayQueAvisarGirar } from './aviso-girar.js';

function mostrarError(mensaje) {
  const el = document.createElement('div');
  el.className = 'error-carga';
  el.textContent = mensaje;
  document.body.appendChild(el);
}

// La intro sale solo la primera vez que se abre el juego en este navegador, o después de
// reiniciar la partida (no al probar un diálogo con ?hablar=). Con ?intro se fuerza.
function empezarIntro(datos, estado) {
  const params = new URLSearchParams(location.search);
  const config = datos.mundo.intro;
  if (!config.lineas?.length || params.has('sinIntro') || params.has('hablar') || params.has('desafio')) return null;
  if (estado.introVista && !params.has('intro')) return null;
  const total = datos.personajes.filter(p => !p.agendaAlFinal && !p.noCuenta).length;
  return new Intro(config, { conocidas: estado.contactos.length, total });
}

async function iniciar() {
  if (location.protocol === 'file:') {
    mostrarError('Abrí el juego con Abrir-Juego.bat (no haciendo doble click en index.html).');
    return;
  }
  const cargando = document.createElement('div');
  cargando.className = 'cargando';
  cargando.textContent = 'Cargando…';
  document.body.appendChild(cargando);
  try {
    const datos = await cargarDatos();
    // Un solo estado de la partida, compartido con la escena del juego.
    datos.estado = new Estado();
    // En el celular, siempre primero el aviso de girar (su toque pone pantalla completa);
    // después la intro, si corresponde. Mientras tanto el juego carga por detrás.
    const aviso = hayQueAvisarGirar(datos.mundo.intro) ? new AvisoGirar(datos.mundo.intro) : null;
    const intro = empezarIntro(datos, datos.estado);
    let introLista = Promise.resolve();
    if (aviso || intro) {
      // Mientras estén en pantalla, el juego no arranca (ni la música, ni el aviso del objetivo).
      let avisar;
      datos.intro = { activa: true, terminada: new Promise(r => { avisar = r; }), avisar };
      introLista = (async () => {
        if (aviso) await aviso.tocado;
        if (intro) {
          aviso?.ocultar();
          await intro.correr();
        }
      })();
    }

    const [colision, lienzos] = await Promise.all([
      cargarColision(datos.mundo.mapa),
      prepararLienzos(texturasUsadas(datos)),
    ]);
    datos.colision = colision;
    datos.lienzos = lienzos;
    // Espera la tipografía pixel (sin bloquear si no hay internet).
    await Promise.race([
      document.fonts.load('24px "Pixelify Sans"').catch(() => {}),
      new Promise(r => setTimeout(r, 1500)),
    ]);

    const juego = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'juego',
      backgroundColor: '#14141f',
      pixelArt: true,
      scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%', expandParent: false },
    });
    // Al girar el celular, algunos navegadores avisan antes de tener el tamaño nuevo:
    // se vuelve a medir un rato después para no quedar con el tamaño viejo.
    const remedir = () => [100, 400, 1000].forEach(ms => setTimeout(() => juego.scale.refresh(), ms));
    addEventListener('orientationchange', remedir);
    addEventListener('resize', remedir);
    screen.orientation?.addEventListener('change', remedir);
    document.addEventListener('fullscreenchange', remedir);
    const listo = new Promise(r => juego.events.once('ready', r));
    juego.scene.add('mundo', EscenaMundo, true, datos);
    window.juego = juego; // acceso desde la consola del navegador, para revisar problemas

    await listo;
    cargando.remove();
    if (aviso || intro) {
      // Cuando terminan el aviso y la intro y el juego ya está listo, fundido al juego.
      await introLista;
      if (intro) {
        // Recién al terminarla (o saltearla) queda anotada como vista.
        datos.estado.introVista = true;
        datos.estado.guardar();
        await intro.ocultar();
      } else {
        await aviso.ocultar();
      }
      datos.intro.activa = false;
      datos.intro.avisar();
    }
  } catch (e) {
    console.error(e);
    cargando.remove();
    mostrarError(e.message);
  }
}

iniciar();
