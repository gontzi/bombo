# Bombo

Sorteos de bingo para cualquier decisión: escribe tus opciones, cada una se convierte en una bola numerada dentro de un bombo 3D y, al pulsar el botón de la mesa, sale una al azar.

**En vivo:** https://bombo.gontzi.dev

- React + TypeScript + Vite, escena 3D con Three.js / React Three Fiber.
- El ganador se elige de forma uniforme (`crypto`, muestreo por rechazo) antes de animar; la escena solo representa ese resultado.
- Física propia de las bolas en la jaula y trayectoria continua de la ganadora por el conducto hasta la bandeja.
- Piezas de la máquina modeladas en Blender (`assets-src/blender/build_bingo.py`), con medidas compartidas en `src/scene/bingoLayout.json`.
- Sonidos sintetizados con Web Audio; opciones e historial guardados en el navegador.

## Desarrollo

```bash
npm install
npm run dev        # servidor local
npm test           # pruebas
npm run build      # compilación de producción en dist/
npm run deploy     # compila y publica en Cloudflare (bombo.gontzi.dev)
```

## Despliegue

Cada push a `master` ejecuta `.github/workflows/deploy.yml`: comprobación de tipos, pruebas, compilación y publicación en Cloudflare. Necesita en el repo:

- Variable `CLOUDFLARE_ACCOUNT_ID` (ya configurada).
- Secreto `CLOUDFLARE_API_TOKEN`: token de Cloudflare creado con la plantilla «Edit Cloudflare Workers». Sin él, el workflow prueba y compila pero no publica.

Para regenerar los modelos GLB, con Blender 5.2:

```bash
blender -b --factory-startup --python-expr "STEP='build'; exec(open('assets-src/blender/build_bingo.py').read())"
```

y después exportar abriendo `assets-src/blender/bombo_assets.blend` con `STEP='export'`.
