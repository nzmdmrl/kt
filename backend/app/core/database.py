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
    """Tabloları oluştur (yoksa). Uygulama başlangıcında çağrılır."""
    # Modellerin import edilmiş olması gerekir ki Base.metadata dolsun.
    from app.models import user, bot  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
