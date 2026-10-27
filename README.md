# Bombo

Sorteos de bingo para cualquier decisión: escribe tus opciones, cada una se convierte en una bola numerada dentro de un bombo 3D y, al pulsar el botón de la mesa, sale una al azar.

**En vivo:** https://bombo.gontzi.dev

- React + TypeScript + Vite, escena 3D con Three.js / React Three Fiber.
- El ganador se elige de forma uniforme (`crypto`, muestreo por rechazo) antes de animar; la escena solo representa ese resultado.
- Física propia de las bolas en la jaula y trayectoria continua de la ganadora por el conducto hasta la bandeja.
- Piezas de la máquina modeladas en Blender (`assets-src/blender/build_bingo.py`), con medidas compartidas en `src/scene/bingoLayout.json`.
- La ganadora se anuncia en un cartel de marquesina colgante modelado en Blender (`assets-src/blender/build_sign.py`), que baja del techo con la bola cantada; al tocar la bola de la bandeja se quita del bombo.
- Sonidos y música de fondo (un trío de jazz lento: piano eléctrico, contrabajo, escobillas y vibráfono) sintetizados con Web Audio, sin archivos; opciones e historial guardados en el navegador.

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

El cartel se construye igual con `build_sign.py` (`STEP='build'` guarda `bombo_sign.blend`) y se exporta sin interfaz:

```bash
blender -b assets-src/blender/bombo_sign.blend --python-expr "STEP='export'; exec(open('assets-src/blender/build_sign.py').read())"
```
