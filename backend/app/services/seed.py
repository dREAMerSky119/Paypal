"""Loads committed seed files from app/data/ once and caches them.

Render's free plan has no persistent disk, so seed data is committed to the
repo and read at startup instead of being written at runtime.
"""
import json
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


@lru_cache(maxsize=None)
def load_json(name: str):
    with (DATA_DIR / name).open(encoding="utf-8") as fh:
        return json.load(fh)
