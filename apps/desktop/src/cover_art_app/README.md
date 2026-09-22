# Buscador de Carátulas

App de escritorio en Python (Tkinter) para buscar **películas, series de TV
y videojuegos** por nombre, ver varias opciones con su carátula en miniatura,
y elegir una para ver la carátula grande + descripción, con opción de
descargarla.

## Sobre la fuente de datos

IMDb no ofrece una API pública/gratuita para buscar títulos y descargar
carátulas. Esta app usa en su lugar dos fuentes gratuitas y muy usadas
(las mismas que alimentan a muchas apps "estilo IMDb"):

- **[TMDb](https://www.themoviedb.org/)** — películas y series de TV.
- **[IGDB](https://www.igdb.com/)** — videojuegos (gestionado por Twitch).

Ambas requieren una cuenta gratuita y una API key propia. La app te pide
que las configures la primera vez desde el menú **Ajustes → API Keys**, y
las guarda localmente en `~/.imdb_cover_app/config.json` (no se comparten
ni se suben a ningún lado).

### Cómo conseguir las keys (gratis, ~5 min)

**TMDb:**
1. Crea una cuenta en https://www.themoviedb.org/signup
2. Ve a tu perfil → Settings → API
3. Solicita una "API Key" (tipo Developer), completa el formulario corto
4. Copia la "API Key (v3 auth)"

**IGDB (usa autenticación de Twitch):**
1. Crea/usa una cuenta en https://dev.twitch.tv/console/apps
2. Click en "Register Your Application"
3. Pon cualquier nombre, OAuth Redirect URL: `http://localhost`, categoría: "Application Integration"
4. Copia el **Client ID** y genera un **Client Secret**

## Instalación

```bash
pip install -r requirements.txt
```

(Tkinter viene incluido con Python en Windows/Mac. En Linux puede que
necesites instalarlo aparte, ej. `sudo apt install python3-tk`.)

## Uso

```bash
python main.py
```

1. Abre **Ajustes → API Keys** y pega tus credenciales (una sola vez).
2. Escribe un nombre en el buscador (ej. "The Last of Us", "Zelda").
3. Elige el tipo si quieres filtrar: Todo / Películas / Series-TV / Videojuegos.
4. Haz clic en un resultado para ver la carátula grande y la descripción.
5. Usa "Descargar carátula" para guardarla como imagen.

## Estructura del proyecto

```
cover_art_app/
├── main.py           # Interfaz Tkinter (ventana principal, ajustes, previsualización)
├── api_clients.py     # Llamadas a TMDb e IGDB
├── image_utils.py     # Descarga/conversión de imágenes para Tkinter
├── config.py           # Guardado/carga de API keys locales
├── requirements.txt
└── README.md
```

## Notas

- Las búsquedas de red corren en hilos aparte para que la ventana no se
  congele mientras cargan las carátulas.
- Si una búsqueda falla (key inválida, sin conexión, etc.) el error se
  muestra en la barra de estado inferior, sin cerrar la app.
