#!/bin/sh
# Arranque del contenedor: aplica migraciones y levanta Gunicorn.
set -e

echo "→ Aplicando migraciones..."
python manage.py migrate --noinput

echo "→ Iniciando Nexo CRM en el puerto ${PORT:-8000}..."
exec gunicorn config.wsgi:application \
    --bind "0.0.0.0:${PORT:-8000}" \
    --workers "${GUNICORN_WORKERS:-3}" \
    --access-logfile - \
    --error-logfile -
