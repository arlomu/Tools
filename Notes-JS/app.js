const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const yaml = require('js-yaml');

const app = express();
const HTTP_PORT = 80;
const HTTPS_PORT = 443;
const notesFilePath = path.join(__dirname, 'notes.json');
const usersFilePath = path.join(__dirname, 'users.json');
const uploadsDir = path.join(__dirname, 'uploads');
const configFilePath = path.join(__dirname, 'config.yml');

// SSL Konfiguration
const sslDir = path.join(__dirname, 'ssl');
const privateKeyPath = path.join(sslDir, 'privkey.pem');
const certificatePath = path.join(sslDir, 'cert.pem');

// Ensure directories exist
[uploadsDir, sslDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Load or create config
let config;
try {
  config = yaml.load(fs.readFileSync(configFilePath, 'utf8'));
} catch (e) {
  config = {
    session: {
      secret: crypto.randomBytes(64).toString('hex'),
      secure: true
    },
    ssl: {
      generated: false
    }
  };
  fs.writeFileSync(configFilePath, yaml.dump(config));
}

// Generate SSL certificate if not exists
if (!fs.existsSync(privateKeyPath)) {
  const { execSync } = require('child_process');
  try {
    console.log('Generating self-signed SSL certificate...');
    execSync(`openssl req -x509 -newkey rsa:4096 -keyout ${privateKeyPath} -out ${certificatePath} -days 365 -nodes -subj "/CN=localhost"`);
    config.ssl.generated = true;
    fs.writeFileSync(configFilePath, yaml.dump(config));
    console.log('SSL certificate generated successfully');
  } catch (err) {
    console.error('Failed to generate SSL certificate:', err);
    process.exit(1);
  }
}

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
// Serve static files from 'public' directory
app.use(express.static('public'));
app.use('/uploads', express.static(uploadsDir));

// Session middleware
app.use(session({
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: config.session.secure, 
    httpOnly: true, 
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Helper Functions
async function readData(filePath) {
  try {
    const data = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    console.error(`Error reading file ${filePath}:`, error);
    throw error;
  }
}

async function writeData(filePath, data) {
  await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// Authentication Middleware
function isAuthenticated(req, res, next) {
  if (req.session.userId) {
    return next();
  }
  if (req.originalUrl.startsWith('/api')) {
    return res.status(401).json({ success: false, error: 'Nicht authentifiziert.' });
  }
  res.redirect('/login.html');
}

// Routes for serving HTML files
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Changed from chat.html to notes.html
app.get('/notes.html', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'notes.html'));
});

app.get('/', (req, res) => {
  if (req.session.userId) {
    res.redirect('/notes.html'); // Redirect to notes.html
  } else {
    res.redirect('/login.html');
  }
});

// Authentication API Routes
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const users = await readData(usersFilePath);
  const user = users.find(u => u.username === username);
  if (user && await bcrypt.compare(password, user.password)) {
    req.session.userId = user.id;
    res.redirect('/notes.html'); // Redirect to notes.html
  } else {
    res.redirect('/login.html?error=Ungültiger Benutzername oder Passwort');
  }
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || password.length < 5) {
    return res.redirect('/register.html?error=Benutzername und ein Passwort mit mind. 5 Zeichen sind erforderlich.');
  }
  const users = await readData(usersFilePath);
  if (users.find(u => u.username === username)) {
    return res.redirect('/register.html?error=Benutzername existiert bereits');
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = { id: uuidv4(), username, password: hashedPassword };
  users.push(newUser);
  await writeData(usersFilePath, users);
  req.session.userId = newUser.id;
  res.redirect('/notes.html'); // Redirect to notes.html
});

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.redirect('/notes.html'); // Redirect to notes.html
    }
    res.clearCookie('connect.sid');
    res.redirect('/login.html');
  });
});

// User Settings API Route
app.put('/api/user/settings', isAuthenticated, async (req, res) => {
  const { currentPassword, newUsername, newPassword, confirmNewPassword } = req.body;
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
    if (newPassword.length < 5) {
      return res.status(400).json({ success: false, error: 'Das neue Passwort muss mindestens 5 Zeichen lang sein.' });
    }
    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({ success: false, error: 'Neues Passwort und Bestätigung stimmen nicht überein.' });
    }
    users[userIndex].password = await bcrypt.hash(newPassword, 10);
  }

  await writeData(usersFilePath, users);
  res.json({ success: true, newUsername: users[userIndex].username });
});

// User Info API Route (for username display)
app.get('/api/user', isAuthenticated, async (req, res) => {
  try {
    const users = await readData(usersFilePath);
    const user = users.find(u => u.id === req.session.userId);
    if (user) {
      res.json({ username: user.username });
    } else {
      res.status(404).json({ success: false, error: 'Benutzer nicht gefunden.' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Fehler beim Laden der Benutzerdaten.' });
  }
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
    const { content, color } = req.body;
    if (!content) {
      return res.status(400).json({ success: false, error: 'Inhalt ist erforderlich.' });
    }
    const newNote = {
      id: uuidv4(),
      userId: req.session.userId,
      content: content,
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
    const { content, color } = req.body;
    const notes = await readData(notesFilePath);
    const noteIndex = notes.findIndex(note => note.id === id && note.userId === req.session.userId);
    if (noteIndex === -1) {
      return res.status(404).json({ success: false, error: 'Notiz nicht gefunden.' });
    }
    notes[noteIndex].content = content ?? notes[noteIndex].content;
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
          await fs.promises.unlink(path.join(uploadsDir, image));
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
      await fs.promises.unlink(path.join(uploadsDir, filename));
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

// Start servers
try {
  const privateKey = fs.readFileSync(privateKeyPath);
  const certificate = fs.readFileSync(certificatePath);

  const credentials = {
    key: privateKey,
    cert: certificate
  };

  https.createServer(credentials, app).listen(HTTPS_PORT, () => {
    console.log(`HTTPS Server running on https://localhost:${HTTPS_PORT}`);
  });

  http.createServer((req, res) => {
    res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
    res.end();
  }).listen(HTTP_PORT, () => {
    console.log(`HTTP Server running on http://localhost:${HTTP_PORT} (redirects to HTTPS)`);
  });
} catch (err) {
  console.error('Failed to start HTTPS server:', err);
  process.exit(1);
}