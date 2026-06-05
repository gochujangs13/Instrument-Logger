import tkinter as tk
root = tk.Tk()
root.title("Test")
root.geometry("200x100")
label = tk.Label(root, text="Hello World")
label.pack()
root.after(2000, root.destroy)
root.mainloop()
print("Finished")
