import json, os, glob
from PIL import Image, ImageOps

proj_path = 'yolo_projects.json'
projects = {}
try:
    with open(proj_path, 'r', encoding='utf-8') as f:
        projects = json.load(f)
    print("=== Projects ===")
    for name, info in projects.items():
        tc = info.get('trained_count', 0)
        mp = info.get('model_path', 'NONE')
        imgs = info.get('class_images', {})
        total_imgs = sum(len(v) for v in imgs.values())
        total_ann = len(info.get('annotations', {}))
        print(f"  [{name}] trained={tc}, images={total_imgs}, annotations={total_ann}")
        print(f"    model: {mp}")
    print()
except Exception as e:
    print(f"Error: {e}")

# Test each model on its own training images
from ultralytics import YOLO

for model_file in sorted(glob.glob('yolo_model_*.pt')):
    board_name_raw = model_file.replace('yolo_model_', '').replace('.pt', '')
    board_name = board_name_raw.replace('_', ' ')
    print(f"=== Testing model: {model_file} ===")
    try:
        model = YOLO(model_file)
        print(f"  Model classes: {model.names}")

        proj = projects.get(board_name) or projects.get(board_name_raw)
        if not proj:
            print(f"  No project found for '{board_name}' or '{board_name_raw}'")
            continue

        for cls, paths in proj.get('class_images', {}).items():
            print(f"  Class '{cls}' - testing {len(paths)} images:")
            for p in paths:
                full_p = os.path.join(os.getcwd(), p) if not os.path.isabs(p) else p
                if not os.path.exists(full_p):
                    print(f"    {os.path.basename(p)}: FILE NOT FOUND ({full_p})")
                    continue
                img = ImageOps.exif_transpose(Image.open(full_p))
                results = model.predict(img, conf=0.01, verbose=False)
                boxes = results[0].boxes
                if len(boxes) > 0:
                    confs = sorted(boxes.conf.tolist(), reverse=True)
                    print(f"    {os.path.basename(p)}: {len(confs)} boxes, confs={[f'{c:.3f}' for c in confs[:3]]}")
                else:
                    print(f"    {os.path.basename(p)}: NO DETECTIONS (even at conf=0.01!)")
    except Exception as e:
        import traceback
        print(f"  ERROR: {e}")
        traceback.print_exc()
    print()
