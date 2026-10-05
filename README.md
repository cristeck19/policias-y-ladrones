# Policías y Ladrones

Juego de laberinto en 2D para el navegador del celular, hecho con [Phaser 3](https://phaser.io/) y TypeScript.

Eres el cuadro amarillo (el ladrón). Empiezas en la entrada y tienes que llegar a la salida, en la esquina opuesta, antes de que se acabe el tiempo. Los policías (cuadros azules) empiezan en la salida.

## Reglas del MVP

- Cada nivel genera un laberinto aleatorio, con algunos caminos alternativos para poder esquivar.
- No hay vidas: si un policía te atrapa, vas a mitad de velocidad durante 3 s, el policía queda aturdido 1,5 s y te quita un artefacto al azar si llevas alguno.
- Pierdes solo si se acaba el reloj del nivel.
- **Reloj de arena** (máximo 2 por laberinto): al usarlo, el reloj del nivel se detiene y un segundo reloj consume 15 s de tiempo extra. Cuando se vacía, el reloj del nivel sigue donde estaba.
- **Disfraz de policía** (1 por laberinto): durante 8 s el ladrón se ve como policía y los policías lo ignoran. Si un policía choca con él, el disfraz se cae pero no lo atrapa.
- Los policías patrullan y te persiguen cuando estás cerca. Cada nivel es más grande, con policías más rápidos y, desde el nivel 3, más policías.

## Controles

- Celular: desliza el dedo en cualquier parte de la pantalla para cambiar de dirección. Toca un artefacto del panel inferior para usarlo.
- Computadora: flechas o WASD para moverte (si mantienes una tecla, giras en el siguiente cruce posible), espacio para usar el primer artefacto, P o Esc para pausar.

## Desarrollo

```bash
npm install
npm run dev      # servidor local (con --host para abrirlo desde el celular en la misma red)
npm test         # pruebas del generador de laberintos
npm run build    # compila en dist/
```

Cada push a `main` publica el juego en GitHub Pages con el workflow `.github/workflows/deploy.yml` (en Settings → Pages, la fuente debe ser "GitHub Actions").

## Estructura

- `src/maze.ts`: generación de laberintos y búsqueda de caminos (sin Phaser, con pruebas).
- `src/mover.ts`: movimiento de celda en celda de los cuadros.
- `src/config.ts`: reglas, colores y dificultad por nivel.
- `src/scenes/`: menú, partida, pausa y resultado.
