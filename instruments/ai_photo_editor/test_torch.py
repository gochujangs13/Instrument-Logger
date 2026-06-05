import os
import sys

# Try to manually add DLL directory to solve WinError 1114
dll_path = r"C:\Users\Oven 3\AppData\Local\Python\pythoncore-3.14-64\Lib\site-packages\torch\lib"
if os.path.exists(dll_path):
    print(f"Adding DLL directory: {dll_path}")
    try:
        os.add_dll_directory(dll_path)
    except AttributeError:
        pass
    os.environ["PATH"] = dll_path + os.pathsep + os.environ["PATH"]

try:
    print("Testing torch import with DLL path fix...")
    import torch
    print(f"Torch version: {torch.__version__}")
    print("Testing ultralytics import...")
    from ultralytics import YOLO
    print("All imports successful.")
except Exception as e:
    import traceback
    traceback.print_exc()
