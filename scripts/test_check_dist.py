import os
import re

dist = r'dist/Hioki3540_Keithley2700_Keithley2400_MitutoyoVL50_Agilent4339B_DAQ6510_SP2100_PT2000_LT1000_AIPhotoEditor_PST3202_EpsonOK900P_EtchingDesign'
missing = []

for root, dirs, files in os.walk(dist):
    for f in files:
        if f.endswith('.js'):
            full = os.path.join(root, f)
            src = open(full, encoding='utf-8', errors='ignore').read()
            for m in re.finditer(r"""(?:from|import)\s+['"]([^'"]+)['"]""", src):
                dep = m.group(1)
                if dep.startswith('.'):
                    target = os.path.normpath(os.path.join(root, dep))
                    if not os.path.exists(target):
                        missing.append((os.path.relpath(full, dist), dep, os.path.relpath(target, dist)))

print('Missing dependencies in dist:', missing)
