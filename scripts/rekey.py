#!/usr/bin/env python3
"""Change the passphrase of data/items.enc without needing data-raw/.
Decrypts with the old passphrase and re-encrypts (fresh salt/iv) with the new one.

Usage: python3 scripts/rekey.py --old OLD --new NEW
"""
import argparse
import base64
import json
import os
import sys

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build import OUT_DIR, encrypt  # noqa: E402


def decrypt(envelope, password):
    salt = base64.b64decode(envelope["salt"])
    iv = base64.b64decode(envelope["iv"])
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=envelope["iterations"])
    key = kdf.derive(password.encode("utf-8"))
    return AESGCM(key).decrypt(iv, base64.b64decode(envelope["ciphertext"]), None)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--old", required=True)
    ap.add_argument("--new", required=True)
    args = ap.parse_args()

    enc_path = os.path.join(OUT_DIR, "items.enc")
    with open(enc_path, encoding="utf-8") as f:
        envelope = json.load(f)
    try:
        plaintext_bytes = decrypt(envelope, args.old)
    except InvalidTag:
        print("Old passphrase is wrong; items.enc left unchanged.")
        sys.exit(1)

    with open(enc_path, "w", encoding="utf-8") as f:
        json.dump(encrypt(plaintext_bytes, args.new), f)
    print(f"Re-encrypted {enc_path} with the new passphrase.")


if __name__ == "__main__":
    main()
