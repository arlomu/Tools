const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const session = require('express-session');

const app = express();
const PORT = 3000;
const notesFilePath = path.join(__dirname, 'notes.json');
const usersFilePath = path.join(__dirname, 'users.json');
const uploadsDir = path.join(__dirname, 'uploads');

// Ensure uploads directory exists
fs.mkdir(uploadsDir, { recursive: true }).catch(console.error);

// Multer storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static(uploadsDir));

// Session middleware
app.use(session({
    secret: 'your_strong_secret_key_here_please_change_this',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

// Helper Functions
async function readData(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        console.error(`Error reading file ${filePath}:`, error);
        throw error;
    }
}

async function writeData(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// Authentication Middleware
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        return next();
    }
    if (req.originalUrl.startsWith('/api')) {
        return res.status(401).json({ success: false, error: 'Nicht authentifiziert.' });
    }
    res.redirect('/login');
}

// Routes
app.get('/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="de">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Login - Notizen App</title>
            <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600&display=swap" rel="stylesheet">
            <style>
                body {
                    font-family: 'Poppins', sans-serif;
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                    color: #fff;
                }
                .login-container {
                    background: rgba(255, 255, 255, 0.1);
                    padding: 40px;
                    border-radius: 15px;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
                    text-align: center;
                    width: 100%;
                    max-width: 400px;
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                }
                h1 {
                    margin-bottom: 25px;
                    font-weight: 600;
                    font-size: 2.2em;
                }
                .form-group {
                    margin-bottom: 20px;
                    text-align: left;
                }
                label {
                    display: block;
                    margin-bottom: 8px;
                    font-weight: 400;
                    font-size: 0.95em;
                }
                input[type="text"],
                input[type="password"] {
                    width: calc(100% - 24px);
                    padding: 12px;
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    border-radius: 8px;
                    background: rgba(255, 255, 255, 0.05);
                    color: #fff;
                    font-size: 1em;
                    transition: border-color 0.3s ease, background-color 0.3s ease;
                }
                input[type="text"]::placeholder,
                input[type="password"]::placeholder {
                    color: rgba(255, 255, 255, 0.6);
                }
                input[type="text"]:focus,
                input[type="password"]:focus {
                    outline: none;
                    border-color: rgba(255, 255, 255, 0.6);
                    background: rgba(255, 255, 255, 0.1);
                }
                button {
                    background: #fff;
                    color: #764ba2;
                    border: none;
                    padding: 12px 25px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 1.1em;
                    font-weight: 600;
                    transition: transform 0.2s ease, background-color 0.2s ease;
                    width: 100%;
                }
                button:hover {
                    transform: translateY(-2px);
                    background-color: #f0f0f0;
                }
                .message {
                    margin-top: 20px;
                    color: #ffdddd;
                    font-weight: 500;
                }
                .register-link {
                    margin-top: 20px;
                    font-size: 0.9em;
                }
                .register-link a {
                    color: #fff;
                    text-decoration: none;
                    font-weight: 600;
                    transition: opacity 0.2s ease;
                }
                .register-link a:hover {
                    opacity: 0.8;
                }
            </style>
        </head>
        <body>
            <div class="login-container">
                <h1>Willkommen</h1>
                <form action="/login" method="POST">
                    <div class="form-group">
                        <label for="username">Benutzername:</label>
                        <input type="text" id="username" name="username" required autocomplete="username">
                    </div>
                    <div class="form-group">
                        <label for="password">Passwort:</label>
                        <input type="password" id="password" name="password" required autocomplete="current-password">
                    </div>
                    <button type="submit">Anmelden</button>
                </form>
                ${req.query.error ? `<p class="message">${req.query.error}</p>` : ''}
                <p class="register-link">Noch kein Konto? <a href="/register">Hier registrieren</a></p>
            </div>
        </body>
        </html>
    `);
});

app.get('/register', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="de">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Registrierung - Notizen App</title>
            <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600&display=swap" rel="stylesheet">
            <style>
                body {
                    font-family: 'Poppins', sans-serif;
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                    color: #fff;
                }
                .register-container {
                    background: rgba(255, 255, 255, 0.1);
                    padding: 40px;
                    border-radius: 15px;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
                    text-align: center;
                    width: 100%;
                    max-width: 400px;
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                }
                h1 {
                    margin-bottom: 25px;
                    font-weight: 600;
                    font-size: 2.2em;
                }
                .form-group {
                    margin-bottom: 20px;
                    text-align: left;
                }
                label {
                    display: block;
                    margin-bottom: 8px;
                    font-weight: 400;
                    font-size: 0.95em;
                }
                input[type="text"],
                input[type="password"] {
                    width: calc(100% - 24px);
                    padding: 12px;
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    border-radius: 8px;
                    background: rgba(255, 255, 255, 0.05);
                    color: #fff;
                    font-size: 1em;
                    transition: border-color 0.3s ease, background-color 0.3s ease;
                }
                input[type="text"]::placeholder,
                input[type="password"]::placeholder {
                    color: rgba(255, 255, 255, 0.6);
                }
                input[type="text"]:focus,
                input[type="password"]:focus {
                    outline: none;
                    border-color: rgba(255, 255, 255, 0.6);
                    background: rgba(255, 255, 255, 0.1);
                }
                button {
                    background: #fff;
                    color: #764ba2;
                    border: none;
                    padding: 12px 25px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 1.1em;
                    font-weight: 600;
                    transition: transform 0.2s ease, background-color 0.2s ease;
                    width: 100%;
                }
                button:hover {
                    transform: translateY(-2px);
                    background-color: #f0f0f0;
                }
                .message {
                    margin-top: 20px;
                    color: #ffdddd;
                    font-weight: 500;
                }
                .login-link {
                    margin-top: 20px;
                    font-size: 0.9em;
                }
                .login-link a {
                    color: #fff;
                    text-decoration: none;
                    font-weight: 600;
                    transition: opacity 0.2s ease;
                }
                .login-link a:hover {
                    opacity: 0.8;
                }
            </style>
        </head>
        <body>
            <div class="register-container">
                <h1>Registrieren</h1>
                <form action="/register" method="POST">
                    <div class="form-group">
                        <label for="username">Benutzername:</label>
                        <input type="text" id="username" name="username" required autocomplete="username">
                    </div>
                    <div class="form-group">
                        <label for="password">Passwort:</label>
                        <input type="password" id="password" name="password" required autocomplete="new-password">
                    </div>
                    <button type="submit">Registrieren</button>
                </form>
                ${req.query.error ? `<p class="message">${req.query.error}</p>` : ''}
                <p class="login-link">Bereits registriert? <a href="/login">Hier anmelden</a></p>
            </div>
        </body>
        </html>
    `);
});

app.get('/', isAuthenticated, async (req, res) => {
    try {
        const users = await readData(usersFilePath);
        const currentUser = users.find(u => u.id === req.session.userId);
        res.send(generateMainHTML(currentUser ? currentUser.username : 'Benutzer'));
    } catch (error) {
        res.status(500).send('Fehler beim Laden der App.');
    }
});

// Authentication Routes
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const users = await readData(usersFilePath);
    const user = users.find(u => u.username === username);
    if (user && await bcrypt.compare(password, user.password)) {
        req.session.userId = user.id;
        res.redirect('/');
    } else {
        res.redirect('/login?error=Ungültiger Benutzername oder Passwort');
    }
});

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password || password.length < 4) {
        return res.redirect('/register?error=Benutzername und ein Passwort mit mind. 4 Zeichen sind erforderlich.');
    }
    const users = await readData(usersFilePath);
    if (users.find(u => u.username === username)) {
        return res.redirect('/register?error=Benutzername existiert bereits');
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = { id: uuidv4(), username, password: hashedPassword };
    users.push(newUser);
    await writeData(usersFilePath, users);
    req.session.userId = newUser.id;
    res.redirect('/');
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/');
        }
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

// User Settings API Route
app.put('/api/user/settings', isAuthenticated, async (req, res) => {
    const { currentPassword, newUsername, newPassword } = req.body;
    const users = await readData(usersFilePath);
    const userIndex = users.findIndex(u => u.id === req.session.userId);
    if (userIndex === -1) {
        return res.status(404).json({ success: false, error: 'Benutzer nicht gefunden.' });
    }

    if (!await bcrypt.compare(currentPassword, users[userIndex].password)) {
        return res.status(403).json({ success: false, error: 'Aktuelles Passwort ist falsch.' });
    }

    if (newUsername && newUsername !== users[userIndex].username) {
        if (users.some(u => u.username.toLowerCase() === newUsername.toLowerCase() && u.id !== req.session.userId)) {
            return res.status(409).json({ success: false, error: 'Dieser Benutzername ist bereits vergeben.' });
        }
        users[userIndex].username = newUsername;
    }

    if (newPassword) {
        if (newPassword.length < 4) {
            return res.status(400).json({ success: false, error: 'Das neue Passwort muss mindestens 4 Zeichen lang sein.' });
        }
        users[userIndex].password = await bcrypt.hash(newPassword, 10);
    }

    await writeData(usersFilePath, users);
    res.json({ success: true, newUsername: users[userIndex].username });
});

// Notes API Routes
app.get('/api/notes', isAuthenticated, async (req, res) => {
    try {
        const allNotes = await readData(notesFilePath);
        const userNotes = allNotes
            .filter(note => note.userId === req.session.userId)
            .sort((a, b) => (b.isPinned ? 1 : -1) - (a.isPinned ? 1 : -1) || new Date(b.created) - new Date(a.created));
        res.json(userNotes);
    } catch (error) {
        res.status(500).json({ success: false, error: 'Notizen konnten nicht geladen werden.' });
    }
});

app.get('/api/notes/:id', isAuthenticated, async (req, res) => {
    const allNotes = await readData(notesFilePath);
    const note = allNotes.find(n => n.id === req.params.id && n.userId === req.session.userId);
    if (note) {
        res.json(note);
    } else {
        res.status(404).json({ success: false, error: 'Notiz nicht gefunden.' });
    }
});

app.post('/api/notes', isAuthenticated, upload.array('images', 5), async (req, res) => {
    try {
        const { content, tags, color } = req.body;
        if (!content) {
            return res.status(400).json({ success: false, error: 'Inhalt ist erforderlich.' });
        }
        const newNote = {
            id: uuidv4(),
            userId: req.session.userId,
            content: content,
            tags: tags ? tags.split(',').map(tag => tag.trim()).filter(Boolean) : [],
            images: req.files ? req.files.map(file => file.filename) : [],
            created: new Date().toISOString(),
            isPinned: false,
            color: color || '#ffffff'
        };
        const notes = await readData(notesFilePath);
        notes.push(newNote);
        await writeData(notesFilePath, notes);
        res.status(201).json({ success: true, note: newNote });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Fehler beim Hinzufügen der Notiz.' });
    }
});

app.put('/api/notes/:id', isAuthenticated, upload.array('newImages', 5), async (req, res) => {
    try {
        const { id } = req.params;
        const { content, tags, color } = req.body;
        const notes = await readData(notesFilePath);
        const noteIndex = notes.findIndex(note => note.id === id && note.userId === req.session.userId);
        if (noteIndex === -1) {
            return res.status(404).json({ success: false, error: 'Notiz nicht gefunden.' });
        }
        notes[noteIndex].content = content ?? notes[noteIndex].content;
        notes[noteIndex].tags = tags ? tags.split(',').map(tag => tag.trim()).filter(Boolean) : notes[noteIndex].tags;
        notes[noteIndex].color = color ?? notes[noteIndex].color;

        if (req.files && req.files.length > 0) {
            notes[noteIndex].images.push(...req.files.map(file => file.filename));
        }
        await writeData(notesFilePath, notes);
        res.json({ success: true, note: notes[noteIndex] });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Fehler beim Aktualisieren der Notiz.' });
    }
});

app.delete('/api/notes/:id', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        let notes = await readData(notesFilePath);
        const noteToDelete = notes.find(note => note.id === id && note.userId === req.session.userId);
        if (!noteToDelete) {
            return res.status(404).json({ success: false, error: 'Notiz nicht gefunden.' });
        }

        if (noteToDelete.images && noteToDelete.images.length > 0) {
            for (const image of noteToDelete.images) {
                try {
                    await fs.unlink(path.join(uploadsDir, image));
                } catch (imgError) {
                    console.error(`Konnte Bild nicht löschen ${image}:`, imgError);
                }
            }
        }

        const updatedNotes = notes.filter(note => note.id !== id);
        await writeData(notesFilePath, updatedNotes);
        res.json({ success: true, message: 'Notiz gelöscht.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Fehler beim Löschen der Notiz.' });
    }
});

app.delete('/api/notes/:id/images/:filename', isAuthenticated, async (req, res) => {
    const { id, filename } = req.params;
    const notes = await readData(notesFilePath);
    const noteIndex = notes.findIndex(n => n.id === id && n.userId === req.session.userId);
    if (noteIndex === -1) {
        return res.status(404).json({ success: false, error: "Notiz nicht gefunden" });
    }
    const imageIndex = notes[noteIndex].images.indexOf(filename);
    if (imageIndex > -1) {
        notes[noteIndex].images.splice(imageIndex, 1);
        try {
            await fs.unlink(path.join(uploadsDir, filename));
            await writeData(notesFilePath, notes);
            res.json({ success: true });
        } catch(err) {
            res.status(500).json({ success: false, error: "Bild konnte nicht gelöscht werden" });
        }
    } else {
        res.status(404).json({ success: false, error: "Bild nicht in Notiz gefunden" });
    }
});

app.put('/api/notes/:id/pin', isAuthenticated, async (req, res) => {
    const notes = await readData(notesFilePath);
    const noteIndex = notes.findIndex(n => n.id === req.params.id && n.userId === req.session.userId);
    if (noteIndex > -1) {
        notes[noteIndex].isPinned = !notes[noteIndex].isPinned;
        await writeData(notesFilePath, notes);
        res.json({ success: true, isPinned: notes[noteIndex].isPinned });
    } else {
        res.status(404).json({ success: false, error: 'Notiz nicht gefunden.' });
    }
});

// HTML Generation Function
function generateMainHTML(username) {
    return `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Meine Notizen</title>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary-color: #667eea;
            --secondary-color: #764ba2;
            --light-bg: #f5f7fa;
            --dark-bg: #1a1a2e;
            --light-card-bg: #ffffff;
            --dark-card-bg: #22223b;
            --light-text-color: #333;
            --dark-text-color: #e0e0e0;
            --border-color: #e1e5e9;
            --dark-border-color: #3a3a4c;
            --shadow-light: 0 5px 15px rgba(0,0,0,0.08);
            --shadow-dark: 0 8px 25px rgba(0,0,0,0.4);
            --pinned-color: #ffc107;
        }
        body {
            font-family: 'Poppins', sans-serif;
            background: var(--light-bg);
            color: var(--light-text-color);
            transition: background-color 0.3s ease, color 0.3s ease;
            margin: 0;
        }
        body.dark-mode {
            background: var(--dark-bg);
            color: var(--dark-text-color);
        }
        body.dark-mode .note, body.dark-mode .modal-content, body.dark-mode .filter-tags-container {
            background: var(--dark-card-bg);
            border-color: var(--dark-border-color);
            box-shadow: var(--shadow-dark);
        }
        body.dark-mode input, body.dark-mode textarea {
            background-color: #3a3a4c;
            color: var(--dark-text-color);
            border: 1px solid var(--dark-border-color);
        }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem 2rem;
            background: var(--light-card-bg);
            border-radius: 12px;
            box-shadow: var(--shadow-light);
            margin-bottom: 2rem;
        }
        .header-title { font-size: 1.5rem; font-weight: 600; }
        .header-actions button {
            background: none; border: none; font-size: 1.5rem; cursor: pointer;
            margin-left: 15px; padding: 5px; color: var(--light-text-color);
        }
        body.dark-mode .header-actions button { color: var(--dark-text-color); }
        .controls-container {
            display: flex; gap: 1rem; margin-bottom: 2rem;
        }
        #search-input { flex-grow: 1; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; }
        .filter-tags-container {
            padding: 1rem; border-radius: 8px; box-shadow: var(--shadow-light);
            margin-bottom: 1rem;
        }
        .filter-tags-header { display: flex; gap: 1rem; margin-bottom: 1rem; }
        #tag-search-input { padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; }
        .filter-tags-list {
            display: flex;
            overflow-x: auto;
            padding-bottom: 10px;
            gap: 8px;
        }
        .filter-tag {
            flex-shrink: 0;
            padding: 5px 12px; border-radius: 15px; cursor: pointer; background: #eee;
            transition: background-color 0.2s;
        }
        .filter-tag.active { background: var(--primary-color); color: white; }
        #notes-container {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 1.5rem;
        }
        .note {
            background: var(--light-card-bg);
            border-radius: 8px; box-shadow: var(--shadow-light);
            padding: 1rem; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;
            border-left: 5px solid transparent;
        }
        .note:hover { transform: translateY(-5px); box-shadow: 0 8px 20px rgba(0,0,0,0.12); }
        .note-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
        .note-title { font-weight: 600; }
        .note-content-preview {
            height: 60px; overflow: hidden;
            mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
        }
        .note-pin { font-size: 1.2rem; color: #ccc; }
        .note.pinned .note-pin { color: var(--pinned-color); }
        .modal {
            display: none; position: fixed; z-index: 1000;
            left: 0; top: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.6);
            justify-content: center; align-items: center;
        }
        .modal.active { display: flex; }
        .modal-content {
            background: var(--light-card-bg);
            padding: 2rem; border-radius: 12px;
            width: 90%; max-width: 600px;
            max-height: 90vh; overflow-y: auto;
            position: relative;
        }
        .modal-close {
            position: absolute; top: 15px; right: 20px;
            font-size: 2rem; border: none; background: none; cursor: pointer;
        }
        .modal-content h2 { margin-top: 0; }
        .form-group { margin-bottom: 1rem; }
        .form-group label { display: block; margin-bottom: 5px; font-weight: 500; }
        .form-group input, .form-group textarea {
            width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px;
        }
        textarea { min-height: 150px; resize: vertical; }
        .image-previews { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
        .img-preview-container { position: relative; }
        .img-preview { width: 80px; height: 80px; object-fit: cover; border-radius: 5px; }
        .img-delete-btn {
            position: absolute; top: -5px; right: -5px;
            background: red; color: white; border: none; border-radius: 50%;
            width: 20px; height: 20px; cursor: pointer; font-weight: bold;
        }
        #viewNoteContent img { max-width: 100%; border-radius: 8px; margin-top: 1rem; }
        .view-actions { margin-top: 1.5rem; display: flex; gap: 1rem; justify-content: flex-end; }
        #create-note-btn {
            position: fixed; bottom: 30px; right: 30px;
            width: 60px; height: 60px;
            border-radius: 50%; border: none;
            background: var(--primary-color); color: white;
            font-size: 2rem;
            cursor: pointer; box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            display: flex; justify-content: center; align-items: center;
        }
    </style>
</head>
<body>
    <div class="container">
        <header class="header">
            <div class="header-title">Willkommen, ${username}!</div>
            <div class="header-actions">
                <button id="settings-btn" title="Einstellungen">⚙️</button>
                <button id="logout-btn" title="Abmelden">🚪</button>
            </div>
        </header>
        <div class="controls-container">
            <input type="text" id="search-input" placeholder="Notizen durchsuchen...">
        </div>
        <div id="filter-tags-container" class="filter-tags-container" style="display: none;">
            <div class="filter-tags-header">
                <input type="text" id="tag-search-input" placeholder="Tags suchen...">
            </div>
            <div id="filter-tags-list" class="filter-tags-list"></div>
        </div>
        <main id="notes-container"></main>
    </div>
    <button id="create-note-btn" title="Neue Notiz erstellen">+</button>
    <div id="note-modal" class="modal"></div>
    <div id="view-modal" class="modal"></div>
    <div id="settings-modal" class="modal"></div>
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            loadNotes();
            document.getElementById('create-note-btn').addEventListener('click', openCreateModal);
            document.getElementById('settings-btn').addEventListener('click', openSettingsModal);
            document.getElementById('logout-btn').addEventListener('click', logout);
            document.getElementById('search-input').addEventListener('input', handleSearch);
            document.getElementById('tag-search-input').addEventListener('input', handleTagSearch);
            document.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal')) {
                    e.target.classList.remove('active');
                }
            });
        });

        async function loadNotes() {
            try {
                const response = await fetch('/api/notes');
                if (!response.ok) throw new Error('Fehler beim Laden');
                const notes = await response.json();
                renderNotes(notes);
                renderFilterTags(notes);
            } catch(error) {
                console.error(error);
                document.getElementById('notes-container').innerHTML = '<p>Notizen konnten nicht geladen werden.</p>';
            }
        }

        function renderNotes(notes) {
            const container = document.getElementById('notes-container');
            if (notes.length === 0) {
                container.innerHTML = '<h2>Keine Notizen vorhanden. Erstelle deine erste!</h2>';
                return;
            }
            container.innerHTML = notes.map(note => \`
                <div class="note \${note.isPinned ? 'pinned' : ''}" data-note-id="\${note.id}" style="border-left-color: \${note.color};">
                    <div class="note-header">
                        <div class="note-title">\${note.content.substring(0, 30)}...</div>
                        <div class="note-pin" title="Notiz anpinnen/lösen">📌</div>
                    </div>
                    <div class="note-content-preview">\${note.content.replace(/\\n/g, '<br>')}</div>
                </div>
            \`).join('');
            document.querySelectorAll('.note').forEach(noteEl => {
                noteEl.querySelector('.note-pin').addEventListener('click', (e) => {
                    e.stopPropagation();
                    togglePin(noteEl.dataset.noteId);
                });
                noteEl.addEventListener('click', () => openViewModal(noteEl.dataset.noteId));
            });
        }

        function renderFilterTags(notes) {
            const allTags = [...new Set(notes.flatMap(note => note.tags))];
            const container = document.getElementById('filter-tags-container');
            const list = document.getElementById('filter-tags-list');

            if (allTags.length === 0) {
                container.style.display = 'none';
                return;
            }

            container.style.display = 'block';
            list.innerHTML = '<span class="filter-tag active" data-tag="">Alle</span>' + allTags.map(tag =>
                \`<span class="filter-tag" data-tag="\${tag}">#\${tag}</span>\`
            ).join('');

            document.querySelectorAll('.filter-tag').forEach(tagEl => {
                tagEl.addEventListener('click', () => handleTagFilter(tagEl));
            });
        }

        function openCreateModal() {
            const modal = document.getElementById('note-modal');
            modal.innerHTML = \`
                <div class="modal-content">
                    <button class="modal-close">&times;</button>
                    <h2>Neue Notiz erstellen</h2>
                    <form id="note-form">
                        <div class="form-group">
                            <label for="content">Inhalt</label>
                            <textarea name="content" required></textarea>
                        </div>
                        <div class="form-group">
                            <label for="tags">Tags (Komma-getrennt)</label>
                            <input type="text" name="tags">
                        </div>
                        <div class="form-group">
                            <label for="color">Farbe</label>
                            <input type="color" name="color" value="#ffffff">
                        </div>
                        <div class="form-group">
                            <label for="images">Bilder hochladen</label>
                            <input type="file" name="images" multiple>
                        </div>
                        <button type="submit" class="btn-primary">Speichern</button>
                    </form>
                </div>
            \`;
            modal.classList.add('active');
            modal.querySelector('.modal-close').addEventListener('click', () => modal.classList.remove('active'));
            modal.querySelector('form').addEventListener('submit', handleCreateSubmit);
        }

        async function handleCreateSubmit(e) {
            e.preventDefault();
            const form = e.target;
            const formData = new FormData(form);

            try {
                const response = await fetch('/api/notes', { method: 'POST', body: formData });
                if (!response.ok) throw new Error('Fehler');
                document.getElementById('note-modal').classList.remove('active');
                loadNotes();
            } catch(err) {
                alert('Speichern fehlgeschlagen.');
            }
        }

        async function togglePin(noteId) {
            try {
                const response = await fetch(\`/api/notes/\${noteId}/pin\`, { method: 'PUT' });
                if (!response.ok) throw new Error('Pin-Status konnte nicht geändert werden.');
                loadNotes();
            } catch (error) {
                console.error(error);
                alert(error.message);
            }
        }

        async function logout() {
            await fetch('/api/logout', { method: 'POST' });
            window.location.href = '/login';
        }

        function handleSearch(e) {
            const searchTerm = e.target.value.toLowerCase();
            document.querySelectorAll('.note').forEach(note => {
                const content = note.querySelector('.note-content-preview').textContent.toLowerCase();
                note.style.display = content.includes(searchTerm) ? '' : 'none';
            });
        }

        function handleTagSearch(e) {
            const searchTerm = e.target.value.toLowerCase();
            document.querySelectorAll('.filter-tag').forEach(tag => {
                const tagName = tag.textContent.toLowerCase();
                tag.style.display = tagName.includes(searchTerm) ? 'inline-block' : 'none';
            });
        }

        function handleTagFilter(tagEl) {
            const tag = tagEl.dataset.tag;
            document.querySelectorAll('.filter-tag').forEach(t => t.classList.remove('active'));
            tagEl.classList.add('active');
            document.querySelectorAll('.note').forEach(note => {
                const noteTags = note.dataset.tags ? note.dataset.tags.split(',') : [];
                if (tag === '' || noteTags.includes(tag)) {
                    note.style.display = '';
                } else {
                    note.style.display = 'none';
                }
            });
        }

        async function openViewModal(noteId) {
            try {
                const response = await fetch(\`/api/notes/\${noteId}\`);
                if (!response.ok) throw new Error('Notiz konnte nicht geladen werden.');
                const note = await response.json();
                const modal = document.getElementById('view-modal');
                modal.innerHTML = \`
                    <div class="modal-content">
                        <button class="modal-close">&times;</button>
                        <h2>Notiz anzeigen</h2>
                        <div id="viewNoteContent">\${note.content.replace(/\\n/g, '<br>')}</div>
                        \${note.images && note.images.length > 0 ? \`
                            <div class="image-previews">
                                \${note.images.map(image => \`
                                    <div class="img-preview-container">
                                        <img src="/uploads/\${image}" alt="Notizbild" class="img-preview">
                                    </div>
                                \`).join('')}
                            </div>
                        \` : ''}
                        <div class="view-actions">
                            <button onclick="openEditModal('\${note.id}')" class="btn-primary">Bearbeiten</button>
                            <button onclick="deleteNote('\${note.id}')" class="btn-primary">Löschen</button>
                        </div>
                    </div>
                \`;
                modal.classList.add('active');
                modal.querySelector('.modal-close').addEventListener('click', () => modal.classList.remove('active'));
            } catch (error) {
                console.error(error);
                alert(error.message);
            }
        }

        async function openEditModal(noteId) {
            try {
                const response = await fetch(\`/api/notes/\${noteId}\`);
                if (!response.ok) throw new Error('Notiz konnte nicht geladen werden.');
                const note = await response.json();
                const modal = document.getElementById('note-modal');
                modal.innerHTML = \`
                    <div class="modal-content">
                        <button class="modal-close">&times;</button>
                        <h2>Notiz bearbeiten</h2>
                        <form id="edit-note-form">
                            <input type="hidden" name="id" value="\${note.id}">
                            <div class="form-group">
                                <label for="content">Inhalt</label>
                                <textarea name="content" required>\${note.content}</textarea>
                            </div>
                            <div class="form-group">
                                <label for="tags">Tags (Komma-getrennt)</label>
                                <input type="text" name="tags" value="\${note.tags.join(', ')}">
                            </div>
                            <div class="form-group">
                                <label for="color">Farbe</label>
                                <input type="color" name="color" value="\${note.color}">
                            </div>
                            <div class="form-group">
                                <label for="newImages">Weitere Bilder hochladen</label>
                                <input type="file" name="newImages" multiple>
                            </div>
                            \${note.images && note.images.length > 0 ? \`
                                <div class="form-group">
                                    <label>Aktuelle Bilder</label>
                                    <div class="image-previews">
                                        \${note.images.map(image => \`
                                            <div class="img-preview-container">
                                                <img src="/uploads/\${image}" alt="Notizbild" class="img-preview">
                                                <button type="button" class="img-delete-btn" onclick="deleteImage('\${note.id}', '\${image}')">×</button>
                                            </div>
                                        \`).join('')}
                                    </div>
                                </div>
                            \` : ''}
                            <button type="submit" class="btn-primary">Speichern</button>
                        </form>
                    </div>
                \`;
                modal.classList.add('active');
                modal.querySelector('.modal-close').addEventListener('click', () => modal.classList.remove('active'));
                modal.querySelector('form').addEventListener('submit', handleEditSubmit);
            } catch (error) {
                console.error(error);
                alert(error.message);
            }
        }

        async function handleEditSubmit(e) {
            e.preventDefault();
            const form = e.target;
            const formData = new FormData(form);
            const noteId = formData.get('id');

            try {
                const response = await fetch(\`/api/notes/\${noteId}\`, { method: 'PUT', body: formData });
                if (!response.ok) throw new Error('Fehler beim Aktualisieren der Notiz.');
                document.getElementById('note-modal').classList.remove('active');
                loadNotes();
            } catch (err) {
                alert('Aktualisieren fehlgeschlagen.');
            }
        }

        async function deleteNote(noteId) {
            if (confirm('Möchtest du diese Notiz wirklich löschen?')) {
                try {
                    const response = await fetch(\`/api/notes/\${noteId}\`, { method: 'DELETE' });
                    if (!response.ok) throw new Error('Fehler beim Löschen der Notiz.');
                    document.getElementById('view-modal').classList.remove('active');
                    loadNotes();
                } catch (error) {
                    console.error(error);
                    alert(error.message);
                }
            }
        }

        async function deleteImage(noteId, filename) {
            if (confirm('Möchtest du dieses Bild wirklich löschen?')) {
                try {
                    const response = await fetch(\`/api/notes/\${noteId}/images/\${filename}\`, { method: 'DELETE' });
                    if (!response.ok) throw new Error('Fehler beim Löschen des Bildes.');
                    openEditModal(noteId);
                } catch (error) {
                    console.error(error);
                    alert(error.message);
                }
            }
        }

        function openSettingsModal() {
            const modal = document.getElementById('settings-modal');
            modal.innerHTML = \`
                <div class="modal-content">
                    <button class="modal-close">&times;</button>
                    <h2>Einstellungen</h2>
                    <form id="settings-form">
                        <div class="form-group">
                            <label for="currentPassword">Aktuelles Passwort</label>
                            <input type="password" name="currentPassword" required>
                        </div>
                        <div class="form-group">
                            <label for="newUsername">Neuer Benutzername</label>
                            <input type="text" name="newUsername">
                        </div>
                        <div class="form-group">
                            <label for="newPassword">Neues Passwort</label>
                            <input type="password" name="newPassword">
                        </div>
                        <button type="submit" class="btn-primary">Speichern</button>
                    </form>
                </div>
            \`;
            modal.classList.add('active');
            modal.querySelector('.modal-close').addEventListener('click', () => modal.classList.remove('active'));
            modal.querySelector('form').addEventListener('submit', handleSettingsSubmit);
        }

        async function handleSettingsSubmit(e) {
            e.preventDefault();
            const form = e.target;
            const formData = new FormData(form);
            const data = {
                currentPassword: formData.get('currentPassword'),
                newUsername: formData.get('newUsername'),
                newPassword: formData.get('newPassword')
            };

            try {
                const response = await fetch('/api/user/settings', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                if (!response.ok) throw new Error('Fehler beim Aktualisieren der Einstellungen.');
                const result = await response.json();
                alert('Einstellungen erfolgreich aktualisiert!');
                if (result.newUsername) {
                    document.querySelector('.header-title').textContent = \`Willkommen, \${result.newUsername}!\`;
                }
                document.getElementById('settings-modal').classList.remove('active');
            } catch (err) {
                alert('Aktualisieren der Einstellungen fehlgeschlagen.');
            }
        }
    </script>
</body>
</html>
    `;
}

app.listen(PORT, () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
});