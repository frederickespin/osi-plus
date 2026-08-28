#!/usr/bin/env python3
"""Copy Playwright failure evidence while removing credential and business identifiers."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import tempfile
import zipfile
from pathlib import Path


UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", re.I)
EMAIL = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
BEARER = re.compile(r"Bearer\s+[^\s\"']+", re.I)
HEADER_VALUE = re.compile(
    r'("name"\s*:\s*"(?:authorization|cookie|set-cookie|idempotency-key)"\s*,\s*"value"\s*:\s*")[^"]*(")',
    re.I,
)
INTERNAL_ID = re.compile(
    r'("(?:caseId|clientId|tenantId|membershipId|ownerMembershipId|ownerUserId|userId|publicRef)"\s*:\s*")[^"]*(")',
    re.I,
)
SECRET_ASSIGNMENT = re.compile(
    r'((?:token|authorization|cookie|password|secret)\s*[:=]\s*)[^\s,;\"\']+',
    re.I,
)
BINARY_SUFFIXES = {".png", ".jpg", ".jpeg", ".webm", ".woff", ".woff2", ".gif"}


def redact_text(value: str) -> str:
    value = HEADER_VALUE.sub(r"\1[REDACTED]\2", value)
    value = INTERNAL_ID.sub(r"\1[REDACTED]\2", value)
    value = BEARER.sub("Bearer [REDACTED]", value)
    value = SECRET_ASSIGNMENT.sub(r"\1[REDACTED]", value)
    value = EMAIL.sub("[EMAIL]", value)
    return UUID.sub("[UUID]", value)


def sanitize_bytes(name: str, payload: bytes) -> bytes:
    if Path(name).suffix.lower() in BINARY_SUFFIXES:
        return payload
    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError:
        return payload
    return redact_text(text).encode("utf-8")


def sanitize_trace(source: Path, destination: Path) -> None:
    with zipfile.ZipFile(source, "r") as input_zip, zipfile.ZipFile(
        destination, "w", compression=zipfile.ZIP_DEFLATED
    ) as output_zip:
        for entry in input_zip.infolist():
            payload = input_zip.read(entry.filename)
            output_zip.writestr(entry, sanitize_bytes(entry.filename, payload))
    with zipfile.ZipFile(destination, "r") as checked:
        if checked.testzip() is not None:
            raise RuntimeError(f"corrupt sanitized trace: {source.name}")


def sanitize_tree(source: Path, destination: Path) -> dict[str, int]:
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)
    counts = {"trace": 0, "screenshot": 0, "video": 0, "log": 0}
    for item in source.rglob("*"):
        if not item.is_file():
            continue
        relative = item.relative_to(source)
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if item.name == "trace.zip":
            sanitize_trace(item, target)
            counts["trace"] += 1
        elif item.suffix.lower() in {".png", ".jpg", ".jpeg"}:
            shutil.copy2(item, target)
            counts["screenshot"] += 1
        elif item.suffix.lower() == ".webm":
            shutil.copy2(item, target)
            counts["video"] += 1
        else:
            target.write_bytes(sanitize_bytes(item.name, item.read_bytes()))
            if item.suffix.lower() in {".json", ".md", ".txt"}:
                counts["log"] += 1
    marker = destination / "SANITIZED-EVIDENCE.json"
    marker.write_text(json.dumps({"ok": True, "counts": counts}, sort_keys=True) + "\n", encoding="utf-8")
    return counts


def verify(destination: Path, counts: dict[str, int]) -> None:
    for required in ("trace", "screenshot", "video", "log"):
        if counts[required] < 1:
            raise RuntimeError(f"missing required {required} artifact")
    forbidden = [
        re.compile(rb"Bearer\s+(?!\[REDACTED\])", re.I),
        re.compile(rb'"name"\s*:\s*"idempotency-key"\s*,\s*"value"\s*:\s*"(?!\[REDACTED\])', re.I),
        re.compile(rb'"name"\s*:\s*"(?:authorization|cookie|set-cookie)"\s*,\s*"value"\s*:\s*"(?!\[REDACTED\])', re.I),
        re.compile(UUID.pattern.encode("ascii"), re.I),
        re.compile(EMAIL.pattern.encode("ascii")),
    ]
    for item in destination.rglob("*"):
        if not item.is_file() or item.suffix.lower() in BINARY_SUFFIXES or item.name == "trace.zip":
            continue
        payload = item.read_bytes()
        for pattern in forbidden:
            if pattern.search(payload):
                raise RuntimeError(f"unsanitized evidence in {item.relative_to(destination)}")
    for trace in destination.rglob("trace.zip"):
        with zipfile.ZipFile(trace, "r") as archive:
            for entry in archive.infolist():
                if Path(entry.filename).suffix.lower() in BINARY_SUFFIXES:
                    continue
                payload = archive.read(entry.filename)
                for pattern in forbidden:
                    if pattern.search(payload):
                        raise RuntimeError(f"unsanitized trace entry {entry.filename}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    if not args.source.is_dir():
        raise SystemExit(f"source artifact directory missing: {args.source}")
    if args.source.resolve() == args.destination.resolve():
        raise SystemExit("source and destination must differ")
    counts = sanitize_tree(args.source, args.destination)
    verify(args.destination, counts)
    print(json.dumps({"ok": True, "counts": counts}, sort_keys=True))


if __name__ == "__main__":
    main()
