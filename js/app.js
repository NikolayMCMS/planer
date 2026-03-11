// Main App Controller
const App = {
    currentFilter: 'all',
    currentUserId: null,
    mergingTaskId: null,

    async init() {
        // Initialize Lucide icons
        lucide.createIcons();

        // Initialize DB
        await DB.init();

        // Initialize Flatpickr (Custom Calendar)
        this.datePicker = flatpickr("#task-date", {
            locale: "ru",
            altInput: true,
            altFormat: "j F Y",
            dateFormat: "Y-m-d",
            disableMobile: "true",
            theme: "dark"
        });

        // Setup Event Listeners
        this.bindEvents();

        // Check Login
        this.checkLogin();

        // Initial Render
        await this.renderUsers();
        await this.renderTasks();
    },

    bindEvents() {
        // Modal Closers (Universal)
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal-overlay');
                if (modal) this.toggleModal(modal.id, false);
            });
        });

        // Close on overlay click
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) this.toggleModal(overlay.id, false);
            });
        });

        document.getElementById('new-task-btn').addEventListener('click', () => {
            document.getElementById('task-modal-title').textContent = "Создать задачу";
            document.getElementById('edit-task-id').value = '';
            document.getElementById('task-form').reset();
            if (this.datePicker) this.datePicker.clear();
            this.toggleModal('task-modal', true);
        });

        // Task Form Submission
        document.getElementById('task-form').addEventListener('submit', (e) => this.handleAddTask(e));

        // Navigation Filters
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.currentFilter = e.currentTarget.dataset.filter;
                this.updateViewTitle();
                this.renderTasks();
            });
        });

        // Search
        document.getElementById('search-input').addEventListener('input', (e) => this.handleSearch(e.target.value));

        // Add User
        document.getElementById('add-user-trigger').addEventListener('click', () => this.handleAddUser());

        // Export/Import
        document.getElementById('export-btn').addEventListener('click', () => this.exportData());
        document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-file').click());
        document.getElementById('import-file').addEventListener('change', (e) => this.importData(e));

        // GitHub Auth
        document.getElementById('auth-settings-btn').addEventListener('click', () => this.openAuthModal());
        document.getElementById('auth-form').addEventListener('submit', (e) => this.handleAuth(e));
        document.getElementById('logout-btn').addEventListener('click', () => this.handleLogout());
        document.getElementById('exit-profile-btn').addEventListener('click', () => this.handleExitProfile());

        // User Management (Admin)
        document.getElementById('add-user-trigger').addEventListener('click', () => this.toggleModal('user-modal', true));
        document.getElementById('user-form').addEventListener('submit', (e) => this.handleCreateUser(e));

        // Drag and Drop
        this.initDraggable();

        // Automation
        const moderationBtn = document.getElementById('run-moderation-btn');
        if (moderationBtn) {
            moderationBtn.addEventListener('click', () => this.runModeration());
        }

        // Sync check
        this.checkAuth();
    },

    async renderUsers() {
        const users = await DB.getAllUsers();
        const list = document.getElementById('users-list');
        const select = document.getElementById('task-assignee');

        list.innerHTML = '';
        select.innerHTML = '<option value="">Без исполнителя</option>';

        users.forEach(user => {
            // Sidebar list
            const userEl = document.createElement('div');
            userEl.className = `user-item ${this.currentUserId == user.id ? 'active' : ''}`;

            let adminActions = '';
            if (this.currentUser && this.currentUser.role === 'admin') {
                adminActions = `
                    <div class="user-actions">
                        <button class="action-btn-small" onclick="event.stopPropagation(); App.openEditUser(${user.id})" title="Редактировать">
                            <i data-lucide="edit-3" size="12"></i>
                        </button>
                        ${user.id !== 1 ? `
                            <button class="action-btn-small delete" onclick="event.stopPropagation(); App.deleteUserAccount(${user.id})" title="Удалить">
                                <i data-lucide="user-minus" size="12"></i>
                            </button>
                        ` : ''}
                    </div>
                `;
            }

            userEl.innerHTML = `
                <div class="small-avatar" style="${user.id == 1 ? 'background: #f59e0b' : ''}">${user.avatar}</div>
                <div class="user-info-mini">
                    <span class="user-name">${user.name}</span>
                    <span class="user-role-badge">${user.role === 'admin' ? 'Админ' : ''}</span>
                </div>
                ${adminActions}
            `;
            userEl.onclick = () => this.switchUser(user.id, user.name, user.avatar);
            list.appendChild(userEl);

            // Modal select
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.name;
            select.appendChild(option);
        });

        // Set top bar profile if first run
        if (!this.currentUserId && users.length > 0 && !this.currentUser) {
            document.getElementById('current-user-name').textContent = "Все пользователи";
            document.getElementById('current-user-avatar').textContent = "?";
        }
    },

    async renderTasks(searchQuery = '') {
        const grid = document.getElementById('task-grid');
        const automationPanel = document.getElementById('automation-panel');

        if (this.currentFilter === 'automation') {
            grid.style.display = 'none';
            if (automationPanel) automationPanel.style.display = 'block';
            return;
        } else {
            grid.style.display = 'grid';
            if (automationPanel) automationPanel.style.display = 'none';
        }

        const tasks = await DB.getTasksByFilter(this.currentFilter, this.currentUserId);

        // Filter by search if needed
        const filteredTasks = searchQuery
            ? tasks.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()))
            : tasks;

        grid.innerHTML = '';

        if (filteredTasks.length === 0) {
            grid.innerHTML = '<div class="empty-state">Задач пока нет...</div>';
            return;
        }

        filteredTasks.forEach(task => {
            const card = document.createElement('div');
            card.className = `task-card glass ${task.completed ? 'completed' : ''} ${task.isImportant ? 'important-card' : ''}`;
            card.dataset.id = task.id;

            const now = new Date().toISOString().split('T')[0];
            const isToday = task.date === now;
            const dateStr = task.date ? new Date(task.date).toLocaleDateString('ru-RU') : 'Нет даты';

            const badges = `
                <div class="task-badges">
                    <div class="task-tag tag-${task.priority}">${this.translatePriority(task.priority)}</div>
                    ${isToday ? '<div class="task-tag tag-today">СЕГОДНЯ</div>' : ''}
                    ${task.isImportant ? '<div class="task-tag tag-important"><i data-lucide="star" size="10" style="display:inline; margin-right:2px"></i>ВАЖНО</div>' : ''}
                </div>
            `;

            card.innerHTML = `
                ${badges}
                <div class="task-title" style="${task.completed ? 'text-decoration: line-through; opacity: 0.6' : ''}">${task.title}</div>
                <p class="task-desc">${task.description || ''}</p>
                ${task.result ? `<div class="task-result-box"><strong>Результат:</strong> ${task.result}</div>` : ''}
                <div class="task-footer">
                    <div class="task-meta">
                        <i data-lucide="calendar" size="14"></i>
                        <span>${dateStr}</span>
                    </div>
                    <div class="task-actions">
                        <button class="action-btn" onclick="App.startMerge(${task.id})" title="Объединить">
                            <i data-lucide="layers"></i>
                        </button>
                        <button class="action-btn" onclick="App.toggleComplete(${task.id}, ${task.completed})" title="${task.completed ? 'Вернуть в работу' : 'Завершить'}">
                            <i data-lucide="${task.completed ? 'rotate-ccw' : 'check'}"></i>
                        </button>
                        <button class="action-btn" onclick="App.openEditTask(${task.id})" title="Редактировать">
                            <i data-lucide="edit-3"></i>
                        </button>
                        <button class="action-btn delete" onclick="App.deleteTask(${task.id})" title="Удалить">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });

        lucide.createIcons();
        this.updateStats();
    },

    async updateStats() {
        const stats = await DB.getStats();
        document.getElementById('count-today').textContent = stats.today;
        document.getElementById('count-today').style.display = stats.today > 0 ? 'flex' : 'none';

        document.getElementById('count-important').textContent = stats.important;
        document.getElementById('count-important').style.display = stats.important > 0 ? 'flex' : 'none';

        if (document.getElementById('count-closed')) {
            document.getElementById('count-closed').textContent = stats.closed;
            document.getElementById('count-closed').style.display = stats.closed > 0 ? 'flex' : 'none';
        }
    },

    async handleAddTask(e) {
        e.preventDefault();
        const taskId = document.getElementById('edit-task-id').value;
        const task = {
            title: document.getElementById('task-title').value,
            priority: document.getElementById('task-priority').value,
            date: document.getElementById('task-date').value,
            assigneeId: document.getElementById('task-assignee').value ? Number(document.getElementById('task-assignee').value) : null,
            description: document.getElementById('task-desc').value,
            result: document.getElementById('task-result').value,
            isImportant: document.getElementById('task-is-important').checked
        };

        try {
            if (taskId) {
                await DB.updateTask(taskId, task);
                console.log("Task updated:", taskId);
            } else {
                await DB.addTask(task);
                console.log("Task added");
            }

            this.toggleModal('task-modal', false);
            e.target.reset();
            document.getElementById('edit-task-id').value = '';
            await this.renderTasks();
            this.triggerSync();
        } catch (error) {
            console.error("Failed to save task:", error);
            alert("Ошибка при сохранении задачи: " + error.message);
        }
    },

    async openEditTask(id) {
        const task = await DB.getTaskById(id);
        if (!task) return;

        document.getElementById('task-modal-title').textContent = "Редактировать задачу";
        document.getElementById('edit-task-id').value = task.id;
        document.getElementById('task-title').value = task.title;
        document.getElementById('task-priority').value = task.priority;

        if (this.datePicker) {
            this.datePicker.setDate(task.date || '');
        } else {
            document.getElementById('task-date').value = task.date || '';
        }

        document.getElementById('task-assignee').value = task.assigneeId || '';
        document.getElementById('task-desc').value = task.description || '';
        document.getElementById('task-result').value = task.result || '';
        document.getElementById('task-is-important').checked = !!task.isImportant;

        this.toggleModal('task-modal', true);
    },

    async handleCreateUser(e) {
        e.preventDefault();
        const userId = document.getElementById('edit-user-id').value;
        const userData = {
            name: document.getElementById('new-user-name').value,
            role: document.getElementById('new-user-role').value,
            pin: document.getElementById('new-user-pin').value
        };

        if (userId) {
            await DB.updateUser(userId, userData);
            alert("Данные пользователя обновлены!");
        } else {
            await DB.addUser(userData);
            alert("Пользователь добавлен!");
        }

        this.toggleModal('user-modal', false);
        e.target.reset();
        document.getElementById('edit-user-id').value = '';
        await this.renderUsers();
        this.triggerSync();
    },

    async openEditUser(id) {
        const user = await DB.getUserById(id);
        if (!user) return;

        document.getElementById('user-modal-title').textContent = "Редактировать пользователя";
        document.getElementById('user-submit-btn').textContent = "Сохранить изменения";
        document.getElementById('edit-user-id').value = user.id;
        document.getElementById('new-user-name').value = user.name;
        document.getElementById('new-user-role').value = user.role;
        document.getElementById('new-user-pin').value = user.pin || '';

        this.toggleModal('user-modal', true);
    },

    async deleteUserAccount(id) {
        if (id === 1) {
            alert("Нельзя удалить главного администратора!");
            return;
        }

        if (confirm("Вы уверены, что хотите удалить этого пользователя? Все его привязки сохранятся, но он больше не сможет войти.")) {
            await DB.deleteUser(id);
            await this.renderUsers();
            this.triggerSync();
        }
    },

    async handleAddUser() {
        document.getElementById('user-modal-title').textContent = "Добавить пользователя";
        document.getElementById('user-submit-btn').textContent = "Добавить в систему";
        document.getElementById('edit-user-id').value = '';
        document.getElementById('user-form').reset();
        this.toggleModal('user-modal', true);
    },

    async toggleComplete(id, currentStatus) {
        try {
            await DB.updateTask(Number(id), { completed: currentStatus ? 0 : 1 });
            await this.renderTasks();
            this.triggerSync();
        } catch (error) {
            console.error("Failed to toggle task completion:", error);
            alert("Ошибка при изменении статуса задачи: " + error.message);
        }
    },

    async deleteTask(id) {
        if (confirm("Вы уверены, что хотите удалить эту задачу?")) {
            try {
                await DB.deleteTask(Number(id));
                await this.renderTasks();
                this.triggerSync();
            } catch (error) {
                console.error("Failed to delete task:", error);
                alert("Ошибка при удалении задачи: " + error.message);
            }
        }
    },

    toggleModal(id, show) {
        document.getElementById(id).style.display = show ? 'flex' : 'none';
    },

    switchUser(id, name, avatar) {
        if (this.currentUserId === id) {
            this.currentUserId = null;
            document.getElementById('current-user-name').textContent = "Все пользователи";
            document.getElementById('current-user-avatar').textContent = "?";
        } else {
            this.currentUserId = id;
            document.getElementById('current-user-name').textContent = name;
            document.getElementById('current-user-avatar').textContent = avatar;
        }

        // Update UI
        document.querySelectorAll('.user-item').forEach(el => {
            el.classList.toggle('active', el.textContent.includes(name) && this.currentUserId);
        });

        this.renderTasks();
    },

    startMerge(id) {
        if (this.mergingTaskId === id) {
            this.cancelMerge();
            return;
        }

        this.mergingTaskId = id;
        document.body.classList.add('merging-active');

        // Update UI to show instructions
        const grid = document.getElementById('task-grid');
        const cards = grid.querySelectorAll('.task-card');

        cards.forEach(card => {
            const cardId = Number(card.dataset.id);
            if (cardId === id) {
                card.classList.add('merging-source');
            } else {
                card.classList.add('merge-target');
                card.onclick = () => this.completeMerge(cardId);
            }
        });

        // Add a temporary ESC listener to cancel
        const escListener = (e) => {
            if (e.key === 'Escape') {
                this.cancelMerge();
                window.removeEventListener('keydown', escListener);
            }
        };
        window.addEventListener('keydown', escListener);

        console.log("Merge mode started for task:", id);
    },

    async completeMerge(targetId) {
        if (!this.mergingTaskId) return;

        const sourceTask = await DB.getTaskById(this.mergingTaskId);
        const targetTask = await DB.getTaskById(targetId);

        if (sourceTask && targetTask) {
            const confirmMerge = confirm(`Объединить задачу "${sourceTask.title}" в "${targetTask.title}"?`);
            if (confirmMerge) {
                const newDesc = (targetTask.description || '') +
                    "\n\n--- Объединено ---\n" +
                    "Заголовок: " + sourceTask.title + "\n" +
                    (sourceTask.description || '');

                const newResult = (targetTask.result || '') +
                    (sourceTask.result ? "\n---\n" + sourceTask.result : '');

                await DB.updateTask(targetId, {
                    description: newDesc,
                    result: newResult.trim()
                });

                await DB.deleteTask(this.mergingTaskId);
                console.log("Tasks merged successfully");
            }
        }

        this.cancelMerge();
        await this.renderTasks();
        this.triggerSync();
    },

    cancelMerge() {
        this.mergingTaskId = null;
        document.body.classList.remove('merging-active');
        document.querySelectorAll('.task-card').forEach(card => {
            card.classList.remove('merging-source', 'merge-target');
            card.onclick = null; // Reset click handlers
        });
        this.renderTasks(); // Re-render to restore original click handlers if any
    },

    handleSearch(query) {
        this.renderTasks(query);
    },

    updateViewTitle() {
        const titles = {
            'all': 'Все задачи',
            'today': 'Задачи на сегодня',
            'important': 'Важные задачи',
            'closed': 'Закрытые задачи',
            'automation': 'Автоматизация'
        };
        document.getElementById('view-title').textContent = titles[this.currentFilter] || 'Все задачи';
    },

    async runModeration() {
        const consoleEl = document.getElementById('console-output');
        const btn = document.getElementById('run-moderation-btn');

        if (!consoleEl || !btn) return;

        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Запуск...';
        lucide.createIcons();

        this.logToConsole("Запрос к серверу на запуск модерации...", "system");

        try {
            const response = await fetch('api.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'run_moderation' })
            });

            const result = await response.json();

            if (result.success) {
                this.logToConsole("Сервер ответил успешно.", "system");
                const lines = result.output.split('\n');
                for (const line of lines) {
                    await new Promise(r => setTimeout(r, 400)); // Имитация задержки вывода
                    this.logToConsole(line);
                }
            } else {
                this.logToConsole("Ошибка сервера: " + result.message, "error");
            }
        } catch (error) {
            this.logToConsole("Сетевая ошибка: " + error.message, "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="play"></i> Запустить скрипт';
            lucide.createIcons();
        }
    },

    logToConsole(text, type = 'normal') {
        const consoleEl = document.getElementById('console-output');
        if (!consoleEl) return;

        const line = document.createElement('div');
        line.className = `console-line ${type}`;
        line.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
        consoleEl.appendChild(line);
        consoleEl.scrollTop = consoleEl.scrollHeight;
    },

    async exportData() {
        const data = await DB.exportData();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `database.json`;
        a.click();
    },

    async importData(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const success = await DB.importData(event.target.result);
            if (success) {
                alert("Данные успешно импортированы!");
                await this.renderTasks();
                await this.renderUsers();
                this.triggerSync();
            } else {
                alert("Ошибка при импорте файла.");
            }
        };
        reader.readAsText(file);
    },

    // GitHub Auth Helpers
    checkAuth() {
        const config = localStorage.getItem('gh_sync_config');
        if (config) {
            const statusIcon = document.querySelector('#sync-status i');
            statusIcon.setAttribute('data-lucide', 'cloud');
            document.getElementById('sync-status').classList.add('sync-active');
            lucide.createIcons();
            this.triggerSync();
        }
    },

    openAuthModal() {
        const config = JSON.parse(localStorage.getItem('gh_sync_config') || '{}');
        document.getElementById('gh-user').value = config.user || '';
        document.getElementById('gh-repo').value = config.repo || '';
        document.getElementById('gh-token').value = config.token || '';

        if (config.token) {
            document.getElementById('logout-btn').style.display = 'block';
        }

        this.toggleModal('auth-modal', true);
    },

    async handleAuth(e) {
        e.preventDefault();
        const config = {
            user: document.getElementById('gh-user').value.trim(),
            repo: document.getElementById('gh-repo').value.trim(),
            token: document.getElementById('gh-token').value.trim()
        };

        localStorage.setItem('gh_sync_config', JSON.stringify(config));
        this.toggleModal('auth-modal', false);
        this.checkAuth();
        alert("GitHub подключен! Начинаю синхронизацию...");
    },

    // Auth & Roles Management
    async checkLogin() {
        const loggedId = sessionStorage.getItem('logged_user_id');
        if (!loggedId) {
            this.showLoginScreen();
        } else {
            const user = await DB.getUserById(loggedId);
            if (user) {
                this.currentUser = user;
                document.getElementById('current-user-name').textContent = user.name;
                document.getElementById('current-user-avatar').textContent = user.avatar;

                if (user.role === 'admin') {
                    document.body.classList.add('is-admin');
                }
            } else {
                this.showLoginScreen();
            }
        }
    },

    async showLoginScreen() {
        const screen = document.getElementById('login-screen');
        const list = document.getElementById('login-users');
        const users = await DB.getAllUsers();

        list.innerHTML = '';
        users.forEach(user => {
            const card = document.createElement('div');
            card.className = 'login-user-card';
            card.innerHTML = `
                <div class="avatar-large">${user.avatar}</div>
                <div class="user-name">${user.name}</div>
                <div class="user-role">${user.role === 'admin' ? 'Администратор' : 'Участник'}</div>
            `;
            card.onclick = () => this.handleLogin(user);
            list.appendChild(card);
        });

        screen.style.display = 'flex';
    },

    async handleLogin(user) {
        if (user.pin) {
            const pin = prompt(`Введите PIN для ${user.name}:`);
            if (pin !== user.pin) {
                alert("Неверный PIN!");
                return;
            }
        }

        sessionStorage.setItem('logged_user_id', user.id);
        location.reload();
    },

    handleLogout() {
        // Full reset of sync settings
        localStorage.removeItem('gh_sync_config');
        alert("Настройки GitHub удалены");
    },

    handleExitProfile() {
        sessionStorage.removeItem('logged_user_id');
        location.reload();
    },

    initDraggable() {
        const grid = document.getElementById('task-grid');
        new Sortable(grid, {
            animation: 150,
            ghostClass: 'task-ghost',
            onEnd: async () => {
                const taskCards = Array.from(grid.children);
                const updates = taskCards.map((card, index) => {
                    const id = Number(card.dataset.id);
                    if (id) {
                        return DB.updateTask(id, { order: index });
                    }
                });

                await Promise.all(updates);
                console.log("Task order updated in DB");
                this.updateStats();
                this.triggerSync();
            }
        });
    },

    async triggerSync() {
        // 1. Always sync to local database.json if running on OSPanel/PHP
        await DB.syncLocal();

        // 2. Sync to GitHub if configured
        const configStr = localStorage.getItem('gh_sync_config');
        if (!configStr) return;

        const config = JSON.parse(configStr);
        const statusEl = document.getElementById('sync-status');
        statusEl.style.opacity = '0.5';

        const success = await DB.syncWithGitHub(config);

        statusEl.style.opacity = '1';
        if (success) {
            console.log("GitHub Sync Successful");
        } else {
            console.error("GitHub Sync Failed");
        }
    },

    translatePriority(p) {
        const map = { 'high': 'Срочно', 'medium': 'Средний', 'low': 'Низкий' };
        return map[p] || p;
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
