# 🌙 Noite

### Menos «¿qué hacemos hoy?», más momentos juntos.

Reúne esas películas pendientes, los juegos que quieren probar y los planes que no quieren olvidar. Noite es un lugar para guardar ideas, elegir la próxima actividad y recordar lo que ya disfrutaron.

**Tu biblioteca vive en tu computadora. Tú decides cuándo compartirla.**

## ✨ Un espacio para sus ideas

- 🎬 **Su lista de pendientes:** juegos, películas, series y actividades en un mismo lugar.
- 🗓️ **Planes con intención:** organiza actividades para la próxima tarde juntos.
- 💬 **Recuerdos que se quedan:** opiniones, fotos y música de sus momentos.
- 💛 **Ideas de ambos:** perfiles y autoría para recordar quién propuso cada actividad.
- 📦 **Una copia cuando la necesitas:** respaldos cifrados y transferencia mediante archivos `.noche`.
- 🎮 **Del plan al juego:** detección y lanzamiento de juegos instalados compatibles.
- 🖼️ **Una biblioteca visual:** búsqueda opcional de portadas con credenciales propias.

## 💻 Empezar en Windows

No necesitas herramientas de programación para usar Noite.

1. Consulta [las versiones disponibles](https://github.com/LuVaAcAn/Noite-Desktop/releases). Si no aparece un instalador, la entrega está en preparación.
2. Descarga el archivo `Noite_<versión>_x64-setup.exe` de la versión elegida.
3. Instálalo en **Windows 11 de 64 bits** y configura sus perfiles.
4. Añade su primera idea. 💡

Puedes organizar y consultar la biblioteca sin Internet. Las búsquedas con proveedores opcionales necesitan conexión.

## 💌 Compartir con tu pareja

1. Guarda un respaldo de lo que ya existe en cada computadora.
2. Exporta un archivo `.noche` desde las opciones de transferencia y elige una contraseña.
3. Envía el archivo a tu pareja y comparte la contraseña por otro canal.
4. Revisen los nombres y la correspondencia de los perfiles antes de importar.
5. Lean la confirmación: **restaurar sustituye la biblioteca de destino; no combina automáticamente cambios de ambos equipos**.

Acuerden quién actualiza la biblioteca antes de enviar la siguiente copia. El botón de ayuda **?** explica el proceso dentro de la aplicación.

> 🔐 Un respaldo puede contener información sensible. Compártelo solo con alguien de confianza; nunca lo publiques en GitHub ni lo adjuntes a una incidencia.

## 🛟 Actualizaciones y ayuda

Antes de actualizar, exporta un respaldo y conserva su contraseña. Revisa las notas de versión y el estado de firma del instalador. No desactives las protecciones de Windows para ejecutar archivos de procedencia dudosa.

¿Algo no funciona? [Cuéntanos qué ocurrió](https://github.com/LuVaAcAn/Noite-Desktop/issues), incluyendo la versión y los pasos para reproducirlo, sin datos personales.

## 🛠️ Para quienes quieran compilar

Esta sección es para desarrollo; no es necesaria para utilizar el instalador.

Windows 11 x64, Node.js, Rust y herramientas de compilación de Visual Studio.

```powershell
npm ci
npm run build
npm run tauri -- dev
```

La vista web utiliza IndexedDB; las funciones del sistema y SQLite necesitan la aplicación para Windows.

## 🧪 Verificación

```powershell
npm run lint
npm test
npm run build
```

Licencia y términos de uso: [LICENSE.txt](LICENSE.txt).
