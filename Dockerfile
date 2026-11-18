
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV SMARTPARK_DATABASE_PATH=/data/smartpark.db

WORKDIR /app

COPY requirements.txt requirements-prod.txt ./

RUN pip install --no-cache-dir -r requirements-prod.txt

COPY backend ./backend
COPY frontend ./frontend

RUN mkdir -p /data

EXPOSE 5002

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5002/api/health', timeout=3)" || exit 1

CMD ["sh", "-c", "cd /app/backend && exec gunicorn --bind 0.0.0.0:5002 --workers 1 --threads 4 --timeout 60 app:app"]
