// Добавьте эту функцию в начало файла
function vibrate(pattern) {
    if (Telegram.WebApp.isVersionAtLeast('6.1')) {
        Telegram.WebApp.HapticFeedback.impactOccurred('medium');
    }
}

function preventBodyScroll(event) {
    if (!event.target.closest('.expense-list')) {
        event.preventDefault();
    }
}

window.Telegram.WebApp.ready();

let expenses = [];
let totalBudget = 0;
let totalExpenses = 0;
let isDeletePromptOpen = false;

function calculateDailyAllowance() {
    const budget = parseFloat(document.getElementById('budget').value);
    const lastDay = new Date(document.getElementById('last-day').value);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    lastDay.setHours(23, 59, 59, 999);
    
    if (!isNaN(budget) && lastDay) {
        const daysDifference = Math.ceil((lastDay - today) / (1000 * 60 * 60 * 24));
        const dailyAllowance = (budget - totalExpenses) / daysDifference;
        
        const remainingBudget = budget - totalExpenses;
        const availableToday = Math.max(0, dailyAllowance);
        
        document.getElementById('daily-allowance').innerText = dailyAllowance.toFixed(2);
        document.getElementById('available-amount').innerText = availableToday.toFixed(2);
        document.getElementById('total-amount').innerText = remainingBudget.toFixed(2);
        document.getElementById('budget-end-date').innerText = lastDay.toLocaleDateString();
        totalBudget = budget;
    }
}

function checkUserData() {
    const telegramUserId = getTelegramUserId();
    if (!telegramUserId) {
        console.error('Не удалось получить ID пользователя Telegram');
        alert('Ошибка: Не удалось получить ID пользователя Telegram');
        showInitialScreen();
        return;
    }

    fetch('/api/get_user_data', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ telegram_id: telegramUserId }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            if (data.has_budget) {
                document.getElementById('budget').value = data.budget;
                document.getElementById('last-day').value = data.last_day;
                totalBudget = parseFloat(data.budget);
                totalExpenses = parseFloat(data.total_expenses);
                document.getElementById('daily-allowance').innerText = data.daily_allowance.toFixed(2);
                document.getElementById('available-amount').innerText = data.daily_allowance.toFixed(2);
                document.getElementById('total-amount').innerText = data.remaining_budget.toFixed(2);
                document.getElementById('budget-end-date').innerText = new Date(data.last_day).toLocaleDateString();
                goToMainScreen();
                loadExpenses();
            } else {
                showInitialScreen();
            }
        } else {
            console.error('Ошибка при получении данных пользователя');
            alert('Ошибка при получении данных пользователя');
            showInitialScreen();
        }
    })
    .catch(error => {
        console.error('Ошибка при отправке запроса:', error);
        alert('Произошла ошибка при получении данных пользователя');
        showInitialScreen();
    });
}

function updateDisplayedData(data) {
    document.getElementById('daily-allowance').innerText = data.daily_allowance.toFixed(2);
    document.getElementById('available-amount').innerText = data.daily_allowance.toFixed(2);
    document.getElementById('total-amount').innerText = data.remaining_budget.toFixed(2);
    document.getElementById('budget-end-date').innerText = new Date(data.last_day).toLocaleDateString();
    totalBudget = parseFloat(data.budget);
    totalExpenses = parseFloat(data.total_expenses);
}

function showInitialScreen() {
    document.getElementById('initial-screen').style.display = 'block';
    document.getElementById('main-screen').style.display = 'none';
}

function goToMainScreen() {
    document.getElementById('initial-screen').style.display = 'none';
    document.getElementById('main-screen').style.display = 'block';
    loadExpenses();
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
    vibrate('medium');
    document.getElementById('expenseModal').style.display = 'block';
}

function closeExpenseModal() {
    document.getElementById('expenseModal').style.display = 'none';
}

function addExpense() {
    const expenseAmount = parseFloat(document.getElementById('expense-amount').value);
    
    if (expenseAmount && !isNaN(expenseAmount) && expenseAmount > 0) {
        vibrate('medium');
        const today = new Date();
        const expense = {
            amount: expenseAmount,
            date: today.toISOString().split('T')[0],
            time: today.toTimeString().split(' ')[0]
        };

        expenses.push(expense);
        totalExpenses += expenseAmount;
        
        // Обновляем отображаемые данные
        updateDisplayedData();
        
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
        vibrate(['medium', 'medium', 'medium']); // Тройная вибрация при ошибке
        alert("Please enter a valid expense amount.");
    }
}

function renderExpenses() {
    const expenseList = document.getElementById('expense-list');
    expenseList.innerHTML = '';

    expenses.forEach((expense, index) => {
        const expenseItem = document.createElement('div');
        expenseItem.className = 'expense-item';
        expenseItem.innerHTML = `
            <div class="expense-date">${expense.date} в ${expense.time}</div>
            <div class="expense-amount">${expense.amount.toFixed(2)}</div>
        `;

        // Событие для ПК (правый клик мыши)
        expenseItem.addEventListener('contextmenu', function(event) {
            event.preventDefault();
            vibrate('medium');
            if (!isDeletePromptOpen) {
                isDeletePromptOpen = true;
                const confirmDelete = confirm("Вы действительно хотите удалить эту трату?");
                if (confirmDelete) {
                    vibrate('heavy');
                    deleteExpense(index);
                }
                isDeletePromptOpen = false;
            }
        });

        // Событие для мобильных устройств (удержание)
        let pressTimer;
        expenseItem.addEventListener('touchstart', function(event) {
            pressTimer = setTimeout(function() {
                vibrate('medium');
                if (!isDeletePromptOpen) {
                    isDeletePromptOpen = true;
                    const confirmDelete = confirm("Вы действительно хотите удалить эту трату?");
                    if (confirmDelete) {
                        vibrate('heavy');
                        deleteExpense(index);
                    }
                    isDeletePromptOpen = false;
                }
            }, 800);
        });

        expenseItem.addEventListener('touchend', function(event) {
            clearTimeout(pressTimer);
        });

        expenseList.appendChild(expenseItem);
    });
}

function showDeleteMenu(event, index) {
    const deleteMenu = document.getElementById('deleteMenu');
    deleteMenu.style.display = 'block';
    
    // Позиционируем меню рядом с элементом
    const rect = event.target.getBoundingClientRect();
    deleteMenu.style.top = `${rect.bottom}px`;
    deleteMenu.style.left = `${rect.left}px`;

    // Устанавливаем обработчик для кнопки удаления
    document.getElementById('deleteButton').onclick = function() {
        deleteExpense(index);
        hideDeleteMenu();
    };

    // Закрываем меню при клике вне его
    document.addEventListener('click', hideDeleteMenuOnClickOutside);
}

function hideDeleteMenu() {
    const deleteMenu = document.getElementById('deleteMenu');
    deleteMenu.style.display = 'none';
    document.removeEventListener('click', hideDeleteMenuOnClickOutside);
}

function hideDeleteMenuOnClickOutside(event) {
    const deleteMenu = document.getElementById('deleteMenu');
    if (!deleteMenu.contains(event.target)) {
        hideDeleteMenu();
    }
}

// Функция для удаления расхода по индексу
function deleteExpense(index) {
    if (index >= 0 && index < expenses.length) {
        const expenseToRemove = expenses[index];
        const telegramUserId = getTelegramUserId();
        
        // Отправляем запрос на удаление расхода на сервер
        fetch('/api/delete_expense', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                telegram_id: telegramUserId,
                expense_date: expenseToRemove.date,
                expense_time: expenseToRemove.time,
                expense_amount: expenseToRemove.amount
            }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                // Удаляем расход из локального массива
                expenses.splice(index, 1);
                totalExpenses -= expenseToRemove.amount;
                // Обновляем отображение данных
                updateDisplayedData();
                renderExpenses();
            } else {
                console.error('Error deleting expense:', data.message);
                alert('Ошибка при удалении траты. Пожалуйста, попробуйте еще раз.');
            }
        })
        .catch(error => {
            console.error('Error deleting expense:', error);
            alert('Произошла ошибка при удалении траты. Пожалуйста, попробуйте еще раз.');
        });
    }
}

// Открытие модального окна настроек
function openSettings() {
    vibrate('medium');
    // Копируем текущие значения в модальное окно
    document.getElementById('modal-budget').value = document.getElementById('budget').value;
    document.getElementById('modal-last-day').value = document.getElementById('last-day').value;
    calculateNewDailyAllowance();
    document.getElementById('settingsModal').style.display = 'block';
}

function closeModal() {
    document.getElementById('settingsModal').style.display = 'none';
}

// Расчет нового дневного лимита при изменении настроек
function calculateNewDailyAllowance() {
    const budget = parseFloat(document.getElementById('modal-budget').value);
    const lastDay = new Date(document.getElementById('modal-last-day').value);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    lastDay.setHours(23, 59, 59, 999);
    
    if (!isNaN(budget) && lastDay) {
        const daysDifference = Math.ceil((lastDay - today) / (1000 * 60 * 60 * 24)) + 1;
        const dailyAllowance = budget / daysDifference;
        document.getElementById('new-daily-allowance').innerText = dailyAllowance.toFixed(2);
    }
}

// Обновление настроек на сервере
function updateSettings() {
    const newBudget = parseFloat(document.getElementById('modal-budget').value);
    const newLastDay = document.getElementById('modal-last-day').value;
    const telegramUserId = getTelegramUserId();

    if (!telegramUserId) {
        console.error('Не удалось получить ID пользователя Telegram');
        alert('Ошибка: Не удалось получить ID пользователя Telegram');
        return;
    }

    // Отправляем запрос на обновление настроек
    fetch('/api/update_settings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            telegram_id: telegramUserId,
            budget: newBudget,
            last_day: newLastDay
        }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            // Обновляем значения в основном интерфейсе
            document.getElementById('budget').value = newBudget;
            document.getElementById('last-day').value = newLastDay;
            document.getElementById('daily-allowance').innerText = data.daily_allowance.toFixed(2);
            document.getElementById('total-amount').innerText = data.remaining_budget.toFixed(2);
            document.getElementById('budget-end-date').innerText = new Date(data.last_day).toLocaleDateString();
            
            updateDisplayedData();
            closeModal();
            vibrate('medium');
        } else {
            alert('Ошибка при обновлении настроек: ' + data.message);
        }
    })
    .catch(error => {
        console.error('Ошибка при отправке запроса:', error);
        alert('Произошла ошибка при обновлении настроек');
    });
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

function loadExpenses() {
    const telegramUserId = getTelegramUserId();
    if (!telegramUserId) {
        console.error('Не удалось получить ID пользователя Telegram');
        return;
    }

    fetch('/api/get_expenses', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ telegram_id: telegramUserId }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            expenses = data.expenses.map(expense => ({
                amount: parseFloat(expense.amount),
                date: expense.date,
                time: expense.time
            }));
            totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
            renderExpenses();
        } else {
            console.error('Ошибка при получении трат');
        }
    })
    .catch(error => {
        console.error('Ошибка при отправке запроса:', error);
    });
}

window.onclick = function(event) {
    if (event.target == document.getElementById('settingsModal')) {
        closeModal();
    }
    if (event.target == document.getElementById('expenseModal')) {
        closeExpenseModal();
    }
}

window.onload = function() {
    checkUserData();
    document.body.addEventListener('touchmove', preventBodyScroll, { passive: false });
};

function calculateBudgetPerDay(totalBudget, duration, expenses = []) {
    const remainingBudget = expenses.reduce(
        (budget, expense) => budget - expense.amount,
        totalBudget
    );
    return Math.round((100 * remainingBudget) / duration) / 100;
}

function handleStartButton() {
    vibrate('medium');
    const budget = parseFloat(document.getElementById('budget').value);
    const lastDay = new Date(document.getElementById('last-day').value);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Устанавливаем время на начало дня
    lastDay.setHours(23, 59, 59, 999); // Устанавливаем время на конец дня

    if (!isNaN(budget) && lastDay) {
        // Рассчитываем количество дней, включая начальный и конечный дни
        const daysDifference = Math.ceil((lastDay - today) / (1000 * 60 * 60 * 24));
        const dailyAllowance = budget / daysDifference;
        
        document.getElementById('daily-allowance').innerText = dailyAllowance.toFixed(2);
        document.getElementById('available-amount').innerText = dailyAllowance.toFixed(2);
        document.getElementById('total-amount').innerText = budget.toFixed(2);
        document.getElementById('budget-end-date').innerText = lastDay.toLocaleDateString();
        
        totalBudget = budget;
        totalExpenses = 0;
        expenses = [];
    }

    saveBudgetToServer();
    goToMainScreen();
}

function updateDisplayedData() {
    const budget = parseFloat(document.getElementById('budget').value);
    const lastDay = new Date(document.getElementById('last-day').value);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    lastDay.setHours(23, 59, 59, 999);
    
    if (!isNaN(budget) && lastDay) {
        const daysDifference = Math.ceil((lastDay - today) / (1000 * 60 * 60 * 24)) + 1;
        const dailyAllowance = calculateBudgetPerDay(budget, daysDifference, expenses);
        
        const todayExpenses = expenses
            .filter(exp => new Date(exp.date).toDateString() === today.toDateString())
            .reduce((sum, exp) => sum + exp.amount, 0);
        
        const availableToday = Math.max(0, dailyAllowance - todayExpenses);
        const remainingBudget = budget - totalExpenses;
        
        document.getElementById('daily-allowance').innerText = dailyAllowance.toFixed(2);
        document.getElementById('available-amount').innerText = availableToday.toFixed(2);
        document.getElementById('total-amount').innerText = remainingBudget.toFixed(2);
        document.getElementById('budget-end-date').innerText = lastDay.toLocaleDateString();
    }
}
