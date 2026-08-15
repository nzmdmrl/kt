"""
Veritabanı katmanı — async SQLAlchemy.

Engine ve session fabrikası burada. Tablolar app.startup'ta otomatik oluşur
(create_all) — Faz 3 için migration aracına gerek yok; ileride şema karmaşıklaşınca
Alembic eklenebilir. Bu sayede deploy'da ekstra komut gerekmez.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import (
    AsyncSession, async_sessionmaker, create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

settings = get_settings()

# asyncpg sürücüsüyle async engine.
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,   # kopan bağlantıları otomatik yeniler
)

AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    """FastAPI dependency — istek başına bir session."""
    async with AsyncSessionLocal() as session:
        yield session


async def init_models() -> None:
    """Tabloları oluştur (yoksa) + mevcut tablolara eksik sütunları ekle."""
    # Modellerin import edilmiş olması gerekir ki Base.metadata dolsun.
    from app.models import user, bot, daily_score, league_award, game_setting, sound_asset, word, notification, match_history, solo, arena_history, friendship, friend_label, share_line, home_button, custom_arena, collected_word, title, badge_def, music_track, seo_page, username_change, daily_solve, site_page  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Hafif otomatik migration: create_all mevcut tabloya YENİ SÜTUN eklemez.
        # Modeldeki sütunları gerçek tabloyla karşılaştırıp eksikleri ALTER ile ekle.
        await conn.run_sync(_add_missing_columns)


def _add_missing_columns(sync_conn) -> None:
    """Her tablo için modelde olup DB'de olmayan sütunları ekler (Postgres/SQLite)."""
    from sqlalchemy import inspect as sa_inspect
    inspector = sa_inspect(sync_conn)
    dialect = sync_conn.dialect.name
    for table in Base.metadata.sorted_tables:
        if not inspector.has_table(table.name):
            continue
        existing = {c["name"] for c in inspector.get_columns(table.name)}
        for col in table.columns:
            if col.name in existing:
                continue
            # Sütun tipini dialect'e göre derle.
            coltype = col.type.compile(dialect=sync_conn.dialect)
            default_sql = ""
            if col.default is not None and getattr(col.default, "is_scalar", False):
                val = col.default.arg
                if isinstance(val, bool):
                    default_sql = f" DEFAULT {'TRUE' if val else 'FALSE'}"
                elif isinstance(val, (int, float)):
                    default_sql = f" DEFAULT {val}"
                elif isinstance(val, str):
                    default_sql = f" DEFAULT '{val}'"
            try:
                sync_conn.exec_driver_sql(
                    f'ALTER TABLE {table.name} ADD COLUMN IF NOT EXISTS {col.name} {coltype}{default_sql}'
                    if dialect == "postgresql"
                    else f'ALTER TABLE {table.name} ADD COLUMN {col.name} {coltype}{default_sql}'
                )
                print(f"[migration] {table.name}.{col.name} eklendi")
            except Exception as e:
                print(f"[migration] {table.name}.{col.name} atlandı: {e}")
