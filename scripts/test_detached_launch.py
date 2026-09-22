import subprocess
import sys
import os
import time

test_ps1 = os.path.abspath('scripts/test_complete_updater_gui.ps1')
target_exe = os.path.abspath('build_tmp/test_target.exe')

cmd = [
    'powershell.exe',
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    test_ps1,
    '-TargetExe', target_exe,
    '-Version', '1.0.0-rc.6.1'
]

DETACHED = 0x00000008 | 0x00000200
p = subprocess.Popen(cmd, creationflags=DETACHED, close_fds=True)
print(f"Spawned detached process PID: {p.pid}")
