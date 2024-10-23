import os
import psycopg2
from dotenv import load_dotenv
import subprocess

load_dotenv()

def setup_postgres_user():
    try:
        # Создаем пользователя postgres и устанавливаем пароль
        password = os.getenv('DB_PASSWORD')
        commands = [
            f"sudo -u postgres psql -c \"ALTER USER postgres WITH PASSWORD '{password}';\"",
            "sudo service postgresql restart"
        ]
        
        for command in commands:
            subprocess.run(command, shell=True, check=True)
        print("Пользователь postgres успешно настроен")
        
    except subprocess.CalledProcessError as e:
        print(f"Ошибка при настройке пользователя postgres: {e}")
        return False
    return True

def create_database():
    conn = None
    cursor = None
    try:
        # Сначала настраиваем пользователя
        if not setup_postgres_user():
            return

        # Подключение к PostgreSQL
        conn = psycopg2.connect(
            dbname='postgres',
            user=os.getenv('DB_USERNAME'),
            password=os.getenv('DB_PASSWORD'),
            host=os.getenv('DB_HOST')
        )
        conn.autocommit = True
        cursor = conn.cursor()

        # Создание базы данных
        db_name = os.getenv('DB_NAME')
        cursor.execute(f"SELECT 1 FROM pg_catalog.pg_database WHERE datname = '{db_name}'")
        exists = cursor.fetchone()
        if not exists:
            cursor.execute(f'CREATE DATABASE {db_name}')
            print(f"База данных {db_name} создана")

        cursor.close()
        conn.close()

        # Подключение к созданной базе данных
        conn = psycopg2.connect(
            dbname=db_name,
            user=os.getenv('DB_USERNAME'),
            password=os.getenv('DB_PASSWORD'),
            host=os.getenv('DB_HOST')
        )
        cursor = conn.cursor()

        # Создание таблиц
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE NOT NULL,
                budget FLOAT,
                last_day DATE
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS expenses (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                amount FLOAT NOT NULL,
                date DATE NOT NULL,
                time TIME NOT NULL
            )
        ''')

        conn.commit()
        print("Таблицы созданы успешно")

    except Exception as e:
        print(f"Ошибка при создании базы данных: {e}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

if __name__ == "__main__":
    create_database()
