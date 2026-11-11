"""Database access: Aiven PostgreSQL in production, SQLite for tests and local runs.

Plain DB-API, no ORM. Write SQL with `?` placeholders; they are rewritten to `%s` for
PostgreSQL. DATABASE_URL accepts the Aiven URI as copied from the console
(postgres://avnadmin:...@host:port/defaultdb?sslmode=require), the SQLAlchemy form
(postgresql+psycopg://...), or sqlite:///path/to/file.db.
"""
import re
import sqlite3
from contextlib import contextmanager
from urllib.parse import urlparse

from app.core.config import db_settings


def url() -> str:
    return db_settings.url


def enabled() -> bool:
    return bool(db_settings.url)


def kind(target: str) -> str:
    return "sqlite" if target.strip().startswith("sqlite:") else "postgres"


def normalize_postgres_url(raw: str) -> str:
    u = re.sub(r"^postgres(?:ql)?(?:\+\w+)?://", "postgresql://", raw.strip())
    host = urlparse(u).hostname or ""
    if "sslmode=" not in u and host not in ("localhost", "127.0.0.1", "::1"):
        u += ("&" if "?" in u else "?") + "sslmode=require"  # Aiven only accepts TLS
    return u


class Conn:
    def __init__(self, raw, dialect: str):
        self.raw, self.dialect = raw, dialect

    def _sql(self, sql: str) -> str:
        return sql.replace("?", "%s") if self.dialect == "postgres" else sql

    def execute(self, sql: str, params=()):
        cur = self.raw.cursor()
        cur.execute(self._sql(sql), tuple(params))
        return cur

    def executemany(self, sql: str, rows) -> None:
        cur = self.raw.cursor()
        cur.executemany(self._sql(sql), rows)

    def all(self, sql: str, params=()) -> list[dict]:
        return [dict(r) for r in self.execute(sql, params).fetchall()]

    def one(self, sql: str, params=()) -> dict | None:
        r = self.execute(sql, params).fetchone()
        return dict(r) if r is not None else None


@contextmanager
def connect(target: str | None = None):
    """Open a connection to `target` (default: DATABASE_URL); commit on success, roll back on error."""
    target = (target or url()).strip()
    if not target:
        raise RuntimeError("DATABASE_URL is not set")
    dialect = kind(target)
    if dialect == "sqlite":
        raw = sqlite3.connect(target.removeprefix("sqlite:///"))
        raw.row_factory = sqlite3.Row
    else:
        import psycopg  # imported lazily so the JSON-only mode needs no driver
        from psycopg.rows import dict_row
        raw = psycopg.connect(normalize_postgres_url(target), row_factory=dict_row, connect_timeout=10)
    conn = Conn(raw, dialect)
    try:
        yield conn
        raw.commit()
    except BaseException:
        raw.rollback()
        raise
    finally:
        raw.close()
