# Noite

Organiza actividades, planes y recuerdos en tu computadora. Comparte tu biblioteca mediante archivos `.noche` y revisa los nombres de ambos perfiles antes de importar.

## Funciones

- Biblioteca de juegos, películas, series y actividades.
- Planes, opiniones, fotos y recuerdos.
- Perfiles y protección de acceso en el equipo.
- Respaldos cifrados y transferencia mediante archivos `.noche`.
- Detección y lanzamiento de juegos instalados.
- Búsqueda opcional de portadas con credenciales propias.

## Desarrollo

Windows 11 x64, Node.js, Rust y herramientas de compilación de Visual Studio.

```powershell
npm ci
npm run build
npm run tauri -- dev
```

La vista web utiliza IndexedDB; las funciones del sistema y SQLite necesitan la aplicación para Windows.

## Verificación

```powershell
npm run lint
npm test
npm run build
```

Licencia y términos de uso: [LICENSE.txt](LICENSE.txt).
