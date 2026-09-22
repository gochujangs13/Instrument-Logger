import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import tempfile
import subprocess
import updater_backend

def test_ps1_syntax():
    content = updater_backend.get_standalone_updater_ps1_content()
    assert len(content) > 1000, "Content too short"
    assert "System.Windows.Markup.XamlReader" in content
    assert "3M Instrument Logger 자동 업데이트" in content

    # Test PowerShell parsing
    ps_cmd = [
        'powershell.exe',
        '-NoProfile',
        '-Command',
        """
        $code = [System.IO.File]::ReadAllText('scripts/updater_gui.ps1', [System.Text.Encoding]::UTF8)
        $errors = $null
        [System.Management.Automation.PSParser]::Tokenize($code, [ref]$errors) | Out-Null
        if ($errors.Count -gt 0) {
            $errors | ForEach-Object { Write-Error $_.Message }
            exit 1
        }
        Write-Host "PowerShell Syntax Valid!"
        """
    ]
    res = subprocess.run(ps_cmd, capture_output=True, text=True)
    print("PS Parser output:", res.stdout.strip())
    assert res.returncode == 0, f"PowerShell syntax errors: {res.stderr}"

def test_config_and_token():
    cfg = updater_backend.load_config()
    assert 'repo' in cfg
    print(f"Config loaded: repo={cfg['repo']}, has_token={bool(cfg.get('token'))}")

if __name__ == '__main__':
    test_ps1_syntax()
    test_config_and_token()
    print("ALL TESTS PASSED!")
