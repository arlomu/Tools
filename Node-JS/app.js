const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const formidable = require('formidable');

// Pfade für Dateien
const DATA_FILE = 'data.json';
const PASSWORD_FILE = 'pw.json';
const UPLOAD_DIR = 'uploads';

// Erstellen des Upload-Verzeichnisses, falls es nicht existiert
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}

// Dateien initialisieren
function initializeFiles() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ notes: [] }, null, 2));
    console.log('data.json wurde erstellt');
  }

  if (!fs.existsSync(PASSWORD_FILE)) {
    const defaultPassword = crypto.randomBytes(8).toString('hex');
    fs.writeFileSync(PASSWORD_FILE, JSON.stringify({ password: defaultPassword }, null, 2));
    console.log('pw.json wurde erstellt mit Passwort: ' + defaultPassword);
  }
}

// Notizen laden
function loadNotes() {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data).notes || [];
  } catch (error) {
    console.error('Fehler beim Laden der Notizen:', error);
    return [];
  }
}

// Notizen speichern
function saveNotes(notes) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ notes }, null, 2));
    return true;
  } catch (error) {
    console.error('Fehler beim Speichern der Notizen:', error);
    return false;
  }
}

// Passwort laden
function loadPassword() {
  try {
    const data = fs.readFileSync(PASSWORD_FILE, 'utf8');
    return JSON.parse(data).password;
  } catch (error) {
    console.error('Fehler beim Laden des Passworts:', error);
    return null;
  }
}

// Session Management
const sessions = new Map();
function createSession() {
  const sessionId = crypto.randomBytes(32).toString('hex');
  sessions.set(sessionId, { created: Date.now() });
  return sessionId;
}

function validateSession(sessionId) {
  if (!sessionId || !sessions.has(sessionId)) return false;
  const session = sessions.get(sessionId);
  return (Date.now() - session.created) < 24 * 60 * 60 * 1000;
}

// HTML für die Webseite
function getLoginHTML() {
  return `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sichere Notizen</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .login-container {
            background: white;
            padding: 2rem;
            border-radius: 15px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            text-align: center;
            min-width: 300px;
        }
        h1 { color: #333; margin-bottom: 1.5rem; }
        input[type="password"] {
            width: 100%;
            padding: 12px;
            border: 2px solid #e1e5e9;
            border-radius: 8px;
            font-size: 16px;
            margin-bottom: 1rem;
            transition: border-color 0.3s;
        }
        input[type="password"]:focus {
            outline: none;
            border-color: #667eea;
        }
        button {
            width: 100%;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border: none;
            padding: 12px;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            transition: transform 0.2s;
        }
        button:hover { transform: translateY(-2px); }
        .error { color: #e74c3c; margin-top: 1rem; }
    </style>
</head>
<body>
    <div class="login-container">
        <h1>🔒 Sichere Notizen</h1>
        <form method="post" action="/login">
            <input type="password" name="password" placeholder="Passwort eingeben" required>
            <button type="submit">Anmelden</button>
        </form>
        <div class="error" id="error"></div>
    </div>
</body>
</html>`;
}

function getNotesHTML(notes) {
  const notesHtml = notes.map(function(note, index) {
    const formattedContent = note.content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');

    let imagesHtml = '';
    if (note.images && note.images.length > 0) {
      imagesHtml = note.images.map(function(image) {
        return `<img src="/${image}" style="max-width: 100%; height: auto; margin-top: 10px;">`;
      }).join('');
    }

    return `<div class="note" data-id="${index}">
        <div class="note-header">
            <span class="note-date">${new Date(note.created).toLocaleString('de-DE')}</span>
            <div class="note-actions">
                <button onclick="editNote(${index})" class="edit-btn">✏️</button>
                <button onclick="deleteNote(${index})" class="delete-btn">🗑️</button>
            </div>
        </div>
        <div class="note-content">${formattedContent}</div>
        ${imagesHtml}
        <div class="note-tags">${note.tags ? note.tags.map(function(tag) { return '#' + tag; }).join(' ') : ''}</div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Meine Notizen</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #f5f7fa;
            min-height: 100vh;
            padding: 20px;
        }
        .dark-mode body {
            background: #121212;
            color: #f5f5f5;
        }
        .dark-mode .note, .dark-mode .add-note-form, .dark-mode .search-form input, .dark-mode textarea {
            background: #1e1e1e;
            color: #f5f5f5;
            border-color: #333;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        .header {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            padding: 2rem;
            border-radius: 15px;
            margin-bottom: 2rem;
            text-align: center;
            position: relative;
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
        }
        .logout-btn:hover, .toggle-dark-mode:hover {
            background: rgba(255,255,255,0.3);
        }
        .logout-btn {
            right: 20px;
        }
        .toggle-dark-mode {
            left: 20px;
        }
        .add-note-form {
            background: white;
            padding: 1.5rem;
            border-radius: 10px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.08);
            margin-bottom: 2rem;
        }
        textarea {
            width: 100%;
            min-height: 120px;
            border: 2px solid #e1e5e9;
            border-radius: 8px;
            padding: 15px;
            font-size: 16px;
            font-family: inherit;
            resize: vertical;
            transition: border-color 0.3s;
        }
        textarea:focus {
            outline: none;
            border-color: #667eea;
        }
        .btn-primary {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border: none;
            padding: 12px 25px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            margin-top: 1rem;
            transition: transform 0.2s;
        }
        .btn-primary:hover {
            transform: translateY(-2px);
        }
        .notes-container {
            display: grid;
            gap: 1rem;
        }
        .note {
            background: white;
            border-radius: 10px;
            padding: 1.5rem;
            box-shadow: 0 5px 15px rgba(0,0,0,0.08);
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .note:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 30px rgba(0,0,0,0.15);
        }
        .note-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
            padding-bottom: 0.5rem;
            border-bottom: 2px solid #f8f9fa;
        }
        .note-date {
            color: #6c757d;
            font-size: 0.9rem;
        }
        .note-actions {
            display: flex;
            gap: 0.5rem;
        }
        .edit-btn, .delete-btn {
            background: none;
            border: none;
            font-size: 1.2rem;
            cursor: pointer;
            padding: 5px;
            border-radius: 5px;
            transition: background 0.2s;
        }
        .edit-btn:hover {
            background: #e3f2fd;
        }
        .delete-btn:hover {
            background: #ffebee;
        }
        .note-content {
            line-height: 1.6;
            color: #333;
            margin-bottom: 1rem;
        }
        .note-tags {
            color: #667eea;
            font-size: 0.9rem;
        }
        .empty-state {
            text-align: center;
            color: #6c757d;
            padding: 3rem;
            background: white;
            border-radius: 10px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.08);
        }
        .search-form {
            margin-bottom: 2rem;
            display: flex;
            gap: 1rem;
        }
        .search-input {
            flex: 1;
            padding: 12px;
            border: 2px solid #e1e5e9;
            border-radius: 8px;
            font-size: 16px;
        }
        .format-toolbar {
            margin-bottom: 1rem;
            display: flex;
            gap: 0.5rem;
        }
        .format-toolbar button {
            padding: 8px 12px;
            background: #e1e5e9;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <button class="toggle-dark-mode" onclick="toggleDarkMode()">🌙</button>
            <a href="/logout" class="logout-btn">Abmelden</a>
            <h1>📝 Meine Notizen</h1>
            <p>Sichere Notizen-Verwaltung</p>
        </div>

        <div class="search-form">
            <input type="text" class="search-input" id="searchInput" placeholder="Notizen durchsuchen...">
            <button onclick="searchNotes()" class="btn-primary">Suchen</button>
        </div>

        <div class="add-note-form">
            <div class="format-toolbar">
                <button type="button" onclick="formatText('bold')"><strong>B</strong></button>
                <button type="button" onclick="formatText('italic')"><em>I</em></button>
            </div>
            <form id="noteForm" enctype="multipart/form-data">
                <textarea name="content" id="noteContent" placeholder="Neue Notiz schreiben..." required></textarea>
                <input type="text" name="tags" id="noteTags" placeholder="Tags hinzufügen, z.B. Arbeit, Persönlich">
                <input type="file" name="images" id="noteImages" accept="image/*" multiple>
                <button type="button" onclick="addNote()" class="btn-primary">Notiz hinzufügen</button>
            </form>
        </div>

        <div class="notes-container">
            ${notes.length > 0 ? notesHtml : '<div class="empty-state"><h3>Keine Notizen vorhanden</h3><p>Erstelle deine erste Notiz oben!</p></div>'}
        </div>
    </div>

    <script>
        function editNote(id) {
            const noteElement = document.querySelector('[data-id="' + id + '"]');
            const content = noteElement.querySelector('.note-content').innerHTML
                .replace(/<br>/g, '\\n')
                .replace(/<strong>/g, '**')
                .replace(/<\\/strong>/g, '**')
                .replace(/<em>/g, '*')
                .replace(/<\\/em>/g, '*');
            const tags = noteElement.querySelector('.note-tags').textContent
                .replace(/#/g, '')
                .trim();

            document.getElementById('noteContent').value = content;
            document.getElementById('noteTags').value = tags;

            const form = document.getElementById('noteForm');
            form.onsubmit = function(event) {
                event.preventDefault();
                const updatedContent = document.getElementById('noteContent').value;
                const updatedTags = document.getElementById('noteTags').value;

                fetch('/notes/' + id, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content: updatedContent,
                        tags: updatedTags
                    })
                })
                .then(function(response) { return response.json(); })
                .then(function(data) {
                    if (data.success) {
                        location.reload();
                    } else {
                        alert('Fehler beim Bearbeiten der Notiz');
                    }
                });
            };
        }

        function deleteNote(id) {
            if (confirm('Notiz wirklich löschen?')) {
                fetch('/notes/' + id, { method: 'DELETE' })
                .then(function(response) { return response.json(); })
                .then(function(data) {
                    if (data.success) {
                        location.reload();
                    } else {
                        alert('Fehler beim Löschen der Notiz');
                    }
                });
            }
        }

        function searchNotes() {
            const searchTerm = document.getElementById('searchInput').value.toLowerCase();
            const notes = document.querySelectorAll('.note');

            notes.forEach(function(note) {
                const content = note.querySelector('.note-content').textContent.toLowerCase();
                const tags = note.querySelector('.note-tags').textContent.toLowerCase();

                if (content.includes(searchTerm) || tags.includes(searchTerm)) {
                    note.style.display = 'block';
                } else {
                    note.style.display = 'none';
                }
            });
        }

        function toggleDarkMode() {
            document.body.classList.toggle('dark-mode');
        }

        function formatText(type) {
            const textarea = document.getElementById('noteContent');
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const selectedText = textarea.value.substring(start, end);

            let formattedText;
            if (type === 'bold') {
                formattedText = '**' + selectedText + '**';
            } else if (type === 'italic') {
                formattedText = '*' + selectedText + '*';
            }

            textarea.value = textarea.value.substring(0, start) + formattedText + textarea.value.substring(end);
        }

        function addNote() {
            const formData = new FormData(document.getElementById('noteForm'));

            fetch('/notes', {
                method: 'POST',
                body: formData
            })
            .then(function(response) { return response.json(); })
            .then(function(data) {
                if (data.success) {
                    location.reload();
                } else {
                    alert('Fehler beim Hinzufügen der Notiz');
                }
            });
        }
    </script>
</body>
</html>`;
}

// URL Parser
function parseURL(url) {
  const urlParts = url.split('?');
  return { pathname: urlParts[0], query: urlParts[1] || '' };
}

// Cookie Parser
function parseCookies(cookieHeader) {
  const cookies = {};
  if (cookieHeader) {
    cookieHeader.split(';').forEach(function(cookie) {
      const [name, value] = cookie.trim().split('=');
      if (name && value) {
        cookies[name] = decodeURIComponent(value);
      }
    });
  }
  return cookies;
}

// Request Handler
function handleRequest(req, res) {
  const { pathname } = parseURL(req.url);
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies.sessionId;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (pathname === '/login' && req.method === 'POST') {
    let body = '';
    req.on('data', function(chunk) { body += chunk.toString(); });
    req.on('end', function() {
      const params = new URLSearchParams(body);
      const password = params.get('password');
      const correctPassword = loadPassword();

      if (password === correctPassword) {
        const newSessionId = createSession();
        res.writeHead(302, {
          'Location': '/notes',
          'Set-Cookie': 'sessionId=' + newSessionId + '; HttpOnly; SameSite=Strict; Max-Age=86400'
        });
        res.end();
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getLoginHTML().replace('<div class="error" id="error"></div>', '<div class="error">Falsches Passwort!</div>'));
      }
    });
    return;
  }

  if (pathname === '/logout') {
    if (sessionId) sessions.delete(sessionId);
    res.writeHead(302, {
      'Location': '/',
      'Set-Cookie': 'sessionId=; HttpOnly; SameSite=Strict; Max-Age=0'
    });
    res.end();
    return;
  }

  if (pathname.startsWith('/notes') && !validateSession(sessionId)) {
    res.writeHead(302, { 'Location': '/' });
    res.end();
    return;
  }

  if (pathname === '/notes') {
    if (req.method === 'GET') {
      const notes = loadNotes();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getNotesHTML(notes));
    } else if (req.method === 'POST') {
      const form = new formidable.IncomingForm();
      form.uploadDir = UPLOAD_DIR;
      form.keepExtensions = true;

      form.parse(req, function(err, fields, files) {
        if (err) {
          console.error('Error parsing files:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Fehler beim Parsen der Dateien' }));
          return;
        }

        const content = fields.content;
        const tags = fields.tags ? fields.tags.split(',').map(function(tag) { return tag.trim(); }) : [];

        let images = [];
        if (files.images) {
          if (Array.isArray(files.images)) {
            images = files.images.map(function(file) { return path.basename(file.path); });
          } else {
            images = [path.basename(files.images.path)];
          }
        }

        if (content.trim()) {
          const notes = loadNotes();
          notes.unshift({
            content: content.trim(),
            tags: tags,
            images: images,
            created: Date.now(),
            id: crypto.randomUUID()
          });
          saveNotes(notes);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      });
    }
    return;
  }

  const noteMatch = pathname.match(/^\/notes\/(\d+)$/);
  if (noteMatch) {
    const noteIndex = parseInt(noteMatch[1]);
    const notes = loadNotes();
    if (req.method === 'PUT') {
      let body = '';
      req.on('data', function(chunk) { body += chunk.toString(); });
      req.on('end', function() {
        try {
          const { content, tags } = JSON.parse(body);
          if (notes[noteIndex]) {
            notes[noteIndex].content = content;
            notes[noteIndex].tags = tags.split(',').map(function(tag) { return tag.trim(); });
            notes[noteIndex].updated = Date.now();
            const success = saveNotes(notes);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: success }));
          } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Notiz nicht gefunden' }));
          }
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Ungültige Daten' }));
        }
      });
    } else if (req.method === 'DELETE') {
      if (notes[noteIndex]) {
        notes.splice(noteIndex, 1);
        const success = saveNotes(notes);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: success }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Notiz nicht gefunden' }));
      }
    }
    return;
  }

  if (pathname.startsWith('/uploads/')) {
    const filePath = path.join(UPLOAD_DIR, pathname.replace('/uploads/', ''));
    if (fs.existsSync(filePath)) {
      fs.readFile(filePath, function(err, data) {
        if (err) {
          res.writeHead(500);
          res.end('Fehler beim Laden der Datei');
        } else {
          res.writeHead(200, { 'Content-Type': 'image/jpeg' });
          res.end(data);
        }
      });
    } else {
      res.writeHead(404);
      res.end('Datei nicht gefunden');
    }
    return;
  }

  if (pathname === '/') {
    if (validateSession(sessionId)) {
      res.writeHead(302, { 'Location': '/notes' });
      res.end();
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getLoginHTML());
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 - Seite nicht gefunden');
}

// Server starten
function startServer() {
  initializeFiles();
  const server = http.createServer(handleRequest);

  const PORT = 3000;
  server.listen(PORT, function() {
    console.log('🚀 Sichere Notizen-Webseite läuft auf: http://localhost:' + PORT);
    console.log('📁 Notizen werden gespeichert in: ' + DATA_FILE);
    console.log('🔐 Passwort-Datei: ' + PASSWORD_FILE);

    const password = loadPassword();
    if (password) {
      console.log('\n🔑 Aktuelles Passwort: ' + password);
    }
  });
}

startServer();
