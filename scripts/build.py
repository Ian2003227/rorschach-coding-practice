#!/usr/bin/env python3
"""Merge section_N.json files, validate, embed location-map images, and encrypt
into data/items.enc. Run locally before each commit; never commit plaintext.

Usage: python3 scripts/build.py [--password 818]
"""
import argparse
import base64
import json
import os
import sys

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(ROOT, "data-raw")
LOC_DIR = os.path.join(ROOT, "assets", "loc")
OUT_DIR = os.path.join(ROOT, "data")
ITERATIONS = 250000


def load_sections():
    items = []
    report = []
    for n in range(1, 9):
        path = os.path.join(RAW_DIR, f"section{n}.json")
        if not os.path.exists(path):
            report.append(f"[MISSING] section{n}.json not found")
            continue
        with open(path, encoding="utf-8") as f:
            arr = json.load(f)
        report.append(f"section{n}: {len(arr)} items")
        items.extend(arr)
    return items, report


def validate(items):
    problems = []
    ids = [it["id"] for it in items]
    if len(ids) != 300:
        problems.append(f"Expected 300 items total, got {len(ids)}")
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        problems.append(f"Duplicate ids: {sorted(dupes)}")
    missing = sorted(set(range(1, 301)) - set(ids))
    if missing:
        problems.append(f"Missing ids: {missing}")
    unparsed = [it["id"] for it in items if not it.get("parse_ok", True)]
    if unparsed:
        problems.append(f"parse_ok=false for ids: {sorted(unparsed)} (needs manual review)")
    missing_source_ids = []
    for it in items:
        if it.get("missing_source"):
            missing_source_ids.append(it["id"])
            for field in ["card", "answer_raw", "answer"]:
                if field not in it or it[field] in (None, ""):
                    problems.append(f"id {it.get('id')}: missing/empty field '{field}' (even for missing_source item)")
            continue
        for field in ["response_en", "response_zh", "card", "answer_raw", "answer"]:
            if field not in it or it[field] in (None, ""):
                problems.append(f"id {it.get('id')}: missing/empty field '{field}'")
    if missing_source_ids:
        print(f"[NOTE] {len(missing_source_ids)} item(s) have missing_source=true (no response/inquiry text — source PDF pages absent): {sorted(missing_source_ids)}")
    return problems


def load_loc_images():
    loc = {}
    for n in range(1, 9):
        path = os.path.join(LOC_DIR, f"section{n}.jpg")
        if not os.path.exists(path):
            print(f"[WARN] {path} not found, skipping", file=sys.stderr)
            continue
        with open(path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
        loc[str(n)] = f"data:image/jpeg;base64,{b64}"
    return loc


def encrypt(plaintext_bytes, password):
    salt = os.urandom(16)
    iv = os.urandom(12)
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITERATIONS)
    key = kdf.derive(password.encode("utf-8"))
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(iv, plaintext_bytes, None)
    return {
        "salt": base64.b64encode(salt).decode("ascii"),
        "iv": base64.b64encode(iv).decode("ascii"),
        "iterations": ITERATIONS,
        "ciphertext": base64.b64encode(ciphertext).decode("ascii"),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--password", default="818")
    ap.add_argument("--allow-problems", action="store_true", help="write output even if validation finds issues")
    args = ap.parse_args()

    items, section_report = load_sections()
    print("\n".join(section_report))

    problems = validate(items)
    if problems:
        print("\n--- VALIDATION PROBLEMS ---")
        for p in problems:
            print(" -", p)
        if not args.allow_problems:
            print("\nAborting (use --allow-problems to force). Fix data-raw/*.json first.")
            sys.exit(1)

    items.sort(key=lambda x: x["id"])
    loc_images = load_loc_images()

    plaintext = {"items": items, "locImages": loc_images}
    plaintext_bytes = json.dumps(plaintext, ensure_ascii=False).encode("utf-8")
    print(f"\nPlaintext size: {len(plaintext_bytes)/1024:.1f} KB")

    os.makedirs(OUT_DIR, exist_ok=True)
    # local-only plaintext copy for debugging (gitignored)
    with open(os.path.join(OUT_DIR, "items.json"), "w", encoding="utf-8") as f:
        json.dump(plaintext, f, ensure_ascii=False, indent=2)

    envelope = encrypt(plaintext_bytes, args.password)
    enc_path = os.path.join(OUT_DIR, "items.enc")
    with open(enc_path, "w", encoding="utf-8") as f:
        json.dump(envelope, f)
    print(f"Wrote encrypted bundle: {enc_path} ({os.path.getsize(enc_path)/1024:.1f} KB)")
    print("Done. Commit data/items.enc (NOT data/items.json).")


if __name__ == "__main__":
    main()
