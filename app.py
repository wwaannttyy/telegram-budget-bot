from quart import Quart, request, jsonify, send_from_directory
from sqlalchemy import create_engine, Column, Integer, Float, Date, Time, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, ContextTypes
import os
from datetime import datetime
from dotenv import load_dotenv
import asyncio

load_dotenv()  # Загрузка переменных окружения из файла .env

app = Quart(__name__, static_folder='static')
DATABASE_URL = f"postgresql://{os.getenv('DB_USERNAME')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}/{os.getenv('DB_NAME')}"
engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)
Base = declarative_base()

# Модель для хранения данных пользователя
class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    telegram_id = Column(Integer, unique=True, nullable=False)
    budget = Column(Float)
    last_day = Column(Date)

class Expense(Base):
    __tablename__ = 'expenses'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    amount = Column(Float, nullable=False)
    date = Column(Date, nullable=False)
    time = Column(Time, nullable=False)

# Создание таблиц в базе данных
Base.metadata.create_all(engine)

# Роуты Quart для обработки запросов от веб-приложения
@app.route('/api/save_budget', methods=['POST'])
async def save_budget():
    data = await request.get_json()
    session = Session()
    user = session.query(User).filter_by(telegram_id=data['telegram_id']).first()
    if not user:
        user = User(telegram_id=data['telegram_id'])
        session.add(user)
    
    user.budget = data['budget']
    user.last_day = datetime.strptime(data['last_day'], '%Y-%m-%d').date()
    session.commit()
    session.close()
    return jsonify({"status": "success"})

@app.route('/api/add_expense', methods=['POST'])
async def add_expense():
    data = await request.get_json()
    session = Session()
    user = session.query(User).filter_by(telegram_id=data['telegram_id']).first()
    if user:
        expense = Expense(user_id=user.id, amount=data['amount'], 
                          date=datetime.strptime(data['date'], '%Y-%m-%d').date(), 
                          time=datetime.strptime(data['time'], '%H:%M:%S').time())
        session.add(expense)
        session.commit()
        session.close()
        return jsonify({"status": "success"})
    session.close()
    return jsonify({"status": "error", "message": "User not found"})

# Функции для Telegram бота
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    web_app_url = os.getenv('WEB_APP_URL')
    keyboard = [
        [InlineKeyboardButton("Открыть веб-версию", web_app={"url": web_app_url})]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        "Добро пожаловать! Нажмите кнопку ниже, чтобы открыть веб-версию приложения. "
        "Также вы можете использовать следующие команды:\n"
        "/balance - просмотр баланса\n"
        "/expenses - список трат\n"
        "/daily - дневной лимит",
        reply_markup=reply_markup
    )

async def balance(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    session = Session()
    user = session.query(User).filter_by(telegram_id=update.effective_user.id).first()
    if user:
        total_expenses = session.query(Expense).filter_by(user_id=user.id).with_entities(Expense.amount).all()
        total_expenses = sum([expense[0] for expense in total_expenses])
        remaining_budget = user.budget - total_expenses
        message = f"Ваш текущий баланс: {remaining_budget:.2f}\n"
        message += f"Общий бюджет: {user.budget:.2f}\n"
        message += f"Потрачено: {total_expenses:.2f}\n"
        message += f"Дата окончания бюджета: {user.last_day.strftime('%d.%m.%Y')}"
    else:
        message = "Бюджет не установлен. Пожалуйста, установите бюджет через веб-приложение."
    session.close()
    await update.message.reply_text(message)

async def expenses(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    session = Session()
    user = session.query(User).filter_by(telegram_id=update.effective_user.id).first()
    if user:
        expenses = session.query(Expense).filter_by(user_id=user.id).order_by(Expense.date.desc(), Expense.time.desc()).limit(10).all()
        if expenses:
            message = "Ваши последние расходы:\n"
            for expense in expenses:
                message += f"{expense.date.strftime('%d.%m.%Y')} {expense.time.strftime('%H:%M')}: {expense.amount:.2f}\n"
        else:
            message = "У вас пока нет расходов."
    else:
        message = "Пользователь не найден. Пожалуйста, установите бюджет через веб-приложение."
    session.close()
    await update.message.reply_text(message)

async def daily_limit(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    session = Session()
    user = session.query(User).filter_by(telegram_id=update.effective_user.id).first()
    if user:
        today = datetime.now().date()
        days_left = (user.last_day - today).days
        if days_left > 0:
            total_expenses = session.query(Expense).filter_by(user_id=user.id).with_entities(Expense.amount).all()
            total_expenses = sum([expense[0] for expense in total_expenses])
            remaining_budget = user.budget - total_expenses
            daily_limit = remaining_budget / days_left
            message = f"Ваш дневной лимит: {daily_limit:.2f}\n"
            message += f"Осталось дней: {days_left}"
        else:
            message = "Срок вашего бюджета истек. Пожалуйста, обновите бюджет через веб-приложение."
    else:
        message = "Бюджет не установлен. Пожалуйста, установите бюджет через веб-приложение."
    session.close()
    await update.message.reply_text(message)

async def run_bot():
    bot_token = os.getenv('TELEGRAM_BOT_TOKEN')
    if not bot_token:
        raise ValueError("Не задан токен Telegram бота. Пожалуйста, установите переменную окружения TELEGRAM_BOT_TOKEN.")
    
    application = Application.builder().token(bot_token).build()

    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("balance", balance))
    application.add_handler(CommandHandler("expenses", expenses))
    application.add_handler(CommandHandler("daily", daily_limit))

    await application.initialize()
    await application.start()
    await application.updater.start_polling()

async def main():
    bot_task = asyncio.create_task(run_bot())
    web_task = asyncio.create_task(app.run_task(host='0.0.0.0', port=5000))
    
    await asyncio.gather(bot_task, web_task)

@app.route('/')
async def index():
    return await send_from_directory(app.static_folder, 'index.html')

@app.route('/static/<path:path>')
async def serve_static(path):
    return await send_from_directory(app.static_folder, path)

@app.route('/<path:path>')
async def catch_all(path):
    return f"Запрошенный путь: {path}", 404

if __name__ == '__main__':
    asyncio.run(main())
