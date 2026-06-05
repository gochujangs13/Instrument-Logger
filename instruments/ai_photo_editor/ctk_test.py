import customtkinter as ctk
app = ctk.CTk()
app.geometry("400x240")
app.title("CTk Test")
button = ctk.CTkButton(app, text="Close", command=app.destroy)
button.pack(padx=20, pady=20)
app.mainloop()
print("Finished CTk")
