window.Telegram.WebApp.ready();

let expenses = [];
let totalBudget = 0;
let isDeletePromptOpen = false; // Флаг, чтобы избежать двойного вызова

function calculateDailyAllowance() {
    const budget = document.getElementById('budget').value;
    const lastDay = new Date(document.getElementById('last-day').value);
    const today = new Date();
    
    if (budget && lastDay) {
        const daysDifference = Math.floor((lastDay - today) / (1000 * 60 * 60 * 24));
        const dailyAllowance = budget / (daysDifference + 1);
        document.getElementById('daily-allowance').innerText = dailyAllowance.toFixed(2);
        document.getElementById('available-amount').innerText = dailyAllowance.toFixed(2);
        document.getElementById('total-amount').innerText = budget;
        document.getElementById('budget-end-date').innerText = lastDay.toLocaleDateString();
        totalBudget = parseFloat(budget);
    }
}

function goToMainScreen() {
    document.getElementById('initial-screen').style.display = 'none';
    document.getElementById('main-screen').style.display = 'block';
    calculateDailyAllowance();
    saveBudgetToServer();
}

function saveBudgetToServer() {
    const budget = document.getElementById('budget').value;
    const lastDay = document.getElementById('last-day').value;
    const telegramUserId = getTelegramUserId();
    
    if (!telegramUserId) {
        console.error('Не удалось получить ID пользователя Telegram');
        alert('Ошибка: Не удалось получить ID пользователя Telegram');
        return;
    }

    console.log('Сохранение бюджета:', budget, 'Последний день:', lastDay, 'Telegram ID:', telegramUserId);

    fetch('/api/save_budget', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            telegram_id: telegramUserId,
            budget: budget,
            last_day: lastDay
        }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            console.log('Бюджет успешно сохранен');
            alert('Бюджет успешно сохранен');
        } else {
            console.error('Ошибка при сохранении бюджета');
            alert('Ошибка при сохранении бюджета');
        }
    })
    .catch(error => {
        console.error('Ошибка при отправке запроса:', error);
        alert('Произошла ошибка при сохранении бюджета');
    });
}

function openExpenseModal() {
    document.getElementById('expenseModal').style.display = 'block';
}

function closeExpenseModal() {
    document.getElementById('expenseModal').style.display = 'none';
}

function addExpense() {
    const expenseAmount = parseFloat(document.getElementById('expense-amount').value);
    
    if (expenseAmount && !isNaN(expenseAmount) && expenseAmount > 0) {
        const today = new Date();
        const expense = {
            amount: expenseAmount,
            date: today.toISOString().split('T')[0],
            time: today.toTimeString().split(' ')[0]
        };

        expenses.push(expense);
        updateAvailableAmount(-expenseAmount);
        renderExpenses();
        closeExpenseModal();

        // Отправка данных о расходе на сервер
        const telegramUserId = getTelegramUserId();
        fetch('/api/add_expense', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                telegram_id: telegramUserId,
                amount: expenseAmount,
                date: expense.date,
                time: expense.time
            }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                console.log('Expense added successfully');
            } else {
                console.error('Error adding expense');
            }
        });
    } else {
        alert("Please enter a valid expense amount.");
    }
}

function deleteExpense(index) {
    if (index >= 0 && index < expenses.length) {
        const expenseToRemove = expenses[index]; // Найти трату, которую нужно удалить
        expenses.splice(index, 1); // Удаление траты из массива
        updateAvailableAmount(expenseToRemove.amount); // Восстановление суммы в доступный бюджет
        renderExpenses(); // Перерисовка списка трат
    } else {
        console.error("Invalid expense index");
    }
}

function updateAvailableAmount(amountChange) {
    const availableAmountElement = document.getElementById('available-amount');
    let availableAmount = parseFloat(availableAmountElement.innerText); // Получаем текущий доступный бюджет
    availableAmount += amountChange; // Изменяем его на сумму добавленной/удалённой траты
    availableAmountElement.innerText = availableAmount.toFixed(2); // Обновляем значение в DOM

    // Обновляем общий бюджет с учётом потраченных средств
    const totalSpent = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    document.getElementById('total-amount').innerText = (totalBudget - totalSpent).toFixed(2);
}

function renderExpenses() {
    const expenseList = document.getElementById('expense-list');
    expenseList.innerHTML = ''; // Очищаем список перед перерисовкой

    expenses.forEach((expense, index) => {
        const expenseItem = document.createElement('div');
        expenseItem.className = 'expense-item';
        expenseItem.innerHTML = `
            <div class="expense-date">${expense.date} at ${expense.time}</div>
            <div class="expense-amount">${expense.amount.toFixed(2)}</div>
        `;

        // Событие для ПК (правый клик мыши)
        expenseItem.addEventListener('contextmenu', function(event) {
            event.preventDefault(); // Предотвращаем контекстное меню
            if (!isDeletePromptOpen) {
                isDeletePromptOpen = true; // Устанавливаем флаг, чтобы предотвратить повторное открытие
                const confirmDelete = confirm("Вы действительно хотите удалить эту трату?");
                if (confirmDelete) {
                    deleteExpense(index);
                }
                isDeletePromptOpen = false; // Сбрасываем флаг
            }
        });

        // Событие для мобильных устройств (удержание)
        let pressTimer;
        expenseItem.addEventListener('mousedown', function(event) {
            if (event.button === 0) { // Только для левой кнопки мыши
                pressTimer = setTimeout(function() {
                    if (!isDeletePromptOpen) {
                        isDeletePromptOpen = true;
                        const confirmDelete = confirm("Вы действительно хотите удалить эту трату?");
                        if (confirmDelete) {
                            deleteExpense(index);
                        }
                        isDeletePromptOpen = false;
                    }
                }, 800); // Удержание в течение 800 миллис��кунд
            }
        });

        expenseItem.addEventListener('mouseup', function(event) {
            clearTimeout(pressTimer); // Отменяем таймер, если кнопка отпущена раньше
        });

        expenseItem.addEventListener('mouseout', function(event) {
            clearTimeout(pressTimer); // Отменяем таймер, если мышь покинула элемент
        });

        expenseList.appendChild(expenseItem); // Добавляем элемент траты в список
    });
}

function openSettings() {
    document.getElementById('modal-budget').value = document.getElementById('budget').value;
    document.getElementById('modal-last-day').value = document.getElementById('last-day').value;
    calculateNewDailyAllowance();
    document.getElementById('settingsModal').style.display = 'block';
}

function closeModal() {
    document.getElementById('settingsModal').style.display = 'none';
}

function calculateNewDailyAllowance() {
    const budget = document.getElementById('modal-budget').value;
    const lastDay = new Date(document.getElementById('modal-last-day').value);
    const today = new Date();

    if (budget && lastDay) {
        const daysDifference = Math.floor((lastDay - today) / (1000 * 60 * 60 * 24));
        const dailyAllowance = budget / (daysDifference + 1);
        document.getElementById('new-daily-allowance').innerText = dailyAllowance.toFixed(2);
    }
}

function updateSettings() {
    document.getElementById('budget').value = document.getElementById('modal-budget').value;
    document.getElementById('last-day').value = document.getElementById('modal-last-day').value;

    calculateDailyAllowance();

    const allowance = document.getElementById('daily-allowance').innerText;
    document.getElementById('available-amount').innerText = allowance;

    closeModal();
}

function getTelegramUserId() {
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user) {
        const userId = parseInt(window.Telegram.WebApp.initDataUnsafe.user.id, 10);
        console.log('Реальный Telegram User ID:', userId);
        return userId;
    } else {
        console.error('Не удалось получить Telegram User ID');
        return null;
    }
}

window.onclick = function(event) {
    if (event.target == document.getElementById('settingsModal')) {
        closeModal();
    }
    if (event.target == document.getElementById('expenseModal')) {
        closeExpenseModal();
    }
}
