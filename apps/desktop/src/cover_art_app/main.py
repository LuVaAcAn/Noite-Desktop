"""Cover Art Finder — search movies, TV series, and video games and
preview/download their cover art.

Run with:  python main.py
"""
import queue
import threading
import tkinter as tk
from tkinter import ttk, filedialog

import api_clients
import image_utils
from config import load_config, save_config

THUMB_SIZE = (140, 200)
PREVIEW_SIZE = (320, 460)
GRID_COLUMNS = 3

MEDIA_OPTIONS = {
    "Todo": None,
    "Películas": "movie",
    "Series/TV": "tv",
    "Videojuegos": "game",
}


class SettingsDialog(tk.Toplevel):
    def __init__(self, parent, cfg, on_save):
        super().__init__(parent)
        self.title("Ajustes de API")
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()
        self.on_save = on_save

        pad = {"padx": 10, "pady": 6}

        tk.Label(self, text="TMDb API Key:").grid(row=0, column=0, sticky="e", **pad)
        self.tmdb_var = tk.StringVar(value=cfg.get("tmdb_api_key", ""))
        tk.Entry(self, textvariable=self.tmdb_var, width=42).grid(row=0, column=1, **pad)

        tk.Label(self, text="IGDB Client ID:").grid(row=1, column=0, sticky="e", **pad)
        self.igdb_id_var = tk.StringVar(value=cfg.get("igdb_client_id", ""))
        tk.Entry(self, textvariable=self.igdb_id_var, width=42).grid(row=1, column=1, **pad)

        tk.Label(self, text="IGDB Client Secret:").grid(row=2, column=0, sticky="e", **pad)
        self.igdb_secret_var = tk.StringVar(value=cfg.get("igdb_client_secret", ""))
        tk.Entry(self, textvariable=self.igdb_secret_var, width=42).grid(row=2, column=1, **pad)

        info = (
            "TMDb (películas/series): cuenta gratis en themoviedb.org\n"
            "  → Ajustes de cuenta → API → solicitar API key.\n"
            "IGDB (videojuegos): cuenta gratis en dev.twitch.tv/console/apps\n"
            "  → crear app → copiar Client ID y generar un Client Secret."
        )
        tk.Label(self, text=info, fg="gray30", justify="left", anchor="w").grid(
            row=3, column=0, columnspan=2, sticky="w", padx=10, pady=(4, 10)
        )

        btn_frame = tk.Frame(self)
        btn_frame.grid(row=4, column=0, columnspan=2, pady=(0, 10))
        tk.Button(btn_frame, text="Guardar", width=10, command=self._save).pack(side="left", padx=5)
        tk.Button(btn_frame, text="Cancelar", width=10, command=self.destroy).pack(side="left", padx=5)

    def _save(self):
        new_cfg = {
            "tmdb_api_key": self.tmdb_var.get().strip(),
            "igdb_client_id": self.igdb_id_var.get().strip(),
            "igdb_client_secret": self.igdb_secret_var.get().strip(),
        }
        save_config(new_cfg)
        self.on_save(new_cfg)
        self.destroy()


class CoverArtApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Buscador de Carátulas — Películas, Series y Videojuegos")
        self.geometry("1020x660")
        self.minsize(820, 560)

        self.cfg = load_config()
        self.thumb_images = {}          # keep PhotoImage refs alive, keyed by id(item)
        self.selected_item = None
        self._last_preview_bytes = None
        self.result_queue = queue.Queue()

        self._build_menu()
        self._build_layout()
        self._poll_queue()

        if not any(self.cfg.values()):
            self.status_var.set(
                "Configura tus API keys en Ajustes antes de buscar (TMDb / IGDB)."
            )

    # ---------------- UI construction ----------------
    def _build_menu(self):
        menubar = tk.Menu(self)
        settings_menu = tk.Menu(menubar, tearoff=0)
        settings_menu.add_command(label="API Keys...", command=self._open_settings)
        menubar.add_cascade(label="Ajustes", menu=settings_menu)
        self.config(menu=menubar)

    def _build_layout(self):
        top = tk.Frame(self, pady=10, padx=10)
        top.pack(side="top", fill="x")

        tk.Label(top, text="Buscar:").pack(side="left")
        self.query_var = tk.StringVar()
        entry = tk.Entry(top, textvariable=self.query_var, width=42)
        entry.pack(side="left", padx=5)
        entry.bind("<Return>", lambda e: self._on_search())
        entry.focus_set()

        self.media_var = tk.StringVar(value="Todo")
        combo = ttk.Combobox(
            top, textvariable=self.media_var, values=list(MEDIA_OPTIONS.keys()),
            state="readonly", width=12
        )
        combo.pack(side="left", padx=5)

        self.search_btn = tk.Button(top, text="Buscar", command=self._on_search)
        self.search_btn.pack(side="left", padx=5)

        self.status_var = tk.StringVar(value="Listo.")
        tk.Label(self, textvariable=self.status_var, anchor="w", fg="gray30").pack(
            side="bottom", fill="x", padx=10, pady=4
        )

        body = tk.Frame(self)
        body.pack(side="top", fill="both", expand=True, padx=10, pady=5)

        self._build_results_panel(body)
        self._build_preview_panel(body)

    def _build_results_panel(self, parent):
        container = tk.Frame(parent)
        container.pack(side="left", fill="both", expand=True)

        self.canvas = tk.Canvas(container, borderwidth=0, highlightthickness=0)
        vscroll = ttk.Scrollbar(container, orient="vertical", command=self.canvas.yview)
        self.results_frame = tk.Frame(self.canvas)

        self.results_frame.bind(
            "<Configure>", lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all"))
        )
        self.canvas_window = self.canvas.create_window((0, 0), window=self.results_frame, anchor="nw")
        self.canvas.bind(
            "<Configure>", lambda e: self.canvas.itemconfig(self.canvas_window, width=e.width)
        )
        self.canvas.configure(yscrollcommand=vscroll.set)
        self.canvas.pack(side="left", fill="both", expand=True)
        vscroll.pack(side="right", fill="y")

        # Mouse wheel scrolling (Windows/Mac + Linux)
        self.canvas.bind_all("<MouseWheel>", lambda e: self.canvas.yview_scroll(int(-1 * (e.delta / 120)), "units"))
        self.canvas.bind_all("<Button-4>", lambda e: self.canvas.yview_scroll(-1, "units"))
        self.canvas.bind_all("<Button-5>", lambda e: self.canvas.yview_scroll(1, "units"))

    def _build_preview_panel(self, parent):
        preview = tk.Frame(parent, width=360, padx=15)
        preview.pack(side="right", fill="y")
        preview.pack_propagate(False)

        preview_box = tk.Frame(preview, width=PREVIEW_SIZE[0], height=PREVIEW_SIZE[1], bg="gray90")
        preview_box.pack_propagate(False)
        preview_box.pack(pady=(0, 10))
        self.preview_label = tk.Label(preview_box, bg="gray90")
        self.preview_label.pack(fill="both", expand=True)

        self.preview_title = tk.Label(
            preview, text="", font=("TkDefaultFont", 13, "bold"), wraplength=330, justify="left"
        )
        self.preview_title.pack(anchor="w")

        self.preview_meta = tk.Label(preview, text="", fg="gray30", wraplength=330, justify="left")
        self.preview_meta.pack(anchor="w", pady=(2, 8))

        self.preview_overview = tk.Text(
            preview, wrap="word", height=12, width=40, bd=0, bg=self.cget("bg"), state="disabled"
        )
        self.preview_overview.pack(fill="both", expand=True)

        self.download_btn = tk.Button(
            preview, text="Descargar carátula", command=self._on_download, state="disabled"
        )
        self.download_btn.pack(pady=10, fill="x")

    def _open_settings(self):
        SettingsDialog(self, self.cfg, self._on_settings_saved)

    def _on_settings_saved(self, new_cfg):
        self.cfg = new_cfg
        self.status_var.set("Ajustes guardados.")

    # ---------------- Search ----------------
    def _on_search(self):
        query = self.query_var.get().strip()
        if not query:
            return
        media_choice = MEDIA_OPTIONS[self.media_var.get()]

        for widget in self.results_frame.winfo_children():
            widget.destroy()
        self.thumb_images.clear()
        self._clear_preview()

        self.search_btn.config(state="disabled")
        self.status_var.set(f"Buscando '{query}'...")

        thread = threading.Thread(target=self._search_worker, args=(query, media_choice), daemon=True)
        thread.start()

    def _search_worker(self, query, media_choice):
        results = []
        errors = []

        try:
            if media_choice in (None, "movie"):
                results += api_clients.tmdb_search(query, self.cfg.get("tmdb_api_key"), "movie")
            if media_choice in (None, "tv"):
                results += api_clients.tmdb_search(query, self.cfg.get("tmdb_api_key"), "tv")
        except api_clients.ApiError as e:
            errors.append(str(e))
        except Exception as e:
            errors.append(f"Error TMDb: {e}")

        try:
            if media_choice in (None, "game"):
                results += api_clients.igdb_search(
                    query, self.cfg.get("igdb_client_id"), self.cfg.get("igdb_client_secret")
                )
        except api_clients.ApiError as e:
            errors.append(str(e))
        except Exception as e:
            errors.append(f"Error IGDB: {e}")

        self.result_queue.put(("search_done", results, errors))

    def _poll_queue(self):
        try:
            while True:
                msg = self.result_queue.get_nowait()
                if msg[0] == "search_done":
                    self._handle_search_done(msg[1], msg[2])
                elif msg[0] == "preview_ready":
                    self._handle_preview_ready(msg[1], msg[2])
                elif msg[0] == "preview_error":
                    self.status_var.set(msg[1])
        except queue.Empty:
            pass
        self.after(100, self._poll_queue)

    def _handle_search_done(self, results, errors):
        self.search_btn.config(state="normal")

        if errors:
            self.status_var.set(" | ".join(errors))
        elif not results:
            self.status_var.set("Sin resultados.")
        else:
            self.status_var.set(f"{len(results)} resultado(s) encontrados.")

        self._populate_results(results)

    def _populate_results(self, results):
        for idx, item in enumerate(results):
            row, col = divmod(idx, GRID_COLUMNS)
            card = tk.Frame(self.results_frame, padx=8, pady=8)
            card.grid(row=row, column=col, sticky="n")

            thumb_box = tk.Frame(card, width=THUMB_SIZE[0], height=THUMB_SIZE[1], bg="gray85")
            thumb_box.pack_propagate(False)
            thumb_box.pack()
            thumb_lbl = tk.Label(thumb_box, bg="gray85", cursor="hand2", fg="gray40",
                                  text="(sin\nimagen)")
            thumb_lbl.pack(fill="both", expand=True)
            thumb_lbl.bind("<Button-1>", lambda e, it=item: self._on_select(it))

            title_lbl = tk.Label(
                card, text=f"{item['title']} ({item['year']})", wraplength=150,
                justify="center", cursor="hand2"
            )
            title_lbl.pack()
            title_lbl.bind("<Button-1>", lambda e, it=item: self._on_select(it))

            tk.Label(card, text=item["media_type"], fg="gray40", font=("TkDefaultFont", 8)).pack()

            if item.get("thumb_url"):
                threading.Thread(target=self._load_thumb, args=(item, thumb_lbl), daemon=True).start()

    def _load_thumb(self, item, label_widget):
        try:
            data = image_utils.fetch_image_bytes(item["thumb_url"])
            photo = image_utils.bytes_to_photoimage(data, max_size=THUMB_SIZE)
            self.thumb_images[id(item)] = photo  # keep a reference so it isn't garbage-collected
            self.after(0, lambda: label_widget.config(image=photo, text=""))
        except Exception:
            pass  # leave the placeholder in place

    # ---------------- Preview ----------------
    def _on_select(self, item):
        self.selected_item = item
        self.preview_title.config(text=item["title"])
        self.preview_meta.config(text=f"{item['media_type']} · {item['year']}")
        self._set_overview(item.get("overview", ""))
        self.download_btn.config(state="disabled")
        self._last_preview_bytes = None

        if not item.get("full_url"):
            self.preview_label.config(image="", text="Sin imagen disponible", bg="gray90")
            return

        self.preview_label.config(image="", text="Cargando...", bg="gray90")
        self.status_var.set("Cargando carátula...")
        threading.Thread(target=self._load_preview, args=(item,), daemon=True).start()

    def _load_preview(self, item):
        try:
            data = image_utils.fetch_image_bytes(item["full_url"])
            self.result_queue.put(("preview_ready", item, data))
        except Exception as e:
            self.result_queue.put(("preview_error", f"No se pudo cargar la imagen: {e}"))

    def _handle_preview_ready(self, item, data):
        if item is not self.selected_item:
            return  # the user picked something else while this was loading
        photo = image_utils.bytes_to_photoimage(data, max_size=PREVIEW_SIZE)
        self.preview_image = photo  # keep reference alive
        self.preview_label.config(image=photo, text="")
        self._last_preview_bytes = data
        self.download_btn.config(state="normal")
        self.status_var.set("Listo.")

    def _clear_preview(self):
        self.selected_item = None
        self._last_preview_bytes = None
        self.preview_label.config(image="", text="", bg="gray90")
        self.preview_title.config(text="")
        self.preview_meta.config(text="")
        self._set_overview("")
        self.download_btn.config(state="disabled")

    def _set_overview(self, text):
        self.preview_overview.config(state="normal")
        self.preview_overview.delete("1.0", "end")
        self.preview_overview.insert("1.0", text)
        self.preview_overview.config(state="disabled")

    def _on_download(self):
        if not self.selected_item or not self._last_preview_bytes:
            return
        default_name = self.selected_item["title"].replace(" ", "_") + ".jpg"
        path = filedialog.asksaveasfilename(
            defaultextension=".jpg",
            initialfile=default_name,
            filetypes=[("JPEG", "*.jpg"), ("Todos los archivos", "*.*")],
        )
        if path:
            image_utils.save_bytes_to_file(self._last_preview_bytes, path)
            self.status_var.set(f"Guardado en {path}")


if __name__ == "__main__":
    app = CoverArtApp()
    app.mainloop()
