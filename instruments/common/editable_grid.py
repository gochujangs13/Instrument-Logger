import customtkinter as ctk
from tkinter import Canvas, END
from constants import *
from constants import _c

class EditableGrid(ctk.CTkFrame):
    def __init__(self, master, app, panel, panel_id, **kwargs):
        super().__init__(master, **kwargs)
        self.app = app
        self.panel = panel
        self.panel_id = panel_id

        self.entries = []
        self.columns = []
        self.current_focus = (0, 0)
        self.mode_name = ""
        self.cell_width = int(100 * self.app.scale)
        self.group_size = 0
        self.set_size = 0

        self.canvas = Canvas(self, bg=_c(PANEL_COLOR), highlightthickness=0, bd=0)
        self.v_scrollbar = ctk.CTkScrollbar(self, orientation="vertical", command=self.canvas.yview)
        self.h_scrollbar = ctk.CTkScrollbar(self, orientation="horizontal", command=self.canvas.xview)

        self.canvas.configure(yscrollcommand=self.v_scrollbar.set, xscrollcommand=self.h_scrollbar.set)
        self.canvas.grid(row=0, column=0, sticky="nsew")
        self.v_scrollbar.grid(row=0, column=1, sticky="ns")
        self.h_scrollbar.grid(row=1, column=0, sticky="ew")
        self.grid_rowconfigure(0, weight=1)
        self.grid_columnconfigure(0, weight=1)

        self.scrollable_frame = ctk.CTkFrame(self.canvas, fg_color=PANEL_COLOR)
        self.canvas_window = self.canvas.create_window((0, 0), window=self.scrollable_frame, anchor="nw")

        self.scrollable_frame.bind("<Configure>", lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all")))
        self.canvas.bind("<Configure>", lambda e: self.canvas.itemconfig(self.canvas_window, width=e.width))
        self.canvas.bind("<MouseWheel>", self._on_mousewheel)
        self.scrollable_frame.bind("<MouseWheel>", self._on_mousewheel)

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

    def rebuild(self, mode_name, data_matrix, columns, group_size=0, set_size=0):
        self.mode_name = mode_name
        self.columns = columns
        self.group_size = group_size
        self.set_size = set_size
        self.cell_width = int(55 * self.app.scale) if len(self.columns) >= 6 else int(100 * self.app.scale)

        for w in self.scrollable_frame.winfo_children(): w.destroy()
        self.entries = []; self.current_focus = (0, 0)

        ctk.CTkLabel(self.scrollable_frame, text="No.", font=("Inter", self.app.sf(13), "bold"), width=int(50 * self.app.scale)).grid(row=0, column=0, padx=2, pady=5)
        for c, col_name in enumerate(self.columns):
            lbl = ctk.CTkLabel(self.scrollable_frame, text=col_name, font=("Inter", self.app.sf(12), "bold"), fg_color=GRID_HDR_BG, width=self.cell_width)
            lbl.grid(row=0, column=c + 1, padx=(2, self._col_pad(c)), pady=5, sticky="nsew")

        if data_matrix:
            for row_data in data_matrix: self._add_row(row_data)
        else: self._add_row()

    def _col_pad(self, c):
        if self.group_size > 0 and c % self.group_size == self.group_size - 1 and c != len(self.columns) - 1:
            return int(20 * self.app.scale)
        return 2

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

    def _add_row(self, initial_data=None):
        r = len(self.entries)
        row_label = f"{(r//self.set_size+1)}-{(r%self.set_size+1)}" if self.set_size > 0 else str(r + 1)
        ctk.CTkLabel(self.scrollable_frame, text=row_label, font=("Inter", self.app.sf(12), "bold"), width=int(50 * self.app.scale)).grid(row=r + 1, column=0, padx=2, pady=2)
        
        row_entries = []
        for c in range(len(self.columns)):
            entry = ctk.CTkEntry(self.scrollable_frame, width=self.cell_width, justify="center", font=("Consolas", self.app.sf(13)))
            entry.grid(row=r + 1, column=c + 1, padx=(2, self._col_pad(c)), pady=2)
            if initial_data and c < len(initial_data): entry.insert(0, initial_data[c])
            entry.bind("<FocusIn>", lambda e, rr=r, cc=c: self._on_focus_in(e, rr, cc))
            entry.bind("<KeyRelease>", lambda e, rr=r, cc=c: self.panel.on_row_updated(rr, self.panel_id))
            
            # 방향키 및 엔터 바인딩 추가
            entry.bind("<Up>",    lambda e, rr=r, cc=c: self._move_focus(rr - 1, cc))
            entry.bind("<Down>",  lambda e, rr=r, cc=c: self._move_focus(rr + 1, cc))
            entry.bind("<Left>",  lambda e, rr=r, cc=c: self._move_focus(rr, cc - 1))
            entry.bind("<Right>", lambda e, rr=r, cc=c: self._move_focus(rr, cc + 1))
            entry.bind("<Return>", lambda e: self.panel.on_enter_pressed())
            
            row_entries.append(entry)
        self.entries.append(row_entries)
        self.scroll_to_row(r)

    def _on_focus_in(self, event, r, c):
        self.current_focus = (r, c)
        self.panel._on_cell_focus(r, c, self.panel_id - 1)
        self.panel.on_row_updated(r, self.panel_id)
        self.scroll_to_row(r)

    def set_cell_value(self, r, c, val):
        if r < len(self.entries) and c < len(self.columns):
            ent = self.entries[r][c]
            ent.delete(0, END)
            ent.insert(0, val)
            self.panel.on_row_updated(r, self.panel_id)

    def move_focus_next(self, r, c):
        self._move_focus(r, c + 1)

    def _move_focus(self, r, c):
        if r < 0: return
        max_c = len(self.columns) - 1
        if c > max_c:
            c = 0
            r += 1
        elif c < 0:
            if r > 0:
                c = max_c
                r -= 1
            else:
                return

        if r >= len(self.entries):
            self._add_row()
        
        target = self.entries[r][c]
        target.focus_set()
        if hasattr(target, "icursor"):
            target.icursor(END)
        self.scroll_to_row(r)

    def get_data_matrix(self):
        return [[e.get() for e in row] for row in self.entries if any(e.get().strip() for e in row)]
