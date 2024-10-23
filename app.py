from quart import Quart, request, jsonify, send_from_directory
from sqlalchemy import create_engine, Column, Integer, Float, Date, Time, ForeignKey, text, BigInteger
from sqlalchemy.orm import declarative_base, sessionmaker
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, ContextTypes
import os
from datetime import datetime
from dotenv import load_dotenv
import asyncio
from sqlalchemy import func

load_dotenv()

app = Quart(__name__, static_folder='static')
DATABASE_URL = f"postgresql://{os.getenv('DB_USERNAME')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}/{os.getenv('DB_NAME')}"
engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    telegram_id = Column(BigInteger, unique=True, nullable=False)  # Изменено на BigInteger
    budget = Column(Float)
    last_day = Column(Date)

class Expense(Base):
    __tablename__ = 'expenses'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    amount = Column(Float, nullable=False)
    date = Column(Date, nullable=False)
    time = Column(Time, nullable=False)

def create_tables():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    print("Таблицы успешно созданы")

create_tables()

@app.route('/')
async def index():
    return await send_from_directory(app.static_folder, 'index.html')

@app.route('/static/<path:path>')
async def serve_static(path):
    return await send_from_directory(app.static_folder, path)

@app.route('/api/save_budget', methods=['POST'])
async def save_budget():
    data = await request.get_json()
    print(f"Получены данные: {data}")
    if not isinstance(data['telegram_id'], int):
        return jsonify({"status": "error", "message": "Invalid telegram_id"})
    session = Session()
    try:
        user = session.query(User).filter_by(telegram_id=data['telegram_id']).first()
        if not user:
            user = User(telegram_id=data['telegram_id'])
            session.add(user)
            print(f"Создан новый пользователь с Telegram ID: {data['telegram_id']}")
        else:
            print(f"Обновление существующего пользователя с Telegram ID: {data['telegram_id']}")
        
        user.budget = float(data['budget'])
        user.last_day = datetime.strptime(data['last_day'], '%Y-%m-%d').date()
        session.commit()
        print(f"Сохранен бюджет: {user.budget} для пользователя {user.telegram_id}")
    except Exception as e:
        print(f"Ошибка при сохранении бюджета: {e}")
        session.rollback()
        return jsonify({"status": "error", "message": str(e)})
    finally:
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

@app.route('/api/get_user_data', methods=['POST'])
async def get_user_data():
    data = await request.get_json()
    telegram_id = data.get('telegram_id')
    if not telegram_id:
        return jsonify({"status": "error", "message": "Invalid telegram_id"})
    
    session = Session()
    try:
        user = session.query(User).filter_by(telegram_id=telegram_id).first()
        if user:
            total_expenses = session.query(func.sum(Expense.amount)).filter_by(user_id=user.id).scalar() or 0
            start_date = datetime.now().date()
            days_difference = max(1, (user.last_day - start_date).days + 1)
            daily_allowance = user.budget / days_difference
            remaining_budget = user.budget - total_expenses
            today_expenses = session.query(func.sum(Expense.amount)).filter(Expense.user_id == user.id, Expense.date == start_date).scalar() or 0
            available_today = max(0, daily_allowance - today_expenses)
            return jsonify({
                "status": "success",
                "has_budget": True,
                "budget": float(user.budget),
                "last_day": user.last_day.isoformat(),
                "total_expenses": float(total_expenses),
                "daily_allowance": float(daily_allowance),
                "remaining_budget": float(remaining_budget),
                "available_today": float(available_today)
            })
        else:
            return jsonify({"status": "success", "has_budget": False})
    except Exception as e:
        print(f"Ошибка при получении данных пользователя: {e}")
        return jsonify({"status": "error", "message": str(e)})
    finally:
        session.close()

@app.route('/api/get_expenses', methods=['POST'])
async def get_expenses():
    data = await request.get_json()
    telegram_id = data.get('telegram_id')
    if not telegram_id:
        return jsonify({"status": "error", "message": "Invalid telegram_id"})
    
    session = Session()
    try:
        user = session.query(User).filter_by(telegram_id=telegram_id).first()
        if user:
            expenses = session.query(Expense).filter_by(user_id=user.id).order_by(Expense.date.desc(), Expense.time.desc()).all()
            expenses_list = [
                {
                    "amount": expense.amount,
                    "date": expense.date.isoformat(),
                    "time": expense.time.isoformat()
                } for expense in expenses
            ]
            return jsonify({
                "status": "success",
                "expenses": expenses_list
            })
        else:
            return jsonify({"status": "success", "expenses": []})
    except Exception as e:
        print(f"Ошибка при получении трат пользователя: {e}")
        return jsonify({"status": "error", "message": str(e)})
    finally:
        session.close()

@app.route('/api/delete_expense', methods=['POST'])
async def delete_expense():
    data = await request.get_json()
    telegram_id = data.get('telegram_id')
    expense_date = data.get('expense_date')
    expense_time = data.get('expense_time')
    expense_amount = data.get('expense_amount')

    if not all([telegram_id, expense_date, expense_time, expense_amount]):
        return jsonify({"status": "error", "message": "Missing required data"})

    session = Session()
    try:
        user = session.query(User).filter_by(telegram_id=telegram_id).first()
        if user:
            expense = session.query(Expense).filter_by(
                user_id=user.id,
                date=datetime.strptime(expense_date, '%Y-%m-%d').date(),
                time=datetime.strptime(expense_time, '%H:%M:%S').time(),
                amount=float(expense_amount)
            ).first()

            if expense:
                session.delete(expense)
                session.commit()
                return jsonify({"status": "success"})
            else:
                return jsonify({"status": "error", "message": "Expense not found"})
        else:
            return jsonify({"status": "error", "message": "User not found"})
    except Exception as e:
        print(f"Ошибка при удалении траты: {e}")
        session.rollback()
        return jsonify({"status": "error", "message": str(e)})
    finally:
        session.close()

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    web_app_url = os.getenv('WEB_APP_URL')
    keyboard = [
        [InlineKeyboardButton("🌐 Открыть веб-версию", web_app={"url": web_app_url})]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        "👋 Добро пожаловать! Нажмите кнопку ниже, чтобы открыть веб-версию приложения.\n\n"
        "Доступные команды:\n"
        "💰 /balance - просмотр баланса\n"
        "📊 /expenses - список трат\n"
        "📅 /daily - дневной лимит",
        reply_markup=reply_markup
    )

async def balance(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    session = Session()
    try:
        telegram_id = update.effective_user.id
        user = session.query(User).filter_by(telegram_id=telegram_id).first()
        
        if user:
            total_expenses = session.query(func.sum(Expense.amount)).filter_by(user_id=user.id).scalar() or 0
            remaining_budget = user.budget - total_expenses
            
            message = f"💰 Общий баланс: {remaining_budget:.2f}\n"
            message += f"📅 Дата окончания: {user.last_day.strftime('%d.%m.%Y')}"
        else:
            message = "❌ Бюджет не установлен. Пожалуйста, установите бюджет через веб-приложение."
            
        await update.message.reply_text(message)
    finally:
        session.close()

async def expenses(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    session = Session()
    user = session.query(User).filter_by(telegram_id=update.effective_user.id).first()
    if user:
        expenses = session.query(Expense).filter_by(user_id=user.id).order_by(Expense.date.desc(), Expense.time.desc()).limit(10).all()
        if expenses:
            message = "📊 Ваши последние расходы:\n\n"
            for expense in expenses:
                message += f"🕒 {expense.date.strftime('%d.%m.%Y')} {expense.time.strftime('%H:%M')}: 💸 {expense.amount:.2f}\n"
        else:
            message = "📭 У вас пока нет расходов."
    else:
        message = "❌ Пользователь не найден. Пожалуйста, установите бюджет через веб-приложение."
    session.close()
    await update.message.reply_text(message)

async def daily_limit(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    session = Session()
    user = session.query(User).filter_by(telegram_id=update.effective_user.id).first()
    if user:
        start_date = datetime.now().date()
        days_difference = max(1, (user.last_day - start_date).days + 1)
        daily_allowance = user.budget / days_difference
        total_expenses = session.query(func.sum(Expense.amount)).filter_by(user_id=user.id).scalar() or 0
        remaining_budget = user.budget - total_expenses
        
        today_expenses = session.query(func.sum(Expense.amount)).filter(Expense.user_id == user.id, Expense.date == start_date).scalar() or 0
        available_today = max(0, daily_allowance - today_expenses)
        
        message = f"📊 Ваш дневной лимит: {daily_allowance:.2f}\n"
        message += f"💰 Доступно сегодня: {available_today:.2f}\n"
        message += f"📅 Осталось дней: {days_difference}\n"
        message += f"💎 Общий остаток: {remaining_budget:.2f}"
    else:
        message = "❌ Бюджет не установлен. Пожалуйста, установите бюджет через веб-приложение."
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

def print_all_users():
    session = Session()
    users = session.query(User).all()
    print("Все пользователи в базе данных:")
    for user in users:
        print(f"ID: {user.id}, Telegram ID: {user.telegram_id}, Budget: {user.budget}, Last Day: {user.last_day}")
    session.close()

# Вызовите эту функцию перед запуском основного приложения
print_all_users()

def test_db_connection():
    try:
        session = Session()
        session.execute(text("SELECT 1"))
        print("Соединение с базой данных успешно установлено")
    except Exception as e:
        print(f"Ошибка при подключении к базе данных: {e}")
    finally:
        session.close()

test_db_connection()

if __name__ == '__main__':
    asyncio.run(main())
