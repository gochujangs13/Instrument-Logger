import tkinter as tk
from tkinter import ttk

class EditableGrid(tk.Frame):
    def __init__(self, master, columns, app=None, **kwargs):
        super().__init__(master, **kwargs)
        self.columns = columns
        self.app = app
        self.entries = []
        self.c_bg = app.c_card if app else "#1e293b"
        self.c_input = app.c_input if app else "#334155"
        self.c_text = app.c_text if app else "#f8fafc"
        self.c_border = app.c_border if app else "#475569"
        self.c_header = app.c_bg if app else "#0f172a"
        
        self.configure(bg=self.c_bg)

        self.canvas = tk.Canvas(self, bg=self.c_bg, highlightthickness=0, bd=0)
        self.v_scrollbar = ttk.Scrollbar(self, orient="vertical", command=self.canvas.yview)
        self.h_scrollbar = ttk.Scrollbar(self, orient="horizontal", command=self.canvas.xview)

        self.canvas.configure(yscrollcommand=self.v_scrollbar.set, xscrollcommand=self.h_scrollbar.set)
        
        self.canvas.grid(row=0, column=0, sticky="nsew")
        self.v_scrollbar.grid(row=0, column=1, sticky="ns")
        self.h_scrollbar.grid(row=1, column=0, sticky="ew")
        
        self.grid_rowconfigure(0, weight=1)
        self.grid_columnconfigure(0, weight=1)

        self.scrollable_frame = tk.Frame(self.canvas, bg=self.c_bg)
        self.canvas_window = self.canvas.create_window((0, 0), window=self.scrollable_frame, anchor="nw")

        self.scrollable_frame.bind("<Configure>", self._on_frame_configure)
        self.canvas.bind("<Configure>", self._on_canvas_configure)
        
        self.canvas.bind("<MouseWheel>", self._on_mousewheel)
        self.scrollable_frame.bind("<MouseWheel>", self._on_mousewheel)

        self.rebuild()

    def _on_frame_configure(self, event):
        self.canvas.configure(scrollregion=self.canvas.bbox("all"))
        req_w = self.scrollable_frame.winfo_reqwidth()
        if req_w > self.canvas.winfo_width():
            self.canvas.itemconfig(self.canvas_window, width=req_w)

    def _on_canvas_configure(self, event):
        req_w = self.scrollable_frame.winfo_reqwidth()
        self.canvas.itemconfig(self.canvas_window, width=max(event.width, req_w))

    def _on_mousewheel(self, event):
        try:
            if self.winfo_exists():
                self.canvas.update_idletasks()
                if self.scrollable_frame.winfo_height() <= self.canvas.winfo_height():
                    self.canvas.yview_moveto(0.0)
                    return
                self.canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")
        except Exception:
            pass

    def rebuild(self):
        for w in self.scrollable_frame.winfo_children(): w.destroy()
        self.entries = []

        # Header
        for c, col_name in enumerate(self.columns):
            w = 14 if col_name == "Sample" else (4 if col_name == "chk" else 8)
            disp_name = "✔" if col_name == "chk" else col_name # Use a checkmark symbol or empty string
            if col_name == "chk": disp_name = ""
            hdr_bg = "#2563eb" if col_name == "Avg" else self.c_header
            hdr_fg = "#ffffff" if col_name == "Avg" else self.c_text
            if col_name == "Avg": disp_name = "★ Avg"
            lbl = tk.Label(self.scrollable_frame, text=disp_name, font=("Malgun Gothic", 9, "bold"), bg=hdr_bg, fg=hdr_fg, width=w, borderwidth=1, relief="solid")
            lbl.grid(row=0, column=c, padx=1, pady=1, sticky="nsew")
            lbl.bind("<MouseWheel>", self._on_mousewheel)

    def scroll_to_row(self, r):
        if not self.entries or r < 0 or r >= len(self.entries):
            return
        try:
            self.canvas.update_idletasks()
            widget = self.entries[r][0]
            y = widget.winfo_y()
            h = widget.winfo_height()
            canvas_h = self.canvas.winfo_height()
            frame_h = self.scrollable_frame.winfo_height()
            if frame_h > canvas_h:
                current_yview = self.canvas.yview()
                top_y = y / frame_h
                bottom_y = (y + h) / frame_h
                if top_y < current_yview[0]:
                    self.canvas.yview_moveto(top_y)
                elif bottom_y > current_yview[1]:
                    self.canvas.yview_moveto(bottom_y - (canvas_h / frame_h))
        except Exception:
            pass

    def insert_row(self, initial_data):
        r = len(self.entries)
        row_entries = []
        for c in range(len(self.columns)):
            w = 14 if self.columns[c] == "Sample" else (4 if self.columns[c] == "chk" else 8)
            
            if self.columns[c] == "chk":
                entry = tk.Entry(self.scrollable_frame, width=w, justify="center", font=("Malgun Gothic", 9), bg=self.c_input, fg=self.c_text, relief="flat", insertbackground=self.c_text, cursor="hand2")
                entry.insert(0, initial_data[c] if c < len(initial_data) else "☐")
                entry.bind("<Button-1>", lambda e, ent=entry: self._toggle_chk(ent))
                entry.bind("<Key>", lambda e: "break") # prevent typing
            else:
                entry = tk.Entry(self.scrollable_frame, width=w, justify="center", font=("Malgun Gothic", 9), bg=self.c_input, fg=self.c_text, relief="flat", insertbackground=self.c_text)
                if initial_data and c < len(initial_data):
                    entry.insert(0, initial_data[c])
                
                if self.columns[c] not in ["Sample", "Load", "Speed", "Delay", "Eval"]:
                    entry.configure(state="readonly", readonlybackground=self.c_bg)

            entry.grid(row=r + 1, column=c, padx=1, pady=1)
            entry.bind("<MouseWheel>", self._on_mousewheel)
            
            entry.bind("<Up>",    lambda e, rr=r, cc=c: self._move_focus(rr - 1, cc))
            entry.bind("<Down>",  lambda e, rr=r, cc=c: self._move_focus(rr + 1, cc))
            entry.bind("<Left>",  lambda e, rr=r, cc=c: self._move_focus(rr, cc - 1))
            entry.bind("<Right>", lambda e, rr=r, cc=c: self._move_focus(rr, cc + 1))
            
            if self.app and self.columns[c] in ["Sample", "Load", "Speed", "Delay", "Eval"]:
                entry.bind("<KeyRelease>", lambda e, rr=r: self._on_edit(rr))

            row_entries.append(entry)
        self.entries.append(row_entries)
        
        self.scroll_to_row(r)

    def update_row(self, r, data):
        if r < len(self.entries):
            for c, val in enumerate(data):
                if c < len(self.columns):
                    ent = self.entries[r][c]
                    if ent.cget("state") == "readonly":
                        ent.configure(state="normal")
                        ent.delete(0, tk.END)
                        ent.insert(0, val)
                        ent.configure(state="readonly")
                    else:
                        ent.delete(0, tk.END)
                        ent.insert(0, val)

    def _toggle_chk(self, entry):
        current = entry.get()
        entry.delete(0, tk.END)
        entry.insert(0, "☑" if current == "☐" else "☐")
        return "break"

    def _on_edit(self, r):
        if hasattr(self.app, 'results') and r < len(self.app.results):
            # Sync edited values back to self.app.results
            for c in range(len(self.columns)):
                col_name = self.columns[c]
                val = self.entries[r][c].get()
                if col_name == "Sample": self.app.results[r]["sample"] = val
                elif col_name == "Load": self.app.results[r]["load"] = val
                elif col_name == "Speed": self.app.results[r]["speed"] = val
                elif col_name == "Delay": self.app.results[r]["delay"] = val
                elif col_name == "Eval": self.app.results[r]["eval"] = val

    def _move_focus(self, r, c):
        if 0 <= r < len(self.entries) and 0 <= c < len(self.columns):
            target = self.entries[r][c]
            if target.cget("state") != "readonly":
                target.focus_set()
                target.icursor(tk.END)
            self.scroll_to_row(r)
                
    def get_checked_indices(self):
        indices = []
        for i, row in enumerate(self.entries):
            if row[0].get() == "☑":
                indices.append(i)
        return indices
        
    def delete_rows(self, indices):
        for idx in sorted(indices, reverse=True):
            for widget in self.entries[idx]:
                widget.destroy()
            del self.entries[idx]
            
        for r, row in enumerate(self.entries):
            for c, widget in enumerate(row):
                widget.grid(row=r+1, column=c)
