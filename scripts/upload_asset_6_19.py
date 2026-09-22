# -*- coding: utf-8 -*-
"""
Upload 6.19 staged EXE to GitHub Release 391517006 (v1.0.0-rc.6.19).
Only GitHub will have 6.19; local dist and version.json remain at 6.18.
"""
import os
import sys
import json
import ssl
import subprocess
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
import updater_backend

EXE_NAME = "3M_Instrument_Logger.exe"
STAGED_EXE = ROOT / "build_tmp" / "release_out" / EXE_NAME
TAG = "v1.0.0-rc.6.19"
REL_ID = 391517006

def main():
    if not STAGED_EXE.exists():
        print(f"ERROR: Staged EXE not found: {STAGED_EXE}")
        sys.exit(1)

    fsize = STAGED_EXE.stat().st_size
    print(f"Staged EXE found: {STAGED_EXE} ({fsize:,} bytes, {fsize/1024/1024:.2f} MB)")

    cfg = updater_backend.load_config()
    repo = cfg["repo"]
    token = cfg["token"]

    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "3M-Release-Uploader",
    }
    ctx = ssl._create_unverified_context()

    # 1. Fetch release info
    print(f"\n[Step 1] Fetching release {REL_ID} ({TAG})...")
    req = urllib.request.Request(
        f"https://api.github.com/repos/{repo}/releases/{REL_ID}",
        headers=headers
    )
    rel = json.loads(urllib.request.urlopen(req, context=ctx).read().decode("utf-8"))
    print(f"Release: {rel['name']} (tag: {rel['tag_name']}, draft: {rel['draft']}, prerelease: {rel['prerelease']})")

    # 2. Check and delete existing asset if any
    for asset in rel.get("assets", []):
        if asset["name"] == EXE_NAME:
            print(f"Deleting existing asset {asset['id']}...")
            del_req = urllib.request.Request(
                f"https://api.github.com/repos/{repo}/releases/assets/{asset['id']}",
                headers=headers,
                method="DELETE"
            )
            urllib.request.urlopen(del_req, context=ctx)
            print("Deleted.")

    # 3. Upload via curl for robust streaming & progress
    upload_url = f"https://uploads.github.com/repos/{repo}/releases/{REL_ID}/assets?name={EXE_NAME}"
    print(f"\n[Step 2] Uploading {EXE_NAME} ({fsize/1024/1024:.2f} MB) to GitHub...")
    print(f"Upload URL: {upload_url}")

    curl_cmd = [
        "curl.exe",
        "-X", "POST",
        "-H", f"Authorization: Bearer {token}",
        "-H", "Accept: application/vnd.github+json",
        "-H", "Content-Type: application/octet-stream",
        "-H", "User-Agent: 3M-Release-Uploader",
        "--data-binary", f"@{str(STAGED_EXE)}",
        "--progress-bar",
        upload_url
    ]

    res = subprocess.run(curl_cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"curl failed with code {res.returncode}: {res.stderr}")
        sys.exit(1)

    try:
        asset_info = json.loads(res.stdout)
        print(f"[OK] Asset uploaded successfully!")
        print(f"Asset ID: {asset_info.get('id')}")
        print(f"Asset Name: {asset_info.get('name')}")
        print(f"Asset Size: {asset_info.get('size'):,} bytes")
        print(f"Download URL: {asset_info.get('browser_download_url')}")
    except Exception as e:
        print(f"Warning: Failed to parse JSON response: {e}")
        print(f"Response: {res.stdout[:500]}")

    # 4. Verify with updater_backend.check_for_updates("1.0.0-rc.6.18")
    print(f"\n[Step 3] Verifying updater_backend check_for_updates('1.0.0-rc.6.18')...")
    check_res = updater_backend.check_for_updates("1.0.0-rc.6.18")
    print(json.dumps(check_res, indent=2, ensure_ascii=False))

    if check_res.get("update_available") and check_res.get("latest_version") == "1.0.0-rc.6.19":
        print("\nSUCCESS: GitHub is now on v1.0.0-rc.6.19 with working update for v6.18 clients!")
    else:
        print("\nWARNING: Verification did not return update_available=True")

if __name__ == "__main__":
    main()
