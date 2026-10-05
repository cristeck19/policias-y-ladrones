# Policías y Ladrones

Juego de laberinto en 2D para el navegador del celular, hecho con [Phaser 3](https://phaser.io/) y TypeScript, según el documento de diseño del proyecto.

Eres el cuadro amarillo (el ladrón). Empiezas en la entrada, abajo, y tienes que llegar a la salida, arriba y en el lado opuesto, antes de que se acabe el tiempo. El policía (cuadro azul con sirena roja) empieza en la salida.

**Jugar:** https://cristeck19.github.io/policias-y-ladrones/

## Reglas

- Cada laberinto sale de una semilla: retroceso recursivo, ciclos (sobre todo en callejones) y validación para que el camino no sea demasiado corto.
- El policía espera 3 s al empezar (cuenta regresiva).
- No hay vidas: si te atrapan, vas a mitad de velocidad 3 s, el policía queda aturdido 1,5 s y te roba un artefacto si llevas alguno. Pierdes solo si se acaba el reloj.
- Estrellas: 1 por escapar, 1 si sobra al menos un tercio del tiempo y 1 por no ser atrapado.

## Policía

Patrulla su mitad del laberinto, persigue (10 % más rápido) cuando te ve en línea recta o te oye cerca, busca en tu última posición conocida y, si falla y estás cerca de la salida, vuelve a vigilarla. Con varios policías comparten tu posición por radio y cada uno corta un camino distinto. Cuando empieza una persecución el borde de la pantalla parpadea en rojo y el celular vibra.

## Artefactos (inventario de 2)

| Artefacto | Efecto | Desde |
|---|---|---|
| Reloj de arena | Detiene el reloj del nivel mientras otro reloj consume 15 s (máx. 2 por laberinto) | 1 |
| Zapatillas | 50 % más rápido durante 4 s | 1 |
| Bomba de humo | Nube en tu celda; el policía que entra queda aturdido 3 s | 1 |
| Mapa | Muestra 5 s la ruta a la salida, los policías en el minimapa y los muros de las zonas oscuras | 2 |
| Señuelo | Cuadro falso que atrae a los policías que no te persiguen | 3 |
| Capa de invisibilidad | 5 s en los que solo te oyen muy de cerca | 4 |
| Mancha de aceite | Trampa: el policía resbala y pierde 2 s | 4 |
| Pared temporal | Muro en el pasillo de atrás durante 6 s | 5 |
| Llave maestra | Atraviesa un muro una vez | 6 |
| Disfraz de policía | 8 s en los que te ignoran; si uno choca contigo, se cae | 7 |

Después de usar un artefacto hay una espera de 5 s (los botones se ven en rojo con la cuenta). Si usas otro antes, el policía se divide en dos durante 15 s (máximo 3 policías). Desde el nivel 5 aparece un artefacto raro en un callejón sin salida.

## Progresión

| Niveles | Tamaño | Policías | Novedad |
|---|---|---|---|
| 1 a 5 | 9 × 15 | 1 lento | Zapatillas y humo |
| 6 a 15 | 13 × 21 | 1 | Mapa, señuelo, invisibilidad, aceite |
| 16 a 30 | 17 × 27 | 2 | Pared temporal, llave maestra; menos ciclos |
| 31+ | 21 × 35 | 2 o 3 | Menos tiempo; zonas oscuras |

En los laberintos grandes la cámara sigue al ladrón y un minimapa muestra la salida.

## Más

- **Monedas y apariencias:** recoge monedas y desbloquea colores, bordes y estelas (solo estética).
- **Laberinto del día:** la misma semilla para todos ese día; guarda tu mejor tiempo en este celular.
- **Modo infinito:** cada salida lleva a un laberinto más difícil.

## Controles

- Celular: desliza el dedo para cambiar de dirección (si el gesto llega un poco antes de un cruce, se aplica al llegar). En el menú puedes activar una cruceta. Los artefactos se usan con los dos botones de abajo a la derecha.
- Computadora: flechas o WASD (mantener la tecla gira en el siguiente cruce), 1 y 2 para los artefactos, P o Esc para pausar.

## Desarrollo

```bash
npm install
npm run dev      # servidor local (con --host para abrirlo desde el celular en la misma red)
npm test         # pruebas del generador, la progresión y los artefactos
npm run build    # compila en dist/
```

Cada push a `main` publica el juego en GitHub Pages con `.github/workflows/deploy.yml`.

## Estructura

- `src/maze.ts`: generación de laberintos con semilla, caminos y línea de visión (sin Phaser, con pruebas).
- `src/mover.ts`: movimiento de celda en celda de los cuadros.
- `src/config.ts`: reglas, progresión y estrellas.
- `src/items.ts`: tabla de artefactos, reparto por nivel e iconos.
- `src/skins.ts`, `src/storage.ts`: apariencias y progreso guardado.
- `src/scenes/`: menú, elegir nivel, partida, pausa, resultado y apariencia.
