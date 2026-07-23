FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Bağımlılıklar önce (katman önbelleği için)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Uygulama kodu
COPY . .

EXPOSE 8000

# Coolify healthcheck /api/health'e vurabilir
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
