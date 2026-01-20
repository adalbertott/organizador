#!/bin/bash

echo "🚀 Iniciando aplicação Flask..."
echo "📦 Python version: $(python --version)"
echo "📦 SQLAlchemy version: $(python -c "import sqlalchemy; print(sqlalchemy.__version__)")"

# Executar inicialização do banco
python -c "
from app import app, init_database
with app.app_context():
    init_database()
    print('✅ Banco de dados inicializado!')
"

# Iniciar Gunicorn
echo "🚀 Iniciando Gunicorn..."
exec gunicorn --config gunicorn_config.py app:app