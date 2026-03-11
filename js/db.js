// Initialize Dexie database
const db = new Dexie("PlanerDB");

// Define schema
db.version(3).stores({
    tasks: '++id, title, priority, date, assigneeId, completed, order',
    users: '++id, name, avatar, role, pin'
});

// Seed data function to provide initial users if none exist
async function seedData() {
    const userCount = await db.users.count();
    const taskCount = await db.tasks.count();

    if (userCount === 0 && taskCount === 0) {
        try {
            console.log("Attempting to load from database.json...");
            const response = await fetch('database.json');
            if (response.ok) {
                const data = await response.json();
                if (data.users) await db.users.bulkAdd(data.users);
                if (data.tasks) {
                    const tasksWithOrder = data.tasks.map((t, idx) => ({ ...t, order: t.order || idx }));
                    await db.tasks.bulkAdd(tasksWithOrder);
                }
                console.log("Data loaded from database.json");
                return;
            }
        } catch (e) {
            console.warn("Could not load database.json, using defaults", e);
        }

        // Fallback defaults
        await db.users.bulkAdd([
            { id: 1, name: 'Администратор', avatar: 'ADM', role: 'admin', pin: '1234' },
            { id: 2, name: 'Сотрудник', avatar: 'ST', role: 'user', pin: '' }
        ]);
        console.log("Database seeded with fallback defaults");
    }
}

// Export database operations for app.js
const DB = {
    async init() {
        try {
            await db.open();
            await seedData();
        } catch (e) {
            console.error("Critical: Could not initialize database", e);
            alert("Критическая ошибка: Не удалось открыть базу данных. Попробуйте очистить кэш браузера.");
        }
    },

    // Tasks API
    async getAllTasks() {
        return await db.tasks.orderBy('order').toArray();
    },

    async getTasksByFilter(filter, userId = null) {
        let collection = db.tasks;

        if (userId) {
            collection = collection.where('assigneeId').equals(Number(userId));
        } else {
            collection = collection.toCollection();
        }

        let tasks = await collection.toArray();
        tasks.sort((a, b) => (a.order || 0) - (b.order || 0));

        const now = new Date().toISOString().split('T')[0];

        switch (filter) {
            case 'today':
                return tasks.filter(t => t.date === now && !t.completed);
            case 'important':
                return tasks.filter(t => (t.isImportant || t.priority === 'high') && !t.completed);
            case 'closed':
                return tasks.filter(t => t.completed);
            case 'all':
            default:
                return tasks.filter(t => !t.completed);
        }
    },

    async getStats() {
        const tasks = await db.tasks.toArray();
        const now = new Date().toISOString().split('T')[0];
        return {
            today: tasks.filter(t => t.date === now && !t.completed).length,
            important: tasks.filter(t => (t.isImportant || t.priority === 'high') && !t.completed).length,
            closed: tasks.filter(t => t.completed).length
        };
    },

    async addTask(task) {
        const lastTask = await db.tasks.orderBy('order').last();
        const nextOrder = lastTask ? (lastTask.order || 0) + 1 : 0;
        
        return await db.tasks.add({
            ...task,
            completed: 0,
            order: nextOrder,
            createdAt: new Date()
        });
    },

    async updateTask(id, changes) {
        try {
            return await db.tasks.update(Number(id), changes);
        } catch (e) {
            console.error("DB Update Error:", e);
            throw e;
        }
    },

    async getTaskById(id) {
        try {
            return await db.tasks.get(Number(id));
        } catch (e) {
            console.error("DB Get Error:", e);
            return null;
        }
    },

    async deleteTask(id) {
        try {
            return await db.tasks.delete(Number(id));
        } catch (e) {
            console.error("DB Delete Error:", e);
            throw e;
        }
    },

    // Users API
    async getAllUsers() {
        return await db.users.toArray();
    },

    async addUser(userData) {
        const avatar = userData.name.charAt(0).toUpperCase();
        return await db.users.add({
            ...userData,
            avatar,
            role: userData.role || 'user'
        });
    },

    async getUserById(id) {
        return await db.users.get(Number(id));
    },

    async updateUser(id, changes) {
        return await db.users.update(Number(id), changes);
    },

    async deleteUser(id) {
        // Prevent deleting the main admin (id 1)
        if (Number(id) === 1) return false;
        return await db.users.delete(Number(id));
    },

    async exportData() {
        const tasks = await db.tasks.toArray();
        const users = await db.users.toArray();
        return JSON.stringify({ tasks, users }, null, 2);
    },

    async importData(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            await db.tasks.clear();
            await db.users.clear();
            if (data.tasks) await db.tasks.bulkAdd(data.tasks);
            if (data.users) await db.users.bulkAdd(data.users);
            return true;
        } catch (e) {
            console.error("Import failed", e);
            return false;
        }
    },

    async syncLocal() {
        try {
            const tasks = await db.tasks.toArray();
            const users = await db.users.toArray();
            const payload = { tasks, users };

            const response = await fetch('api.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Server returned ' + response.status);
            console.log("Local filesystem sync successful");
            return true;
        } catch (e) {
            console.warn("Local sync failed (optional):", e);
            return false;
        }
    },

    // GitHub Sync
    async syncWithGitHub(config) {
        const { user, repo, token } = config;
        const filePath = 'database.json';
        const url = `https://api.github.com/repos/${user}/${repo}/contents/${filePath}`;
        const headers = {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        };

        try {
            // 1. Get current remote data
            let remoteSha = null;
            let remoteData = { tasks: [], users: [] };

            const response = await fetch(url, { headers });
            if (response.ok) {
                const file = await response.json();
                remoteSha = file.sha;
                remoteData = JSON.parse(atob(file.content));
            }

            // 2. Merge data (simple merge: remote wins for conflicts, but we actually want to upload local)
            const localTasks = await db.tasks.toArray();
            const localUsers = await db.users.toArray();

            const payload = JSON.stringify({ tasks: localTasks, users: localUsers }, null, 2);

            // 3. Push to GitHub
            const pushData = {
                message: `Sync from Planer App - ${new Date().toISOString()}`,
                content: btoa(unescape(encodeURIComponent(payload))),
                sha: remoteSha
            };

            const pushResponse = await fetch(url, {
                method: 'PUT',
                headers,
                body: JSON.stringify(pushData)
            });

            return pushResponse.ok;
        } catch (e) {
            console.error("GitHub Sync Error:", e);
            return false;
        }
    }
};
