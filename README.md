# Bombo

Sorteos de bingo para cualquier decisión: escribe tus opciones en el portabolas de la mesa, cada una se convierte en una bola numerada que el botón verde echa al bombo 3D y, al pulsar el botón rojo (o darle dos vueltas a la manivela y soltarla), sale una al azar.

**En vivo:** https://bombo.gontzi.dev

- React + TypeScript + Vite, escena 3D con Three.js / React Three Fiber.
- El ganador se elige de forma uniforme (`crypto`, muestreo por rechazo) antes de animar; la escena solo representa ese resultado.
- Física propia de las bolas en la jaula (con giro, rozamiento y las varillas que las suben) y trayectoria continua de la ganadora por el conducto hasta la bandeja.
- El bombo empieza vacío. Las opciones se meten en el portabolas de madera de la mesa (`assets-src/blender/build_rack.py`): al tocarlo la cámara se acerca, lo que escribes se graba en la placa de latón de delante y con Intro cae como bola en una cazoleta (tocándola se quita). «Ejemplo» lo llena con una lista de muestra.
- Piezas de la máquina modeladas en Blender (`assets-src/blender/build_bingo.py`), con medidas compartidas en `src/scene/bingoLayout.json`.
- La ganadora se anuncia en un cartel de marquesina colgante modelado en Blender (`assets-src/blender/build_sign.py`), que baja del techo con la bola cantada; al tocar la bola de la bandeja se quita del bombo.
- La primera vez que alguien entra se reproduce sola una guía animada, sin que haya que tocar nada: la cámara recorre la mesa mientras un brazo en 3D (traje negro, puño de camisa blanco con gemelo y reloj de oro) escribe opciones en la placa, pulsa el botón verde y el rojo y gira la manivela, con un foco y una tarjeta que explican cada parte. Al terminar, las bolas de ejemplo se recogen tras un fundido. El cartelito «¿Cómo se juega?» de la mesa la repite.
- Sonidos y música de fondo (un trío de jazz lento: piano eléctrico, contrabajo, escobillas y vibráfono) sintetizados con Web Audio, sin archivos; opciones e historial guardados en el navegador.

## Cómo funciona el sorteo

Lo que ves es teatro, pero el resultado es honesto:

1. Al pulsar el botón rojo (o soltar la manivela) se elige la ganadora **antes** de que se mueva nada: un número aleatorio de `crypto.getRandomValues` con muestreo por rechazo, para que todas las bolas tengan exactamente la misma probabilidad ([`src/domain/random.ts`](src/domain/random.ts)).
2. Con la ganadora ya decidida se calcula un plan con los tiempos de la animación: arranque, mezcla, frenada, extracción, rampa y bandeja ([`src/domain/draw.ts`](src/domain/draw.ts)).
3. La escena 3D solo representa ese plan. La física de las bolas es decorativa y no puede cambiar el resultado ([`src/scene/bingo/ballSim.ts`](src/scene/bingo/ballSim.ts)).

La lógica del sorteo tiene tests propios (`npm test`).

## Cómo está hecho

La idea, el diseño y las decisiones son míos. Para escribir el código he usado [Claude Code](https://claude.com/claude-code) como copiloto, y por eso los commits llevan su coautoría. Los modelos 3D están generados con scripts de Blender que hay en `assets-src/blender/`.

## Desarrollo

```bash
npm install
npm run dev        # servidor local
npm test           # pruebas
npm run build      # compilación de producción en dist/
npm run deploy     # compila y publica en Cloudflare (bombo.gontzi.dev)
```

## Despliegue

Cloudflare Workers Builds está conectado a este repo: cada push a `master` lo compila (`npm run build`) y lo publica (`npx wrangler deploy`) en el Worker `bombo`, servido en https://bombo.gontzi.dev. La configuración del Worker vive en `wrangler.jsonc`.

`npm run deploy` sigue sirviendo para publicar a mano desde local.

Para regenerar los modelos GLB, con Blender 5.2:

```bash
blender -b --factory-startup --python-expr "STEP='build'; exec(open('assets-src/blender/build_bingo.py').read())"
```

y después exportar abriendo `assets-src/blender/bombo_assets.blend` con `STEP='export'`.

El cartel de la ganadora y el rótulo de neón «BOMBO» de la pared se construyen igual con `build_sign.py` (`STEP='build'` guarda `bombo_sign.blend`) y se exportan sin interfaz:

```bash
blender -b assets-src/blender/bombo_sign.blend --python-expr "STEP='export'; exec(open('assets-src/blender/build_sign.py').read())"
```

El portabolas, igual con `build_rack.py` (`STEP='build'` guarda `bombo_rack.blend`):

```bash
blender -b assets-src/blender/bombo_rack.blend --python-expr "STEP='export'; exec(open('assets-src/blender/build_rack.py').read())"
```

## Licencia

[MIT](LICENSE)
