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
        // Wenn bereits angemeldet, nicht auf Login-Seite zugreifen lassen
        if (req.path === '/login.html') {
            return res.redirect('/');
        }
        next();
    } else {
        // Wenn nicht angemeldet, nur Login-Seite erlauben
        if (req.path === '/login.html') {
            return next();
        }
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

// Routes - Auth Middleware für alle Routen außer Login
app.use((req, res, next) => {
    if (req.path === '/login' || req.path === '/login.html') {
        // Wenn bereits angemeldet, von Login weg umleiten
        if (req.session.user) {
            return res.redirect('/');
        }
        return next();
    }
    requireAuth(req, res, next);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
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

// ... restlicher Code bleibt gleich ...

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