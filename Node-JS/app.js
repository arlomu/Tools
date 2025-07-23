const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid'); // For unique IDs
const multer = require('multer'); // For file uploads
const bcrypt = require('bcryptjs'); // For password hashing
const session = require('express-session'); // For user sessions

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
app.use(express.static('public')); // Serve static files from 'public' directory
app.use('/uploads', express.static(uploadsDir)); // Serve uploaded images

// Session middleware
app.use(session({
    secret: 'your_strong_secret_key_here_please_change_this', // !!! Wichtig: Diesen Wert ändern und geheim halten !!!
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if using HTTPS (production)
}));

// --- Helper Functions ---

async function readNotes() {
    try {
        const data = await fs.readFile(notesFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return []; // File does not exist, return empty array
        }
        console.error('Error reading notes file:', error);
        throw error;
    }
}

async function writeNotes(notes) {
    await fs.writeFile(notesFilePath, JSON.stringify(notes, null, 2), 'utf8');
}

async function readUsers() {
    try {
        const data = await fs.readFile(usersFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return []; // File does not exist, return empty array
        }
        console.error('Error reading users file:', error);
        throw error;
    }
}

async function writeUsers(users) {
    await fs.writeFile(usersFilePath, JSON.stringify(users, null, 2), 'utf8');
}

// --- Authentication Middleware ---
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        return next();
    }
    res.redirect('/login');
}

// --- Routes ---

// Login Page
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

// Register Page
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

// Authentication Routes
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const users = await readUsers();
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
    const users = await readUsers();

    if (users.find(u => u.username === username)) {
        return res.redirect('/register?error=Benutzername existiert bereits');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = { id: uuidv4(), username, password: hashedPassword };
    users.push(newUser);
    await writeUsers(users);

    req.session.userId = newUser.id;
    res.redirect('/');
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/');
        }
        res.clearCookie('connect.sid'); // Clear session cookie
        res.redirect('/login');
    });
});

// Notes API Routes (Requires Authentication)
app.get('/', isAuthenticated, async (req, res) => {
    try {
        const allNotes = await readNotes();
        const userNotes = allNotes.filter(note => note.userId === req.session.userId);
        res.send(getNotesHTML(userNotes));
    } catch (error) {
        res.status(500).send('Error loading notes.');
    }
});

app.get('/notes', isAuthenticated, async (req, res) => {
    try {
        const allNotes = await readNotes();
        const userNotes = allNotes.filter(note => note.userId === req.session.userId);
        res.json(userNotes);
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to retrieve notes.' });
    }
});

app.post('/notes', isAuthenticated, upload.array('images', 5), async (req, res) => {
    try {
        const { content, tags } = req.body;
        if (!content) {
            return res.status(400).json({ success: false, error: 'Content is required.' });
        }

        const newNote = {
            id: uuidv4(),
            userId: req.session.userId,
            content: content,
            tags: tags ? tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0) : [],
            images: req.files ? req.files.map(file => file.filename) : [],
            created: new Date().toISOString()
        };

        const notes = await readNotes();
        notes.push(newNote);
        await writeNotes(notes);
        res.status(201).json({ success: true, note: newNote });
    } catch (error) {
        console.error('Error adding note:', error);
        res.status(500).json({ success: false, error: 'Failed to add note.' });
    }
});

app.put('/notes/:id', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const { content, tags } = req.body;
        const notes = await readNotes();
        const noteIndex = notes.findIndex(note => note.id === id && note.userId === req.session.userId);

        if (noteIndex === -1) {
            return res.status(404).json({ success: false, error: 'Note not found or you do not have permission.' });
        }

        notes[noteIndex].content = content || notes[noteIndex].content;
        notes[noteIndex].tags = tags ? tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0) : [];
        // Images are not updated via PUT for simplicity, would require separate handling

        await writeNotes(notes);
        res.json({ success: true, note: notes[noteIndex] });
    } catch (error) {
        console.error('Error updating note:', error);
        res.status(500).json({ success: false, error: 'Failed to update note.' });
    }
});

app.delete('/notes/:id', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        let notes = await readNotes();
        const initialLength = notes.length;
        const noteToDelete = notes.find(note => note.id === id && note.userId === req.session.userId);

        if (!noteToDelete) {
            return res.status(404).json({ success: false, error: 'Note not found or you do not have permission.' });
        }

        notes = notes.filter(note => !(note.id === id && note.userId === req.session.userId));

        if (notes.length === initialLength) {
             return res.status(404).json({ success: false, error: 'Note not found or you do not have permission.' });
        }

        if (noteToDelete.images && noteToDelete.images.length > 0) {
            for (const image of noteToDelete.images) {
                const imagePath = path.join(uploadsDir, image);
                try {
                    await fs.unlink(imagePath);
                    console.log(`Deleted image: ${image}`);
                } catch (imgError) {
                    console.error(`Failed to delete image ${image}:`, imgError);
                }
            }
        }

        await writeNotes(notes);
        res.json({ success: true, message: 'Note deleted successfully.' });
    } catch (error) {
        console.error('Error deleting note:', error);
        res.status(500).json({ success: false, error: 'Failed to delete note.' });
    }
});

// HTML Generation Function
function getNotesHTML(notes, currentFilter = '') {
    const notesHtml = notes.map(note => {
        const formattedContent = note.content
            .replace(/\*\*\*(.*?)\*\*\*/g, '<strong>$1</strong>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\|\|(.*?)\|\|/g, '<del>$1</del>')
            .replace(/\n/g, '<br>');

        const imagesHtml = (note.images && note.images.length > 0)
            ? note.images.map(image => `<img src="/uploads/${encodeURIComponent(image)}" alt="Notizbild" class="note-image">`).join('')
            : '';

        const tagsHtml = (note.tags && note.tags.length > 0)
            ? note.tags.map(tag => `<span class="note-tag" onclick="filterByTag('${tag}')">#${tag}</span>`).join(' ')
            : '';

        return `
        <div class="note" data-id="${note.id}" data-tags="${note.tags ? note.tags.join(',') : ''}" data-content="${note.content}">
            <div class="note-header">
                <span class="note-date">${new Date(note.created).toLocaleString('de-DE')}</span>
                <div class="note-actions">
                    <button class="icon-button edit-btn" onclick="editNote('${note.id}')" title="Notiz bearbeiten">✏️</button>
                    <button class="icon-button delete-btn" onclick="deleteNote('${note.id}')" title="Notiz löschen">🗑️</button>
                </div>
            </div>
            <div class="note-content">${formattedContent}</div>
            ${imagesHtml ? `<div class="note-images">${imagesHtml}</div>` : ''}
            ${tagsHtml ? `<div class="note-tags">${tagsHtml}</div>` : ''}
        </div>`;
    }).join('');

    return `<!DOCTYPE html>
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
            --light-card-bg: white;
            --dark-card-bg: #22223b;
            --light-text-color: #333;
            --dark-text-color: #e0e0e0;
            --border-color: #e1e5e9;
            --dark-border-color: #3a3a4c;
            --shadow-light: 0 5px 15px rgba(0,0,0,0.08);
            --shadow-dark: 0 8px 25px rgba(0,0,0,0.4);
            --gradient-primary: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Poppins', sans-serif;
            background: var(--light-bg);
            min-height: 100vh;
            padding: 20px;
            color: var(--light-text-color);
            transition: background-color 0.3s ease, color 0.3s ease;
            line-height: 1.6;
        }
        body.dark-mode {
            background: var(--dark-bg);
            color: var(--dark-text-color);
        }
        body.dark-mode .note,
        body.dark-mode .add-note-form,
        body.dark-mode .search-form input,
        body.dark-mode textarea,
        body.dark-mode .empty-state {
            background: var(--dark-card-bg);
            color: var(--dark-text-color);
            border-color: var(--dark-border-color);
            box-shadow: var(--shadow-dark);
        }
        body.dark-mode textarea {
            background-color: var(--dark-card-bg);
        }
        body.dark-mode .note-header {
            border-bottom-color: var(--dark-border-color);
        }
        body.dark-mode .note-date,
        body.dark-mode .note-tag {
            color: #b0b0d0;
        }
        body.dark-mode .icon-button:hover {
            background: rgba(255, 255, 255, 0.1);
        }
        body.dark-mode .format-toolbar button {
            background: #3a3a4c;
            color: var(--dark-text-color);
        }
        body.dark-mode .format-toolbar button:hover {
            background: #4a4a5c;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        .header {
            background: var(--gradient-primary);
            color: white;
            padding: 2rem;
            border-radius: 15px;
            margin-bottom: 2rem;
            text-align: center;
            position: relative;
            box-shadow: var(--shadow-light);
            overflow: hidden;
        }
        .header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="25" cy="25" r="15" fill="%23ffffff20"/><circle cx="75" cy="75" r="15" fill="%23ffffff20"/></svg>') repeat;
            opacity: 0.1;
            z-index: 0;
        }
        .header h1, .header p {
            position: relative;
            z-index: 1;
        }
        .logout-btn, .toggle-dark-mode {
            position: absolute;
            top: 20px;
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
            padding: 8px 15px;
            border-radius: 20px;
            cursor: pointer;
            text-decoration: none;
            font-weight: 600;
            transition: background 0.3s ease, transform 0.2s ease;
            display: flex;
            align-items: center;
            gap: 5px;
        }
        .logout-btn:hover, .toggle-dark-mode:hover {
            background: rgba(255,255,255,0.3);
            transform: translateY(-2px);
        }
        .logout-btn { right: 20px; }
        .toggle-dark-mode { left: 20px; }
        .search-form {
            margin-bottom: 2rem;
            display: flex;
            gap: 1rem;
            align-items: center;
        }
        .search-input {
            flex: 1;
            padding: 12px;
            border: 2px solid var(--border-color);
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s ease, background-color 0.3s ease, color 0.3s ease;
        }
        .search-input:focus {
            outline: none;
            border-color: var(--primary-color);
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
        }
        .filter-tags-container {
            margin-bottom: 1rem;
            padding: 1rem;
            background: var(--light-card-bg);
            border-radius: 10px;
            box-shadow: var(--shadow-light);
            transition: background-color 0.3s, color 0.3s;
        }
        body.dark-mode .filter-tags-container {
            background: var(--dark-card-bg);
            box-shadow: var(--shadow-dark);
        }
        .filter-tags-container h4 {
            margin-bottom: 0.8rem;
            color: var(--primary-color);
        }
        .filter-tags-list {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        .filter-tag {
            background: var(--primary-color);
            color: white;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 0.9em;
            cursor: pointer;
            transition: background-color 0.3s, transform 0.2s;
        }
        .filter-tag:hover {
            background: var(--secondary-color);
            transform: translateY(-2px);
        }
        .filter-tag.active {
            background: #28a745;
            font-weight: 600;
        }
        .clear-filter-btn {
            background: #dc3545;
            color: white;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 0.9em;
            cursor: pointer;
            border: none;
            transition: background-color 0.3s, transform 0.2s;
            margin-left: 10px;
        }
        .clear-filter-btn:hover {
            background: #c82333;
            transform: translateY(-2px);
        }
        .btn-primary {
            background: var(--gradient-primary);
            color: white;
            border: none;
            padding: 12px 25px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            margin-top: 1rem;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            font-weight: 600;
            box-shadow: 0 5px 15px rgba(118, 75, 162, 0.3);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(118, 75, 162, 0.4);
        }
        .icon-button {
            background: none;
            border: none;
            font-size: 1.2rem;
            cursor: pointer;
            padding: 8px;
            border-radius: 50%;
            transition: background 0.2s ease, transform 0.2s ease;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 38px;
            height: 38px;
        }
        .icon-button:hover {
            background: rgba(0, 0, 0, 0.05);
            transform: scale(1.1);
        }
        .add-note-form {
            background: var(--light-card-bg);
            padding: 1.5rem;
            border-radius: 10px;
            box-shadow: var(--shadow-light);
            margin-bottom: 2rem;
            transition: background-color 0.3s ease, color 0.3s ease;
        }
        textarea {
            width: 100%;
            min-height: 120px;
            border: 2px solid var(--border-color);
            border-radius: 8px;
            padding: 15px;
            font-size: 16px;
            font-family: inherit;
            resize: vertical;
            transition: border-color 0.3s ease, background-color 0.3s ease, color 0.3s ease;
        }
        textarea:focus {
            outline: none;
            border-color: var(--primary-color);
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
        }
        input[type="file"] {
            margin-top: 1rem;
            padding: 8px;
            border: 1px solid var(--border-color);
            border-radius: 5px;
            background: var(--light-bg);
            color: var(--light-text-color);
            transition: background-color 0.3s, color 0.3s;
        }
        body.dark-mode input[type="file"] {
            background: #333;
            color: var(--dark-text-color);
            border-color: #555;
        }
        .format-toolbar {
            margin-bottom: 1rem;
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
        }
        .format-toolbar button {
            padding: 8px 12px;
            background: var(--border-color);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            transition: background-color 0.3s ease, transform 0.1s ease;
            font-weight: 600;
        }
        .format-toolbar button:hover {
            background: #d1d5db;
            transform: translateY(-1px);
        }
        .progress-container {
            width: 80px;
            height: 80px;
            margin: 20px auto;
            border-radius: 50%;
            background: conic-gradient(var(--primary-color) 0%, transparent 0%);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            color: var(--primary-color);
            border: 4px solid var(--border-color);
            overflow: hidden;
            position: relative;
        }
        .progress-text {
            position: absolute;
            z-index: 1;
        }
        .notes-container {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 1.5rem;
        }
        .note {
            background: var(--light-card-bg);
            border-radius: 10px;
            padding: 1.5rem;
            box-shadow: var(--shadow-light);
            transition: transform 0.2s ease, box-shadow 0.2s ease, background-color 0.3s ease, color 0.3s ease;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        }
        .note:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 30px rgba(0,0,0,0.15);
        }
        .note-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 1rem;
            margin-bottom: 1rem;
        }
        .note-date {
            font-size: 0.85em;
            color: #666;
        }
        .note-actions {
            display: flex;
            gap: 0.5rem;
        }
        .note-content {
            word-wrap: break-word;
            flex-grow: 1;
        }
        .note-images {
            display: flex;
            gap: 10px;
            margin-top: 1rem;
            flex-wrap: wrap;
        }
        .note-image {
            max-width: 100px;
            max-height: 100px;
            border-radius: 5px;
            cursor: pointer;
            transition: transform 0.2s;
        }
        .note-image:hover {
            transform: scale(1.1);
        }
        .note-tags {
            margin-top: 1rem;
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
        }
        .note-tag {
            background: #eee;
            color: #555;
            padding: 3px 8px;
            border-radius: 15px;
            font-size: 0.8em;
            cursor: pointer;
            transition: background-color 0.2s ease;
        }
        .note-tag:hover {
            background-color: #ddd;
        }
        .empty-state {
            text-align: center;
            padding: 3rem;
            background: var(--light-card-bg);
            border-radius: 10px;
            box-shadow: var(--shadow-light);
            transition: background-color 0.3s, color 0.3s;
        }
        .empty-state h3 {
            margin-bottom: 0.5rem;
        }
        /* Modal for viewing images */
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            overflow: auto;
            background-color: rgba(0,0,0,0.9);
            justify-content: center;
            align-items: center;
        }
        .modal-content {
            max-width: 90%;
            max-height: 90%;
            display: block;
            margin: auto;
        }
        .close-modal {
            position: absolute;
            top: 20px;
            right: 35px;
            color: #f1f1f1;
            font-size: 40px;
            font-weight: bold;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <a href="/logout" class="logout-btn">Abmelden 🚪</a>
            <button class="toggle-dark-mode">🌙</button>
            <h1>Meine Notizen</h1>
            <p>Halte hier deine Gedanken und Ideen fest.</p>
        </div>
        
        <div id="filter-tags-container" class="filter-tags-container" style="display: none;">
            <h4>Nach Tags filtern:</h4>
            <div id="filter-tags-list" class="filter-tags-list"></div>
        </div>

        <form id="add-note-form" class="add-note-form">
            <div class="format-toolbar">
                <button type="button" onclick="formatText('bold')"><b>Fett</b></button>
                <button type="button" onclick="formatText('italic')"><i>Kursiv</i></button>
                <button type="button" onclick="formatText('strike')"><del>Durchgestrichen</del></button>
            </div>
            <textarea id="note-content" name="content" placeholder="Was gibt's Neues?" required></textarea>
            <input type="text" id="note-tags" name="tags" placeholder="Tags (Komma-getrennt), z.B. arbeit, privat">
            <input type="file" id="note-images" name="images" multiple accept="image/*">
            <input type="hidden" id="note-id" name="id">
            <button type="submit" class="btn-primary">Notiz speichern</button>
        </form>
        
        <div class="search-form">
             <input type="text" id="search-input" class="search-input" placeholder="Notizen durchsuchen...">
        </div>

        <div id="notes-container" class="notes-container">
            ${notes.length > 0 ? notesHtml : '<div class="empty-state"><h3>Keine Notizen gefunden</h3><p>Füge eine neue Notiz hinzu, um loszulegen!</p></div>'}
        </div>
    </div>

    <div id="imageModal" class="modal">
        <span class="close-modal" onclick="closeModal()">&times;</span>
        <img class="modal-content" id="modalImage">
    </div>
    
    <script>
        // Client-side JavaScript
        document.addEventListener('DOMContentLoaded', () => {
            const addNoteForm = document.getElementById('add-note-form');
            const searchInput = document.getElementById('search-input');
            const notesContainer = document.getElementById('notes-container');
            const darkModeToggle = document.querySelector('.toggle-dark-mode');
            let currentEditingId = null;

            // Load notes initially
            loadNotes();
            
            // Dark Mode
            if (localStorage.getItem('darkMode') === 'enabled') {
                document.body.classList.add('dark-mode');
                darkModeToggle.textContent = '☀️';
            }
            darkModeToggle.addEventListener('click', () => {
                document.body.classList.toggle('dark-mode');
                if (document.body.classList.contains('dark-mode')) {
                    localStorage.setItem('darkMode', 'enabled');
                    darkModeToggle.textContent = '☀️';
                } else {
                    localStorage.setItem('darkMode', 'disabled');
                    darkModeToggle.textContent = '🌙';
                }
            });

            // Form submission
            addNoteForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(addNoteForm);
                const id = formData.get('id');
                const url = id ? \`/notes/\${id}\` : '/notes';
                const method = id ? 'PUT' : 'POST';

                try {
                    const response = await fetch(url, {
                        method: method,
                        body: formData
                    });
                    
                    if (!response.ok && method === 'PUT') {
                        // If PUT fails, try a simpler JSON update for text content
                        const fallbackResponse = await fetch(url, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                content: formData.get('content'),
                                tags: formData.get('tags')
                            })
                        });
                        if (!fallbackResponse.ok) throw new Error('Update failed');

                    } else if (!response.ok) {
                         throw new Error('Request failed');
                    }

                    addNoteForm.reset();
                    document.getElementById('note-id').value = '';
                    addNoteForm.querySelector('button[type="submit"]').textContent = 'Notiz speichern';
                    await loadNotes();

                } catch (error) {
                    console.error('Error saving note:', error);
                    alert('Fehler beim Speichern der Notiz.');
                }
            });

            // Search functionality
            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                document.querySelectorAll('.note').forEach(note => {
                    const content = note.dataset.content.toLowerCase();
                    const tags = note.dataset.tags.toLowerCase();
                    note.style.display = (content.includes(searchTerm) || tags.includes(searchTerm)) ? '' : 'none';
                });
            });
        });

        async function loadNotes() {
            try {
                const response = await fetch('/notes');
                const notes = await response.json();
                const notesContainer = document.getElementById('notes-container');
                
                if (notes.length === 0) {
                     notesContainer.innerHTML = '<div class="empty-state"><h3>Keine Notizen gefunden</h3><p>Füge eine neue Notiz hinzu, um loszulegen!</p></div>';
                } else {
                    notesContainer.innerHTML = notes.map(note => getNoteHTML(note)).join('');
                }
                
                updateFilterTags(notes);
                
            } catch (error) {
                console.error('Error loading notes:', error);
            }
        }
        
        function getNoteHTML(note) {
            const formattedContent = note.content
                .replace(/\\*\\*\\*(.*?)\\*\\*\\*/g, '<strong>$1</strong>')
                .replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
                .replace(/\\*(.*?)\\*/g, '<em>$1</em>')
                .replace(/\\|\\|(.*?)\\|\\|/g, '<del>$1</del>')
                .replace(/\\n/g, '<br>');

            const imagesHtml = (note.images && note.images.length > 0)
                ? note.images.map(image => \`<img src="/uploads/\${encodeURIComponent(image)}" alt="Notizbild" class="note-image" onclick="openModal('/uploads/\${encodeURIComponent(image)}')">\`).join('')
                : '';

            const tagsHtml = (note.tags && note.tags.length > 0)
                ? note.tags.map(tag => \`<span class="note-tag" onclick="filterByTag('\${tag}')">#\${tag}</span>\`).join(' ')
                : '';
            
            return \`
            <div class="note" data-id="\${note.id}" data-tags="\${note.tags ? note.tags.join(',') : ''}" data-content="\${note.content}">
                <div class="note-header">
                    <span class="note-date">\${new Date(note.created).toLocaleString('de-DE')}</span>
                    <div class="note-actions">
                        <button class="icon-button edit-btn" onclick="editNote('\${note.id}')" title="Notiz bearbeiten">✏️</button>
                        <button class="icon-button delete-btn" onclick="deleteNote('\${note.id}')" title="Notiz löschen">🗑️</button>
                    </div>
                </div>
                <div class="note-content">\${formattedContent}</div>
                \${imagesHtml ? \`<div class="note-images">\${imagesHtml}</div>\` : ''}
                \${tagsHtml ? \`<div class="note-tags">\${tagsHtml}</div>\` : ''}
            </div>\`;
        }
        
        function updateFilterTags(notes) {
            const allTags = new Set(notes.flatMap(note => note.tags));
            const filterContainer = document.getElementById('filter-tags-container');
            const filterList = document.getElementById('filter-tags-list');
            
            if (allTags.size > 0) {
                filterList.innerHTML = '';
                allTags.forEach(tag => {
                    const tagEl = document.createElement('span');
                    tagEl.className = 'filter-tag';
                    tagEl.textContent = \`#\${tag}\`;
                    tagEl.onclick = () => filterByTag(tag);
                    filterList.appendChild(tagEl);
                });
                const clearButton = document.createElement('button');
                clearButton.className = 'clear-filter-btn';
                clearButton.textContent = 'Filter löschen';
                clearButton.onclick = () => filterByTag('');
                filterList.appendChild(clearButton);
                filterContainer.style.display = 'block';
            } else {
                filterContainer.style.display = 'none';
            }
        }
        
        function filterByTag(tag) {
            document.querySelectorAll('.note').forEach(note => {
                const tags = note.dataset.tags.split(',');
                note.style.display = (!tag || tags.includes(tag)) ? '' : 'none';
            });
            document.querySelectorAll('.filter-tag').forEach(tagEl => {
               if (tagEl.textContent === \`#\${tag}\`) {
                   tagEl.classList.add('active');
               } else {
                   tagEl.classList.remove('active');
               }
            });
             document.getElementById('search-input').value = '';
        }

        async function editNote(id) {
            const noteDiv = document.querySelector(\`.note[data-id="\${id}"]\`);
            if (!noteDiv) return;

            document.getElementById('note-id').value = id;
            document.getElementById('note-content').value = noteDiv.dataset.content;
            document.getElementById('note-tags').value = noteDiv.dataset.tags;
            
            const form = document.getElementById('add-note-form');
            form.querySelector('button[type="submit"]').textContent = 'Änderungen speichern';
            form.scrollIntoView({ behavior: 'smooth' });
        }

        async function deleteNote(id) {
            if (!confirm('Bist du sicher, dass du diese Notiz löschen möchtest?')) return;

            try {
                const response = await fetch(\`/notes/\${id}\`, { method: 'DELETE' });
                const result = await response.json();
                if (result.success) {
                    await loadNotes();
                } else {
                    throw new Error(result.error);
                }
            } catch (error) {
                console.error('Error deleting note:', error);
                alert('Fehler beim Löschen der Notiz.');
            }
        }
        
        function formatText(command) {
            const textarea = document.getElementById('note-content');
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const selectedText = textarea.value.substring(start, end);
            let replacement = selectedText;

            switch(command) {
                case 'bold':
                    replacement = \`**\${selectedText}**\`;
                    break;
                case 'italic':
                    replacement = \`*\${selectedText}*\`;
                    break;
                case 'strike':
                    replacement = \`||\${selectedText}||\`;
                    break;
            }
            textarea.setRangeText(replacement, start, end, 'end');
            textarea.focus();
        }

        function openModal(src) {
            const modal = document.getElementById('imageModal');
            const modalImg = document.getElementById('modalImage');
            modal.style.display = "flex";
            modalImg.src = src;
        }

        function closeModal() {
            document.getElementById('imageModal').style.display = "none";
        }
    </script>
</body>
</html>`;
}


// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});