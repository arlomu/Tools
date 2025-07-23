const express = require('express');
const expressWs = require('express-ws');
const fs = require('fs');
const path = require('path');
const Docker = require('dockerode');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');

// Docker Client initialisieren
const docker = new Docker();
const app = express();
expressWs(app);

// Konfiguration
const PORT = process.env.PORT || 3000;
const LOG_FILE = path.join(__dirname, 'vm-logs.json');
const CONFIG_FILE = path.join(__dirname, 'vm-configs.json');

// Middleware
app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Dateien initialisieren
function initFiles() {
  if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '{}');
  if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, '{}');
  if (!fs.existsSync('views')) fs.mkdirSync('views');
  if (!fs.existsSync('public/css')) fs.mkdirSync('public/css', { recursive: true });
  if (!fs.existsSync('public/js')) fs.mkdirSync('public/js', { recursive: true });
}

// Standarddateien erstellen
function createDefaultFiles() {
  // index.ejs
  if (!fs.existsSync('views/index.ejs')) {
    fs.writeFileSync('views/index.ejs', `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Docker VM Manager</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <div class="sidebar">
        <div class="logo">
            <i class="fab fa-docker"></i>
            <span>Docker VM</span>
        </div>
        <nav>
            <ul>
                <li class="active"><a href="#"><i class="fas fa-server"></i> Dashboard</a></li>
                <li><a href="#"><i class="fas fa-plus-circle"></i> VM erstellen</a></li>
                <li><a href="#"><i class="fas fa-cog"></i> Einstellungen</a></li>
            </ul>
        </nav>
    </div>

    <div class="main-content">
        <header>
            <h1>Virtual Machine Manager</h1>
            <div class="user-profile">
                <img src="https://ui-avatars.com/api/?name=Admin&background=1e3a8a&color=fff" alt="User">
            </div>
        </header>

        <div class="content">
            <div class="card vm-controls">
                <h2><i class="fas fa-plus"></i> Neue VM erstellen</h2>
                <form id="create-vm-form">
                    <!-- Formular wird via JavaScript geladen -->
                </form>
            </div>

            <div class="card vm-list">
                <h2><i class="fas fa-list"></i> Ihre VMs</h2>
                <div id="containers-list" class="grid-container"></div>
            </div>

            <div class="card terminal-container" id="terminal-container" style="display: none;">
                <h2><i class="fas fa-terminal"></i> Terminal</h2>
                <div id="terminal" class="terminal-window"></div>
                <div class="terminal-input">
                    <input type="text" id="command-input" placeholder="Befehl eingeben...">
                    <button id="send-command" class="btn-primary"><i class="fas fa-paper-plane"></i> Senden</button>
                    <button id="clear-terminal" class="btn-secondary"><i class="fas fa-broom"></i> Leeren</button>
                </div>
            </div>
        </div>
    </div>

    <script src="/js/script.js"></script>
</body>
</html>`);
  }

  // style.css
  if (!fs.existsSync('public/css/style.css')) {
    fs.writeFileSync('public/css/style.css', `:root {
    --primary: #1e3a8a;
    --primary-dark: #172554;
    --secondary: #2563eb;
    --dark: #0f172a;
    --light: #f8fafc;
    --success: #10b981;
    --danger: #ef4444;
    --warning: #f59e0b;
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

body {
    background-color: var(--dark);
    color: var(--light);
    display: flex;
    min-height: 100vh;
}

.sidebar {
    width: 250px;
    background-color: var(--primary-dark);
    padding: 20px;
    transition: all 0.3s ease;
}

.logo {
    display: flex;
    align-items: center;
    margin-bottom: 30px;
    padding: 10px;
    color: white;
    font-size: 1.5rem;
    font-weight: bold;
}

.logo i {
    margin-right: 10px;
    font-size: 2rem;
}

nav ul {
    list-style: none;
}

nav ul li {
    margin-bottom: 10px;
    border-radius: 5px;
    transition: all 0.3s ease;
}

nav ul li:hover {
    background-color: rgba(255, 255, 255, 0.1);
}

nav ul li.active {
    background-color: var(--primary);
}

nav ul li a {
    display: flex;
    align-items: center;
    padding: 12px 15px;
    color: white;
    text-decoration: none;
}

nav ul li a i {
    margin-right: 10px;
}

.main-content {
    flex: 1;
    padding: 20px;
}

header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.user-profile img {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: cover;
}

.card {
    background-color: var(--primary-dark);
    border-radius: 10px;
    padding: 20px;
    margin-bottom: 20px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.card:hover {
    transform: translateY(-5px);
    box-shadow: 0 10px 15px rgba(0, 0, 0, 0.2);
}

.card h2 {
    margin-bottom: 20px;
    color: white;
    display: flex;
    align-items: center;
}

.card h2 i {
    margin-right: 10px;
}

.grid-container {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 20px;
}

.vm-card {
    background-color: var(--dark);
    border-radius: 8px;
    padding: 15px;
    border-left: 4px solid var(--secondary);
    transition: all 0.3s ease;
}

.vm-card:hover {
    transform: scale(1.02);
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
}

.vm-card h3 {
    color: white;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
}

.vm-card h3 i {
    margin-right: 8px;
    color: var(--secondary);
}

.vm-card p {
    margin-bottom: 8px;
    color: #94a3b8;
    font-size: 0.9rem;
}

.vm-actions {
    display: flex;
    gap: 10px;
    margin-top: 15px;
}

.btn {
    padding: 8px 15px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
}

.btn i {
    margin-right: 5px;
}

.btn-primary {
    background-color: var(--secondary);
    color: white;
}

.btn-primary:hover {
    background-color: #1d4ed8;
}

.btn-secondary {
    background-color: #334155;
    color: white;
}

.btn-secondary:hover {
    background-color: #475569;
}

.btn-success {
    background-color: var(--success);
    color: white;
}

.btn-danger {
    background-color: var(--danger);
    color: white;
}

.terminal-container {
    display: none;
}

.terminal-window {
    background-color: #0a0a0a;
    color: #00ff00;
    font-family: 'Courier New', monospace;
    padding: 15px;
    border-radius: 5px;
    height: 400px;
    overflow-y: auto;
    margin-bottom: 15px;
    white-space: pre-wrap;
}

.terminal-input {
    display: flex;
    gap: 10px;
}

.terminal-input input {
    flex: 1;
    background-color: #1e1e1e;
    border: 1px solid #333;
    color: white;
    padding: 10px;
    border-radius: 5px;
}

.status-running {
    color: var(--success);
}

.status-stopped {
    color: var(--danger);
}

.status-paused {
    color: var(--warning);
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}

.card, .vm-card {
    animation: fadeIn 0.5s ease forwards;
}

.tabs {
    display: flex;
    margin-bottom: 20px;
    border-bottom: 1px solid #334155;
}

.tab {
    padding: 10px 20px;
    cursor: pointer;
    color: #94a3b8;
    border-bottom: 3px solid transparent;
    transition: all 0.3s ease;
}

.tab:hover {
    color: white;
}

.tab.active {
    color: white;
    border-bottom-color: var(--secondary);
}

.tab-content {
    display: none;
    animation: fadeIn 0.3s ease;
}

.tab-content.active {
    display: block;
}

.form-group {
    margin-bottom: 20px;
}

.form-group label {
    display: block;
    margin-bottom: 8px;
    color: white;
}

.form-group input,
.form-group select {
    width: 100%;
    padding: 10px;
    background-color: #1e293b;
    border: 1px solid #334155;
    color: white;
    border-radius: 5px;
}

.form-row {
    display: flex;
    gap: 15px;
    margin-bottom: 15px;
}

.form-col {
    flex: 1;
}

.checkbox-group {
    margin: 20px 0;
}

.checkbox-item {
    margin: 10px 0;
    display: flex;
    align-items: center;
}

.checkbox-item input {
    margin-right: 10px;
}

.checkbox-item label {
    margin: 0;
    color: #94a3b8;
}

@media (max-width: 768px) {
    .sidebar {
        width: 80px;
    }

    .logo span {
        display: none;
    }

    nav ul li a span {
        display: none;
    }

    nav ul li a i {
        margin-right: 0;
        font-size: 1.2rem;
    }

    .grid-container {
        grid-template-columns: 1fr;
    }
}`);
  }

  // script.js
  if (!fs.existsSync('public/js/script.js')) {
    fs.writeFileSync('public/js/script.js', `document.addEventListener('DOMContentLoaded', function() {
    let currentContainerId = null;
    let socket = null;

    function setupTabs() {
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', function() {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

                this.classList.add('active');
                const tabId = this.getAttribute('data-tab');
                document.getElementById(tabId).classList.add('active');
            });
        });

        if (tabs.length > 0) tabs[0].click();
    }

    function loadCreateForm() {
        fetch('/create-form')
            .then(response => response.text())
            .then(html => {
                document.getElementById('create-vm-form').innerHTML = html;
                setupTabs();

                document.getElementById('create-vm-form').addEventListener('submit', function(e) {
                    e.preventDefault();
                    createVM();
                });
            });
    }

    function createVM() {
        const form = document.getElementById('create-vm-form');
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Erstelle...';
        submitBtn.disabled = true;

        fetch('/create-vm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                submitBtn.innerHTML = '<i class="fas fa-check"></i> Erfolg!';
                setTimeout(() => {
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                }, 2000);
                fetchContainers();
            } else {
                showError(data.error || 'VM konnte nicht erstellt werden');
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        })
        .catch(error => {
            showError(error.message);
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        });
    }

    function showError(message) {
        const errorEl = document.createElement('div');
        errorEl.className = 'error-message';
        errorEl.innerHTML = \`<i class="fas fa-exclamation-circle"></i> \${message}\`;
        errorEl.style.animation = 'fadeIn 0.3s ease';

        const form = document.getElementById('create-vm-form');
        form.prepend(errorEl);

        setTimeout(() => {
            errorEl.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => errorEl.remove(), 300);
        }, 5000);
    }

    function fetchContainers() {
        const containerList = document.getElementById('containers-list');
        containerList.style.opacity = '0.5';
        containerList.style.transition = 'opacity 0.3s ease';

        fetch('/containers')
            .then(response => response.json())
            .then(containers => {
                containerList.innerHTML = '';

                if (containers.length === 0) {
                    containerList.innerHTML = '<div class="empty-state"><i class="fas fa-server"></i><p>Keine VMs gefunden</p></div>';
                    return;
                }

                containers.forEach((container, index) => {
                    const containerCard = document.createElement('div');
                    containerCard.className = 'vm-card';
                    containerCard.style.animationDelay = \`\${index * 0.1}s\`;

                    const name = container.Names[0].replace('/', '');
                    const image = container.Image.split(':')[0];
                    const status = container.State;
                    const id = container.Id;

                    containerCard.innerHTML = \`
                        <h3><i class="fas fa-server"></i> \${name}</h3>
                        <p><strong>Image:</strong> \${image}</p>
                        <p><strong>Status:</strong> <span class="status-\${status}">\${status}</span></p>
                        <p><strong>Erstellt:</strong> \${new Date(container.Created * 1000).toLocaleString()}</p>
                        <div class="vm-actions">
                            <button onclick="connectToTerminal('\${id}')" class="btn btn-primary">
                                <i class="fas fa-terminal"></i> Terminal
                            </button>
                            <button onclick="startContainer('\${id}')" class="btn btn-success" \${status === 'running' ? 'disabled' : ''}>
                                <i class="fas fa-play"></i> Start
                            </button>
                            <button onclick="stopContainer('\${id}')" class="btn btn-warning" \${status !== 'running' ? 'disabled' : ''}>
                                <i class="fas fa-stop"></i> Stop
                            </button>
                            <button onclick="deleteContainer('\${id}')" class="btn btn-danger">
                                <i class="fas fa-trash"></i> Löschen
                            </button>
                        </div>
                    \`;

                    containerList.appendChild(containerCard);
                });

                containerList.style.opacity = '1';
            });
    }

    function connectToTerminal(containerId) {
        const terminalContainer = document.getElementById('terminal-container');
        const terminal = document.getElementById('terminal');

        if (window.socket) {
            window.socket.close();
        }

        terminalContainer.style.display = 'block';
        terminalContainer.style.animation = 'fadeIn 0.3s ease';
        terminal.innerHTML = '<span class="text-muted">Verbinde mit VM...</span>';
        currentContainerId = containerId;

        window.socket = new WebSocket(\`ws://\${window.location.host}/terminal/\${containerId}\`);

        window.socket.onopen = () => {
            terminal.innerHTML = '<span class="text-success">Mit VM verbunden</span><br><br>> ';
        };

        window.socket.onmessage = (msg) => {
            terminal.innerHTML += msg.data;
            terminal.scrollTop = terminal.scrollHeight;
        };

        window.socket.onerror = (error) => {
            terminal.innerHTML += \`<span class="text-danger">Fehler: \${error.message || 'Verbindung fehlgeschlagen'}</span>\`;
        };

        window.socket.onclose = () => {
            terminal.innerHTML += '<br><span class="text-muted">Verbindung geschlossen</span>';
        };
    }

    function sendCommand() {
        const input = document.getElementById('command-input');
        if (window.socket && window.socket.readyState === WebSocket.OPEN && input.value.trim()) {
            window.socket.send(input.value + '\\n');
            input.value = '';
        }
    }

    window.connectToTerminal = connectToTerminal;
    window.startContainer = function(containerId) {
        const btn = document.querySelector(\`button[onclick="startContainer('\${containerId}')"]\`);
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Starte';
        btn.disabled = true;

        fetch(\`/start-container/\${containerId}\`, { method: 'POST' })
            .then(() => {
                setTimeout(fetchContainers, 1000);
            });
    };

    window.stopContainer = function(containerId) {
        const btn = document.querySelector(\`button[onclick="stopContainer('\${containerId}')"]\`);
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Stoppe';
        btn.disabled = true;

        fetch(\`/stop-container/\${containerId}\`, { method: 'POST' })
            .then(() => {
                setTimeout(fetchContainers, 1000);
            });
    };

    window.deleteContainer = function(containerId) {
        if (confirm('Sind Sie sicher, dass Sie diese VM löschen möchten? Alle Daten gehen verloren!')) {
            const btn = document.querySelector(\`button[onclick="deleteContainer('\${containerId}')"]\`);
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lösche';
            btn.disabled = true;

            fetch(\`/delete-container/\${containerId}\`, { method: 'POST' })
                .then(() => {
                    if (currentContainerId === containerId) {
                        document.getElementById('terminal-container').style.display = 'none';
                        currentContainerId = null;
                    }
                    setTimeout(fetchContainers, 1000);
                });
        }
    };

    loadCreateForm();
    fetchContainers();

    document.getElementById('send-command').addEventListener('click', sendCommand);
    document.getElementById('command-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendCommand();
    });

    document.getElementById('clear-terminal').addEventListener('click', () => {
        document.getElementById('terminal').innerHTML = '';
    });
});
`);
  }
}

// API-Endpunkte
app.get('/create-form', (req, res) => {
  res.send(`
<div class="tabs">
    <div class="tab active" data-tab="basic">Basis</div>
    <div class="tab" data-tab="resources">Ressourcen</div>
    <div class="tab" data-tab="software">Software</div>
    <div class="tab" data-tab="network">Netzwerk</div>
</div>
<div id="basic" class="tab-content active">
    <div class="form-group">
        <label for="vm-name">VM Name:</label>
        <input type="text" id="vm-name" name="name" required placeholder="meine-vm">
    </div>

    <div class="form-group">
        <label for="vm-image">Basis-Image:</label>
        <select id="vm-image" name="image" required>
            <option value="ubuntu:latest">Ubuntu (latest)</option>
            <option value="debian:latest">Debian (latest)</option>
            <option value="centos:latest">CentOS (latest)</option>
            <option value="alpine:latest">Alpine (klein)</option>
        </select>
    </div>

    <div class="form-group">
        <label for="vm-hostname">Hostname:</label>
        <input type="text" id="vm-hostname" name="hostname" placeholder="vm-host">
    </div>
</div>
<div id="resources" class="tab-content">
    <div class="form-row">
        <div class="form-col">
            <label for="vm-ram">RAM (MB):</label>
            <input type="number" id="vm-ram" name="ram" min="256" value="1024" required>
        </div>

        <div class="form-col">
            <label for="vm-cores">CPU Kerne:</label>
            <input type="number" id="vm-cores" name="cores" min="1" max="16" value="2" required>
        </div>
    </div>

    <div class="form-row">
        <div class="form-col">
            <label for="vm-disk">Disk Space (MB):</label>
            <input type="number" id="vm-disk" name="disk" min="512" value="5120" required>
        </div>

        <div class="form-col">
            <label for="vm-swap">Swap Space (MB):</label>
            <input type="number" id="vm-swap" name="swap" min="0" value="1025">
        </div>
    </div>
</div>
<div id="software" class="tab-content">
    <div class="checkbox-group">
        <h4>Programmiersprachen:</h4>
        <div class="checkbox-item">
            <input type="checkbox" id="install-java" name="installJava">
            <label for="install-java">Java JDK</label>
        </div>
        <div class="checkbox-item">
            <input type="checkbox" id="install-python" name="installPython" checked>
            <label for="install-python">Python 3</label>
        </div>
        <div class="checkbox-item">
            <input type="checkbox" id="install-node" name="installNode">
            <label for="install-node">Node.js</label>
        </div>
    </div>

    <div class="checkbox-group">
        <h4>Datenbanken:</h4>
        <div class="checkbox-item">
            <input type="checkbox" id="install-mysql" name="installMysql">
            <label for="install-mysql">MySQL</label>
        </div>
        <div class="checkbox-item">
            <input type="checkbox" id="install-mongodb" name="installMongodb">
            <label for="install-mongodb">MongoDB</label>
        </div>
    </div>

    <div class="checkbox-group">
        <h4>Tools:</h4>
        <div class="checkbox-item">
            <input type="checkbox" id="install-git" name="installGit" checked>
            <label for="install-git">Git</label>
        </div>
        <div class="checkbox-item">
            <input type="checkbox" id="install-curl" name="installCurl" checked>
            <label for="install-curl">cURL</label>
        </div>
    </div>
</div>
<div id="network" class="tab-content">
    <div class="form-group">
        <label for="vm-port">Port-Mapping (Host:Guest):</label>
        <input type="text" id="vm-port" name="port" placeholder="8080:80,3306:3306">
    </div>

    <div class="form-group">
        <label for="vm-network">Netzwerkmodus:</label>
        <select id="vm-network" name="network">
            <option value="bridge">Bridge (Standard)</option>
            <option value="host">Host</option>
        </select>
    </div>
</div>
<div class="form-group">
    <button type="submit" class="btn-primary"><i class="fas fa-plus-circle"></i> VM erstellen</button>
</div>
  `);
});

app.get('/containers', async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    res.json(containers);
  } catch (err) {
    console.error('Fehler beim Abrufen der Container:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/create-vm', async (req, res) => {
  const {
    name,
    image,
    hostname,
    ram,
    cores,
    disk,
    swap,
    installPython,
    installJava,
    installNode,
    installMysql,
    installMongodb,
    port,
    network
  } = req.body;

  const vmId = uuidv4();
  const containerName = `vm-${name}-${vmId}`.toLowerCase().replace(/[^a-z0-9-]/g, '');

  try {
    let installScript = '#!/bin/bash\n';
    installScript += 'apt-get update && apt-get install -y wget sudo\n';

    if (installPython) installScript += 'apt-get install -y python3 python3-pip\n';
    if (installJava) installScript += 'apt-get install -y openjdk-11-jdk\n';
    if (installNode) {
      installScript += 'curl -fsSL https://deb.nodesource.com/setup_16.x | bash -\n';
      installScript += 'apt-get install -y nodejs\n';
    }
    if (installMysql) {
      installScript += 'apt-get install -y mysql-server\n';
      installScript += 'systemctl enable mysql\n';
    }
    if (installMongodb) {
      installScript += 'wget -qO - https://www.mongodb.org/static/pgp/server-4.4.asc | apt-key add -\n';
      installScript += 'echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/4.4 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-4.4.list\n';
      installScript += 'apt-get update && apt-get install -y mongodb-org\n';
      installScript += 'systemctl enable mongod\n';
    }

    installScript += 'echo "#!/bin/bash" > /start.sh\n';
    if (installMysql) installScript += 'service mysql start\n';
    if (installMongodb) installScript += 'service mongod start\n';
    installScript += '/bin/bash\n';
    installScript += 'chmod +x /start.sh\n';

    const portBindings = {};
    if (port) {
      port.split(',').forEach(mapping => {
        const [hostPort, containerPort] = mapping.trim().split(':');
        if (hostPort && containerPort) {
          portBindings[containerPort + "/tcp"] = [{ HostPort: hostPort }];
        }
      });
    }

    // Ensure swap is at least 1MB larger than RAM
    const calculatedSwap = Math.max(parseInt(swap || 0), parseInt(ram) + 1);

    const container = await docker.createContainer({
      Image: image,
      name: containerName,
      Hostname: hostname || containerName,
      Cmd: ['/bin/bash', '-c', installScript],
      Tty: true,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      OpenStdin: true,
      StdinOnce: false,
      HostConfig: {
        Memory: parseInt(ram) * 1024 * 1024,
        MemorySwap: calculatedSwap * 1024 * 1024,
        CpuShares: parseInt(cores) * 1024,
        PortBindings: portBindings,
        NetworkMode: network || 'bridge'
      }
    });

    await container.start();

    const configs = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE)) : {};
    configs[container.id] = {
      name: containerName,
      created: new Date().toISOString(),
      config: req.body
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configs, null, 2));

    const logs = fs.existsSync(LOG_FILE) ? JSON.parse(fs.readFileSync(LOG_FILE)) : {};
    logs[container.id] = [];
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));

    res.json({ success: true, id: container.id });
  } catch (err) {
    console.error('Fehler beim Erstellen der VM:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/start-container/:id', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.start();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/stop-container/:id', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.stop();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/delete-container/:id', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);

    try {
      await container.stop();
    } catch (e) {}

    await container.remove({ force: true });

    const configs = JSON.parse(fs.readFileSync(CONFIG_FILE));
    delete configs[req.params.id];
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configs, null, 2));

    const logs = JSON.parse(fs.readFileSync(LOG_FILE));
    delete logs[req.params.id];
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.ws('/terminal/:id', (ws, req) => {
  const containerId = req.params.id;
  const container = docker.getContainer(containerId);

  ws.on('error', (error) => {
    console.error('WebSocket Error:', error);
    ws.send('Fehler: ' + (error.message || 'Unbekannter Fehler'));
  });

  container.exec({
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    Cmd: ['/bin/bash']
  }, (err, exec) => {
    if (err) {
      ws.send('Exec Error: ' + (err.message || 'Container nicht erreichbar'));
      return ws.close();
    }

    exec.start({ hijack: true, stdin: true }, (err, stream) => {
      if (err) {
        ws.send('Stream Error: ' + (err.message || 'Terminal konnte nicht gestartet werden'));
        return ws.close();
      }

      docker.modem.demuxStream(stream, ws, ws);

      ws.on('message', (msg) => {
        try {
          stream.write(msg);

          const logs = JSON.parse(fs.readFileSync(LOG_FILE));
          if (!logs[containerId]) logs[containerId] = [];
          logs[containerId].push(msg);
          fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
        } catch (e) {
          console.error('Write Error:', e);
        }
      });

      ws.on('close', () => {
        try {
          stream.end();
        } catch (e) {
          console.error('Close Error:', e);
        }
      });
    });
  });
});

app.get('/', (req, res) => {
  initFiles();
  createDefaultFiles();
  res.render('index');
});

app.listen(PORT, () => {
  console.log(`Starting VM Managment ...`);
  console.log(``);
  console.log(`Started on Port ${PORT}`);
  console.log(`Visit: http://localhost:${PORT}`);
});