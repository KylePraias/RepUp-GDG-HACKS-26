#!/usr/bin/env python3
"""Pre-compute a stable Chrome extension ID for RepUp.

Chrome derives the extension ID deterministically from the public key in the
manifest's "key" field. By generating that key ourselves we know the ID
*before* loading the extension, which lets us register a correctly-scoped
GitHub OAuth callback URL on the first try.

Usage:
    python3 scripts/predict_extension_id.py

What it does:
    1. Generates an RSA-2048 keypair at /app/extension/extension.pem (only if missing).
    2. Prints the value to paste into manifest.json "key": "<...>".
    3. Prints the resulting Chrome extension ID and the GitHub OAuth callback URL.

Re-run is safe: if the .pem file exists it is reused, so the ID stays stable.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import subprocess
from pathlib import Path

EXT_DIR = Path(__file__).resolve().parent.parent / "extension"
PEM = EXT_DIR / "extension.pem"
MANIFEST = EXT_DIR / "manifest.json"


def ensure_keypair() -> None:
    EXT_DIR.mkdir(parents=True, exist_ok=True)
    if PEM.exists():
        return
    print(f"→ generating new RSA keypair at {PEM}")
    subprocess.check_call(
        ["openssl", "genrsa", "-out", str(PEM), "2048"],
        stderr=subprocess.DEVNULL,
    )
    os.chmod(PEM, 0o600)


def public_key_der_b64() -> str:
    der = subprocess.check_output(
        ["openssl", "rsa", "-in", str(PEM), "-pubout", "-outform", "DER"],
        stderr=subprocess.DEVNULL,
    )
    return base64.b64encode(der).decode("ascii")


def extension_id_from_der(der_b64: str) -> str:
    der = base64.b64decode(der_b64)
    digest = hashlib.sha256(der).hexdigest()[:32]
    # Chrome maps hex chars 0-f to letters a-p
    return "".join(chr(ord("a") + int(c, 16)) for c in digest)


def patch_manifest(key_value: str) -> None:
    if not MANIFEST.exists():
        print(f"⚠ {MANIFEST} not found, skipping auto-patch")
        return
    data = json.loads(MANIFEST.read_text())
    if data.get("key") == key_value:
        return
    # Insert at the top, after manifest_version
    new = {}
    for k, v in data.items():
        new[k] = v
        if k == "manifest_version" and "key" not in data:
            new["key"] = key_value
    if "key" in data:
        data["key"] = key_value
        new = data
    MANIFEST.write_text(json.dumps(new, indent=2) + "\n")
    print(f"→ patched {MANIFEST} with stable key")


def main() -> None:
    ensure_keypair()
    der_b64 = public_key_der_b64()
    ext_id = extension_id_from_der(der_b64)
    callback = f"https://{ext_id}.chromiumapp.org/"

    patch_manifest(der_b64)

    print()
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║  Your stable Chrome extension ID                             ║")
    print("╚══════════════════════════════════════════════════════════════╝")
    print(f"  Extension ID         : {ext_id}")
    print(f"  GitHub OAuth callback: {callback}")
    print()
    print("Next steps:")
    print("  1. Go to https://github.com/settings/developers → New OAuth App")
    print(f"     Authorization callback URL: {callback}")
    print("  2. Copy the Client ID + Client Secret into your envs (see SETUP.md)")
    print("  3. cd frontend && yarn build:ext")
    print("  4. Chrome → chrome://extensions → Load unpacked → /app/extension")
    print()
    print("⚠ Keep extension/extension.pem private. Don't commit it.")


if __name__ == "__main__":
    main()
