const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const axios = require('axios');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Lade Konfiguration
let config;
try {
    const configFile = fs.readFileSync('config.yml', 'utf8');
    config = yaml.load(configFile);
} catch (e) {
    console.error('Fehler beim Laden der config.yml:', e);
    process.exit(1);
}

// System Monitoring Data
let systemStats = {
    cpu: 0,
    memory: { used: 0, total: 0 },
    uptime: 0,
    activeUsers: 0
};

// Session Middleware
app.use(session({
    secret: config.session_secret || 'default_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Admin Password Authentication Middleware
function requireAdminPassword(req, res, next) {
    const auth = req.headers.authorization;
    
    if (!auth || !auth.startsWith('Basic ')) {
        res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
        return res.status(401).send('Authentication required');
    }
    
    const credentials = Buffer.from(auth.slice(6), 'base64').toString();
    const [username, password] = credentials.split(':');
    
    if (username === 'admin' && password === config.admin.password) {
        next();
    } else {
        res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
        return res.status(401).send('Invalid credentials');
    }
}

// Benutzer-Datenbank
const USER_FILE = 'users.json';
const CHATS_FILE = 'chats.json';

function loadUsers() {
    try {
        if (fs.existsSync(USER_FILE)) {
            const data = fs.readFileSync(USER_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Fehler beim Laden der Benutzerdaten:', e);
    }
    return {};
}

function saveUsers(users) {
    try {
        fs.writeFileSync(USER_FILE, JSON.stringify(users, null, 2));
    } catch (e) {
        console.error('Fehler beim Speichern der Benutzerdaten:', e);
    }
}

function loadChats() {
    try {
        if (fs.existsSync(CHATS_FILE)) {
            const data = fs.readFileSync(CHATS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Fehler beim Laden der Chat-Daten:', e);
    }
    return {};
}

function saveChats(chats) {
    try {
        fs.writeFileSync(CHATS_FILE, JSON.stringify(chats, null, 2));
    } catch (e) {
        console.error('Fehler beim Speichern der Chat-Daten:', e);
    }
}

// Ollama Models laden
async function loadOllamaModels() {
    try {
        const response = await axios.get(`${config.ollama.host}/api/tags`);
        const models = {};
        
        response.data.models?.forEach(model => {
            models[model.name] = model.name;
        });
        
        return models;
    } catch (error) {
        console.error('Fehler beim Laden der Ollama-Modelle:', error.message);
        return { 'llama2': 'Llama 2' }; // Fallback
    }
}

// System Monitoring
function updateSystemStats() {
    if (!config.monitoring?.enabled) return;
    
    const cpuUsage = os.loadavg()[0] / os.cpus().length * 100;
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    systemStats = {
        cpu: Math.round(cpuUsage * 100) / 100,
        memory: {
            used: Math.round(usedMem / 1024 / 1024 / 1024 * 100) / 100,
            total: Math.round(totalMem / 1024 / 1024 / 1024 * 100) / 100
        },
        uptime: process.uptime(),
        activeUsers: Object.keys(connectedUsers).length
    };
}

// Connected Users Tracking
const connectedUsers = {};

// Token Reset Scheduler
function scheduleTokenReset() {
    const cron = require('node-cron');
    cron.schedule(config.token_reset_time || '0 0 * * *', () => {
        const users = loadUsers();
        Object.keys(users).forEach(username => {
            users[username].tokens_used_today = 0;
        });
        saveUsers(users);
        console.log('Token limits wurden zurückgesetzt');
    });
}

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Auth Middleware für normale Benutzer
function requireAuth(req, res, next) {
    if (req.session.user) {
        if (req.path === '/login.html') {
            return res.redirect('/');
        }
        next();
    } else {
        if (req.path === '/login.html') {
            return next();
        }
        res.redirect('/login.html');
    }
}

// Routes
app.use((req, res, next) => {
    if (req.path === '/login' || req.path === '/login.html') {
        if (req.session.user) {
            return res.redirect('/');
        }
        return next();
    }
    
    if (req.path.startsWith('/admin')) {
        return requireAdminPassword(req, res, next);
    }
    
    requireAuth(req, res, next);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', requireAdminPassword, (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const users = loadUsers();
    
    if (users[username] && bcrypt.compareSync(password, users[username].password)) {
        req.session.user = {
            username,
            max_tokens: users[username].max_tokens,
            tokens_used_today: users[username].tokens_used_today || 0
        };
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    }
});

app.post('/admin/create-user', requireAdminPassword, (req, res) => {
    const { username, password, max_tokens } = req.body;
    const users = loadUsers();
    
    if (users[username]) {
        return res.status(400).json({ error: 'Benutzer existiert bereits' });
    }
    
    users[username] = {
        password: bcrypt.hashSync(password, 10),
        max_tokens: parseInt(max_tokens),
        tokens_used_today: 0,
        personal_prompt: '',
        created_at: new Date().toISOString()
    };
    
    saveUsers(users);
    res.json({ success: true });
});

app.delete('/admin/delete-user/:username', requireAdminPassword, (req, res) => {
    const { username } = req.params;
    const users = loadUsers();
    
    if (!users[username]) {
        return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }
    
    delete users[username];
    saveUsers(users);
    res.json({ success: true });
});

app.get('/admin/users', requireAdminPassword, (req, res) => {
    const users = loadUsers();
    const userList = Object.keys(users).map(username => ({
        username,
        max_tokens: users[username].max_tokens,
        tokens_used_today: users[username].tokens_used_today || 0,
        created_at: users[username].created_at
    }));
    
    res.json(userList);
});

app.get('/admin/system-stats', requireAdminPassword, (req, res) => {
    res.json(systemStats);
});

app.post('/logout', (req, res) => {
    if (req.session.user) {
        delete connectedUsers[req.session.user.username];
    }
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/userinfo', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Nicht authentifiziert' });
    }
    
    const users = loadUsers();
    const user = users[req.session.user.username];
    res.json({
        username: req.session.user.username,
        tokens_remaining: user.max_tokens - (user.tokens_used_today || 0),
        max_tokens: user.max_tokens,
        personal_prompt: user.personal_prompt || ''
    });
});

app.post('/api/update-personal-prompt', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Nicht authentifiziert' });
    }
    
    const { personal_prompt } = req.body;
    const users = loadUsers();
    
    if (users[req.session.user.username]) {
        users[req.session.user.username].personal_prompt = personal_prompt;
        saveUsers(users);
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'Benutzer nicht gefunden' });
    }
});

// Socket.IO Events
io.on('connection', async (socket) => {
    console.log('Benutzer verbunden');
    
    // Modelle laden und senden
    const models = await loadOllamaModels();
    socket.emit('models_loaded', models);
    
    socket.on('authenticate', (sessionData) => {
        if (sessionData?.user) {
            connectedUsers[sessionData.user.username] = {
                socketId: socket.id,
                connectedAt: new Date()
            };
            socket.userId = sessionData.user.username;
        }
    });
    
    socket.on('send_message', async (data) => {
        const { message, selectedModel, chatId } = data;
        
        if (!socket.userId) {
            socket.emit('error', 'Nicht authentifiziert');
            return;
        }
        
        const users = loadUsers();
        const user = users[socket.userId];
        
        if (!user) {
            socket.emit('error', 'Benutzer nicht gefunden');
            return;
        }
        
        // Token-Limit prüfen
        const tokensUsed = user.tokens_used_today || 0;
        if (tokensUsed >= user.max_tokens) {
            socket.emit('token_limit_exceeded');
            return;
        }
        
        try {
            const startTime = Date.now();
            const responseId = uuidv4();
            
            // System Prompt erstellen
            let systemPrompt = config.system_prompt || '';
            if (user.personal_prompt) {
                systemPrompt += '\n\nPersonal Context:\n' + user.personal_prompt;
            }
            
            // Chat-Historie laden
            const chats = loadChats();
            const chatHistory = chats[`${socket.userId}_${chatId}`] || { messages: [] };
            
            // Neue Nachricht zur Historie hinzufügen
            chatHistory.messages.push({ role: 'user', content: message });
            
            // Ollama API Request
            const requestData = {
                model: selectedModel,
                prompt: message,
                system: systemPrompt,
                stream: true
            };
            
            const response = await axios.post(`${config.ollama.host}/api/generate`, requestData, {
                responseType: 'stream'
            });
            
            let fullResponse = '';
            let tokenCount = 0;
            
            response.data.on('data', (chunk) => {
                const lines = chunk.toString().split('\n').filter(line => line.trim());
                
                lines.forEach(line => {
                    try {
                        const data = JSON.parse(line);
                        
                        if (data.response) {
                            fullResponse += data.response;
                            tokenCount++;
                            
                            socket.emit('message_streaming', {
                                responseId,
                                content: fullResponse
                            });
                        }
                        
                        if (data.done) {
                            const endTime = Date.now();
                            const duration = Math.round((endTime - startTime) / 1000 * 10) / 10;
                            
                            // Chat-Historie speichern
                            chatHistory.messages.push({ 
                                role: 'assistant', 
                                content: fullResponse,
                                stats: { tokens: tokenCount, duration }
                            });
                            chats[`${socket.userId}_${chatId}`] = chatHistory;
                            saveChats(chats);
                            
                            // Token-Verbrauch aktualisieren
                            user.tokens_used_today = tokensUsed + tokenCount;
                            saveUsers(users);
                            
                            socket.emit('message_completed', {
                                content: fullResponse,
                                stats: {
                                    tokens: tokenCount,
                                    duration
                                }
                            });
                        }
                    } catch (e) {
                        // Ignore JSON parse errors for incomplete chunks
                    }
                });
            });
            
            response.data.on('error', (error) => {
                socket.emit('error', 'Fehler bei der KI-Antwort: ' + error.message);
            });
            
        } catch (error) {
            console.error('Ollama API Fehler:', error.message);
            socket.emit('error', 'Fehler bei der Verbindung zur KI: ' + error.message);
        }
    });
    
    socket.on('load_chat', (chatId) => {
        if (!socket.userId) return;
        
        const chats = loadChats();
        const chatKey = `${socket.userId}_${chatId}`;
        const chatData = chats[chatKey] || { messages: [] };
        
        // Alle Chats des Benutzers für die Seitenleiste laden
        const userChats = Object.keys(chats)
            .filter(key => key.startsWith(socket.userId + '_'))
            .map(key => {
                const id = key.split('_')[1];
                const chat = chats[key];
                return {
                    id,
                    name: chat.name || `Chat ${id}`,
                    updatedAt: chat.updatedAt || new Date().toISOString()
                };
            });
        
        socket.emit('chat_loaded', {
            chatId,
            chatData,
            chatList: userChats
        });
    });
    
    socket.on('create_chat', () => {
        if (!socket.userId) return;
        
        const newChatId = uuidv4().substring(0, 8);
        const chats = loadChats();
        const chatKey = `${socket.userId}_${newChatId}`;
        
        chats[chatKey] = {
            messages: [],
            name: `Neuer Chat`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        saveChats(chats);
        socket.emit('chat_created', newChatId);
    });
    
    socket.on('delete_chat', (chatId) => {
        if (!socket.userId) return;
        
        const chats = loadChats();
        const chatKey = `${socket.userId}_${chatId}`;
        
        if (chats[chatKey]) {
            delete chats[chatKey];
            saveChats(chats);
            socket.emit('chat_deleted', chatId);
        }
    });
    
    socket.on('reset_chat', (chatId) => {
        if (!socket.userId) return;
        
        const chats = loadChats();
        const chatKey = `${socket.userId}_${chatId}`;
        
        if (chats[chatKey]) {
            chats[chatKey].messages = [];
            chats[chatKey].updatedAt = new Date().toISOString();
            saveChats(chats);
        }
        
        socket.emit('chat_reset');
    });
    
    socket.on('disconnect', () => {
        if (socket.userId && connectedUsers[socket.userId]) {
            delete connectedUsers[socket.userId];
        }
        console.log('Benutzer getrennt');
    });
});

// System Monitoring starten
if (config.monitoring?.enabled) {
    setInterval(updateSystemStats, config.monitoring.update_interval || 5000);
    scheduleTokenReset();
}

// Server starten
const PORT = config.server.port || 3000;
server.listen(PORT, () => {
    console.log(`Tontoo AI Server läuft auf Port ${PORT}`);
    console.log(`Chat: http://localhost:${PORT}`);
    console.log(`Admin: http://localhost:${PORT}/admin`);
    console.log(`Admin Password: ${config.admin.password}`);
});

// Fehlerbehandlung
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});