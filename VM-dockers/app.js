const express = require('express');
const expressWs = require('express-ws');
const fs = require('fs');
const path = require('path');
const Docker = require('dockerode');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');

// Docker Client
const docker = new Docker();
const app = express();
expressWs(app);

// Config
const PORT = process.env.PORT || 3000;
const LOG_FILE = path.join(__dirname, 'vm-logs.json');
const CONFIG_FILE = path.join(__dirname, 'vm-configs.json');

// Middleware
app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Initialize files
function initFiles() {
  if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '{}');
  if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, '{}');
  if (!fs.existsSync('views')) fs.mkdirSync('views');
  if (!fs.existsSync('public/css')) fs.mkdirSync('public/css', { recursive: true });
  if (!fs.existsSync('public/js')) fs.mkdirSync('public/js', { recursive: true });
}

// Create default files with modern UI
function createDefaultFiles() {
  // Modern index.ejs
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
                <li><a href="#"><i class="fas fa-plus-circle"></i> Create VM</a></li>
                <li><a href="#"><i class="fas fa-cog"></i> Settings</a></li>
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
                <h2><i class="fas fa-plus"></i> Create New VM</h2>
                <form id="create-vm-form">
                    <!-- Form will be loaded via JS -->
                </form>
            </div>
            
            <div class="card vm-list">
                <h2><i class="fas fa-list"></i> Your VMs</h2>
                <div id="containers-list" class="grid-container"></div>
            </div>
            
            <div class="card terminal-container" id="terminal-container" style="display: none;">
                <h2><i class="fas fa-terminal"></i> Terminal</h2>
                <div id="terminal" class="terminal-window"></div>
                <div class="terminal-input">
                    <input type="text" id="command-input" placeholder="Enter command...">
                    <button id="send-command" class="btn-primary"><i class="fas fa-paper-plane"></i> Send</button>
                    <button id="clear-terminal" class="btn-secondary"><i class="fas fa-broom"></i> Clear</button>
                </div>
            </div>
        </div>
    </div>
    
    <script src="/js/script.js"></script>
</body>
</html>`);
  }

  // Modern CSS with animations
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

/* Sidebar */
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

/* Main Content */
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

/* Cards */
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

/* Grid */
.grid-container {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 20px;
}

/* VM Card */
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

/* Buttons */
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

.btn-warning {
    background-color: var(--warning);
    color: white;
}

/* Terminal */
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

/* Status */
.status-running {
    color: var(--success);
}

.status-stopped {
    color: var(--danger);
}

.status-paused {
    color: var(--warning);
}

/* Animations */
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}

.card, .vm-card {
    animation: fadeIn 0.5s ease forwards;
}

/* Tabs */
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

/* Form Elements */
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

/* Responsive */
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

  // Modern JavaScript with animations
  if (!fs.existsSync('public/js/script.js')) {
    fs.writeFileSync('public/js/script.js', `document.addEventListener('DOMContentLoaded', function() {
    // Tab functionality
    function setupTabs() {
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', function() {
                // Deactivate all tabs
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                // Activate clicked tab
                this.classList.add('active');
                const tabId = this.getAttribute('data-tab');
                document.getElementById(tabId).classList.add('active');
            });
        });
        
        // Activate first tab
        if (tabs.length > 0) tabs[0].click();
    }
    
    // Load create form
    function loadCreateForm() {
        fetch('/create-form')
            .then(response => response.text())
            .then(html => {
                document.getElementById('create-vm-form').innerHTML = html;
                setupTabs();
                
                // Form submission
                document.getElementById('create-vm-form').addEventListener('submit', function(e) {
                    e.preventDefault();
                    createVM();
                });
            });
    }
    
    // Create VM with animation
    function createVM() {
        const form = document.getElementById('create-vm-form');
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        // Show loading animation
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
        submitBtn.disabled = true;
        
        fetch('/create-vm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Success animation
                submitBtn.innerHTML = '<i class="fas fa-check"></i> Success!';
                setTimeout(() => {
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                }, 2000);
                
                // Refresh container list with animation
                fetchContainers();
            } else {
                showError(data.error || 'Failed to create VM');
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
    
    // Show error with animation
    function showError(message) {
        const errorEl = document.createElement('div');
        errorEl.className = 'error-message';
        errorEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
        errorEl.style.animation = 'fadeIn 0.3s ease';
        
        const form = document.getElementById('create-vm-form');
        form.prepend(errorEl);
        
        setTimeout(() => {
            errorEl.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => errorEl.remove(), 300);
        }, 5000);
    }
    
    // Fetch containers with animation
    function fetchContainers() {
        const containerList = document.getElementById('containers-list');
        containerList.style.opacity = '0.5';
        containerList.style.transition = 'opacity 0.3s ease';
        
        fetch('/containers')
            .then(response => response.json())
            .then(containers => {
                containerList.innerHTML = '';
                
                if (containers.length === 0) {
                    containerList.innerHTML = '<div class="empty-state"><i class="fas fa-server"></i><p>No VMs found</p></div>';
                    return;
                }
                
                containers.forEach((container, index) => {
                    const containerCard = document.createElement('div');
                    containerCard.className = 'vm-card';
                    containerCard.style.animationDelay = `${index * 0.1}s`;
                    
                    const name = container.Names[0].replace('/', '');
                    const image = container.Image.split(':')[0];
                    const status = container.State;
                    const id = container.Id;
                    
                    containerCard.innerHTML = \`
                        <h3><i class="fas fa-server"></i> \${name}</h3>
                        <p><strong>Image:</strong> \${image}</p>
                        <p><strong>Status:</strong> <span class="status-\${status}">\${status}</span></p>
                        <p><strong>Created:</strong> \${new Date(container.Created * 1000).toLocaleString()}</p>
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
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    \`;
                    
                    containerList.appendChild(containerCard);
                });
                
                containerList.style.opacity = '1';
            });
    }
    
    // Terminal connection
    function connectToTerminal(containerId) {
        const terminalContainer = document.getElementById('terminal-container');
        const terminal = document.getElementById('terminal');
        
        // Close existing connection
        if (window.socket) {
            window.socket.close();
        }
        
        // Show terminal with animation
        terminalContainer.style.display = 'block';
        terminalContainer.style.animation = 'fadeIn 0.3s ease';
        terminal.innerHTML = '<span class="text-muted">Connecting to VM...</span>';
        currentContainerId = containerId;
        
        // WebSocket connection
        window.socket = new WebSocket(\`ws://\${window.location.host}/terminal/\${containerId}\`);
        
        window.socket.onopen = () => {
            terminal.innerHTML = '<span class="text-success">Connected to VM terminal</span><br><br>> ';
        };
        
        window.socket.onmessage = (msg) => {
            terminal.innerHTML += msg.data;
            terminal.scrollTop = terminal.scrollHeight;
        };
        
        window.socket.onerror = (error) => {
            terminal.innerHTML += \`<span class="text-danger">Error: \${error.message || 'Connection failed'}</span>\`;
        };
        
        window.socket.onclose = () => {
            terminal.innerHTML += '<br><span class="text-muted">Connection closed</span>';
        };
    }
    
    // Global functions
    window.connectToTerminal = connectToTerminal;
    window.startContainer = function(containerId) {
        const btn = document.querySelector(\`button[onclick="startContainer('\${containerId}')"]\`);
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Starting';
        btn.disabled = true;
        
        fetch(\`/start-container/\${containerId}\`, { method: 'POST' })
            .then(() => {
                setTimeout(fetchContainers, 1000);
            });
    };
    
    window.stopContainer = function(containerId) {
        const btn = document.querySelector(\`button[onclick="stopContainer('\${containerId}')"]\`);
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Stopping';
        btn.disabled = true;
        
        fetch(\`/stop-container/\${containerId}\`, { method: 'POST' })
            .then(() => {
                setTimeout(fetchContainers, 1000);
            });
    };
    
    window.deleteContainer = function(containerId) {
        if (confirm('Are you sure you want to delete this VM? All data will be lost!')) {
            const btn = document.querySelector(\`button[onclick="deleteContainer('\${containerId}')"]\`);
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting';
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
    
    // Initialize
    loadCreateForm();
    fetchContainers();
    
    // Terminal command sending
    document.getElementById('send-command').addEventListener('click', sendCommand);
    document.getElementById('command-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendCommand();
    });
    
    document.getElementById('clear-terminal').addEventListener('click', () => {
        document.getElementById('terminal').innerHTML = '';
    });
    
    function sendCommand() {
        const input = document.getElementById('command-input');
        if (window.socket && window.socket.readyState === WebSocket.OPEN && input.value.trim()) {
            window.socket.send(input.value + '\\n');
            input.value = '';
        }
    }
});`);
  }
}

// [Rest of the backend code remains the same as in previous examples]

// Start server
initFiles();
createDefaultFiles();
app.listen(PORT, () => {
  console.log(`Modern Docker VM Manager running on http://localhost:${PORT}`);
});