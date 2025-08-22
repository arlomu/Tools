const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const axios = require('axios');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const { JSDOM } = require('jsdom');
const session = require('express-session');
const bcrypt = require('bcryptjs');

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

// Session Middleware
app.use(session({
    secret: config.session_secret || 'default_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 Stunden
}));

// Lade Modelle aus model.json
let models = {};
try {
    const modelsFile = fs.readFileSync('model.json', 'utf8');
    models = JSON.parse(modelsFile);
} catch (e) {
    console.error('Fehler beim Laden der model.json:', e);
    process.exit(1);
}

// Lade Benutzerdaten
const USER_FILE = 'users.json';

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
scheduleTokenReset();

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Auth Middleware
function requireAuth(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login.html');
    }
}

function requireAdmin(req, res, next) {
    if (req.session.user && req.session.user.isAdmin) {
        next();
    } else {
        res.status(403).send('Zugriff verweigert');
    }
}

// Routes
app.get('/', (req, res) => {
    if (req.session.user) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.redirect('/login.html');
    }
});

app.get('/admin.html', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const users = loadUsers();
    
    if (users[username] && bcrypt.compareSync(password, users[username].password)) {
        req.session.user = {
            username,
            isAdmin: users[username].isAdmin || false,
            max_tokens: users[username].max_tokens,
            tokens_used_today: users[username].tokens_used_today || 0
        };
        res.redirect('/');
    } else {
        res.status(401).send('Ungültige Anmeldedaten');
    }
});

app.post('/admin/create-user', requireAdmin, (req, res) => {
    const { username, password, max_tokens, isAdmin } = req.body;
    const users = loadUsers();
    
    if (users[username]) {
        return res.status(400).send('Benutzer existiert bereits');
    }
    
    users[username] = {
        password: bcrypt.hashSync(password, 10),
        max_tokens: parseInt(max_tokens),
        tokens_used_today: 0,
        isAdmin: isAdmin === 'on',
        personal_prompt: '',
        chats: {}
    };
    
    saveUsers(users);
    res.redirect('/admin.html');
});

app.post('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});

app.get('/api/userinfo', requireAuth, (req, res) => {
    const users = loadUsers();
    const user = users[req.session.user.username];
    res.json({
        username: req.session.user.username,
        tokens_remaining: user.max_tokens - (user.tokens_used_today || 0),
        max_tokens: user.max_tokens,
        personal_prompt: user.personal_prompt || ''
    });
});

app.post('/api/update-personal-prompt', requireAuth, (req, res) => {
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

// URL-Titel Funktion
async function getWebsiteTitle(url) {
    try {
        // Handle URL: prefix
        const cleanUrl = url.startsWith('URL:') ? url.substring(4).trim() : url;
        const fullUrl = cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`;
        
        const response = await axios.get(fullUrl, { 
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        const dom = new JSDOM(response.data);
        const title = dom.window.document.querySelector('title');
        return title ? title.textContent.trim() : cleanUrl;
    } catch (error) {
        return url;
    }
}

// Aktive Streams verwalten
const activeStreams = new Map();

io.on('connection', (socket) => {
    console.log('Neuer Client verbunden:', socket.id);

    // Authentifizierung für WebSocket
    socket.on('authenticate', (sessionId) => {
        // Hier müsste die Session-Überprüfung implementiert werden
        // Vereinfachte Implementierung für dieses Beispiel
        socket.emit('models_loaded', models);
    });

    socket.on('disconnect', () => {
        if (activeStreams.has(socket.id)) {
            activeStreams.get(socket.id).abort();
            activeStreams.delete(socket.id);
        }
    });

    socket.on('load_chat', (chatId = 'default') => {
        const users = loadUsers();
        const username = socket.request.session?.user?.username;
        
        if (!username || !users[username]) {
            socket.emit('error', 'Nicht authentifiziert');
            return;
        }
        
        if (!users[username].chats[chatId]) {
            users[username].chats[chatId] = {
                messages: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            saveUsers(users);
        }
        
        socket.emit('chat_loaded', {
            chatId,
            chatData: users[username].chats[chatId],
            chatList: Object.keys(users[username].chats).map(id => ({
                id,
                name: users[username].chats[id].name || `Chat ${id}`,
                updatedAt: users[username].chats[id].updatedAt
            }))
        });
    });

    socket.on('send_message', async (data) => {
        const { message, selectedModel, chatId = 'default' } = data;
        const users = loadUsers();
        const username = socket.request.session?.user?.username;
        
        if (!username || !users[username]) {
            socket.emit('error', 'Nicht authentifiziert');
            return;
        }
        
        // Token Limit prüfen
        const user = users[username];
        const remainingTokens = user.max_tokens - user.tokens_used_today;
        
        if (remainingTokens <= 0) {
            socket.emit('token_limit_exceeded');
            return;
        }
        
        let chatData = user.chats[chatId] || {
            messages: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        // Sicherstellen, dass messages Array existiert
        if (!Array.isArray(chatData.messages)) {
            chatData.messages = [];
        }
        
        chatData.messages.push({ role: 'user', content: message });
        chatData.updatedAt = new Date().toISOString();
        
        // Setze Chat-Namen basierend auf der ersten Nachricht, falls nicht vorhanden
        if (!chatData.name && chatData.messages.length === 1) {
            chatData.name = message.substring(0, 20);
        }
        
        users[username].chats[chatId] = chatData;
        saveUsers(users);
        
        if (activeStreams.has(socket.id)) {
            activeStreams.get(socket.id).abort();
            activeStreams.delete(socket.id);
        }

        const abortController = new AbortController();
        activeStreams.set(socket.id, abortController);

        try {
            const startTime = Date.now();
            let tokenCount = 0;
            let aiResponse = '';
            let responseId = Date.now();

            // Personal Prompt hinzufügen
            const personalPrompt = user.personal_prompt || '';
            const systemPrompt = config.system_prompt + (personalPrompt ? `\n${personalPrompt}` : '');

            const response = await axios.post(`${config.ollama.host || 'http://localhost:11434'}/api/chat`, {
                model: selectedModel,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...chatData.messages
                ],
                stream: true
            }, {
                responseType: 'stream',
                signal: abortController.signal,
                timeout: 120000 // 2 Minuten Timeout
            });

            response.data.on('data', async (chunk) => {
                const lines = chunk.toString().split('\n').filter(line => line.trim());
                
                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);
                        if (data.message?.content) {
                            aiResponse += data.message.content;
                            tokenCount++;
                            
                            socket.emit('message_streaming', {
                                responseId,
                                content: await formatMessage(aiResponse),
                                done: data.done || false
                            });
                        }

                        if (data.done) {
                            const endTime = Date.now();
                            const stats = {
                                tokens: tokenCount,
                                duration: ((endTime - startTime) / 1000).toFixed(2)
                            };
                            
                            // Token-Verbrauch aktualisieren
                            users[username].tokens_used_today += tokenCount;
                            chatData.messages.push({
                                role: 'assistant',
                                content: aiResponse,
                                stats: stats
                            });
                            chatData.updatedAt = new Date().toISOString();
                            users[username].chats[chatId] = chatData;
                            saveUsers(users);

                            socket.emit('message_completed', {
                                responseId,
                                content: await formatMessage(aiResponse),
                                stats
                            });
                            
                            activeStreams.delete(socket.id);
                        }
                    } catch (e) {
                        console.error('Fehler beim Parsen der Stream-Daten:', e);
                    }
                }
            });

            response.data.on('end', () => {
                if (activeStreams.has(socket.id)) {
                    activeStreams.delete(socket.id);
                }
            });

        } catch (error) {
            if (!axios.isCancel(error)) {
                console.error('Ollama Fehler:', error);
                socket.emit('error', 'Fehler bei der Kommunikation mit der AI');
            }
            if (activeStreams.has(socket.id)) {
                activeStreams.delete(socket.id);
            }
        }
    });

    socket.on('stop_generation', () => {
        if (activeStreams.has(socket.id)) {
            activeStreams.get(socket.id).abort();
            activeStreams.delete(socket.id);
            socket.emit('streaming_stopped');
        }
    });

    socket.on('reset_chat', (chatId = 'default') => {
        if (activeStreams.has(socket.id)) {
            activeStreams.get(socket.id).abort();
            activeStreams.delete(socket.id);
        }
        
        const users = loadUsers();
        const username = socket.request.session?.user?.username;
        
        if (username && users[username]) {
            users[username].chats[chatId] = { 
                messages: [], 
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            saveUsers(users);
            socket.emit('chat_reset');
        }
    });

    socket.on('delete_chat', (chatId) => {
        const users = loadUsers();
        const username = socket.request.session?.user?.username;
        
        if (username && users[username] && users[username].chats[chatId]) {
            delete users[username].chats[chatId];
            saveUsers(users);
            socket.emit('chat_deleted', chatId);
        }
    });

    socket.on('create_chat', () => {
        const users = loadUsers();
        const username = socket.request.session?.user?.username;
        
        if (username && users[username]) {
            const chatId = `chat_${Date.now()}`;
            users[username].chats[chatId] = {
                messages: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            saveUsers(users);
            socket.emit('chat_created', chatId);
        }
    });

    async function formatMessage(message) {
        let formatted = message;

        // Code-Blöcke mit Kopier-Button
        formatted = formatted.replace(/```(\w+)?\n?([\s\S]*?)```/g, (match, lang, code) => {
            const language = lang || 'text';
            const codeId = `code_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            return `<div class="code-block" data-lang="${language}">
                <div class="code-header">
                    <span class="code-lang">${language}</span>
                    <button class="copy-btn" onclick="copyCode('${codeId}')">
                        <i class="fas fa-copy"></i> Kopieren
                    </button>
                </div>
                <pre><code id="${codeId}" class="language-${language}">${code.trim()}</code></pre>
            </div>`;
        });

        // Inline-Code fett
        formatted = formatted.replace(/`([^`]+)`/g, '<strong class="inline-code">$1</strong>');

        // URLs zu anklickbaren Links (unterstützt URL: format)
        const urlRegex = /(https?:\/\/[^\s]+)|(URL:\s*([^\s]+))/gi;
        const urls = formatted.match(urlRegex) || [];
        
        for (const url of urls) {
            try {
                let cleanUrl = url.startsWith('URL:') ? url.substring(4).trim() : url;
                if (!cleanUrl.startsWith('http')) {
                    cleanUrl = `https://${cleanUrl}`;
                }
                
                const title = await getWebsiteTitle(cleanUrl);
                const displayUrl = url.startsWith('URL:') ? url.substring(4).trim() : url;
                const linkHtml = `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="url-link">
                    <i class="fas fa-external-link-alt"></i> ${title}
                </a>`;
                
                formatted = formatted.replace(url, linkHtml);
            } catch (e) {
                console.error('Fehler beim Formatieren der URL:', url, e);
            }
        }

        return formatted;
    }
});

const PORT = config.server.port || 3000;
server.listen(PORT, () => {
    console.log(`Tontoo AI Server läuft auf Port ${PORT}`);
    console.log(`Öffnen Sie http://localhost:${PORT} in Ihrem Browser`);
});

// Fehlerbehandlung
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});