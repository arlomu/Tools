document.addEventListener('DOMContentLoaded', function() {
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
        errorEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
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
                    containerCard.style.animationDelay = `${index * 0.1}s`;
                    
                    const name = container.Names[0].replace('/', '');
                    const image = container.Image.split(':')[0];
                    const status = container.State;
                    const id = container.Id;
                    
                    containerCard.innerHTML = `
                        <h3><i class="fas fa-server"></i> ${name}</h3>
                        <p><strong>Image:</strong> ${image}</p>
                        <p><strong>Status:</strong> <span class="status-${status}">${status}</span></p>
                        <p><strong>Erstellt:</strong> ${new Date(container.Created * 1000).toLocaleString()}</p>
                        <div class="vm-actions">
                            <button onclick="connectToTerminal('${id}')" class="btn btn-primary">
                                <i class="fas fa-terminal"></i> Terminal
                            </button>
                            <button onclick="startContainer('${id}')" class="btn btn-success" ${status === 'running' ? 'disabled' : ''}>
                                <i class="fas fa-play"></i> Start
                            </button>
                            <button onclick="stopContainer('${id}')" class="btn btn-warning" ${status !== 'running' ? 'disabled' : ''}>
                                <i class="fas fa-stop"></i> Stop
                            </button>
                            <button onclick="deleteContainer('${id}')" class="btn btn-danger">
                                <i class="fas fa-trash"></i> Löschen
                            </button>
                        </div>
                    `;
                    
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
        
        window.socket = new WebSocket(`ws://${window.location.host}/terminal/${containerId}`);
        
        window.socket.onopen = () => {
            terminal.innerHTML = '<span class="text-success">Mit VM verbunden</span><br><br>> ';
        };
        
        window.socket.onmessage = (msg) => {
            terminal.innerHTML += msg.data;
            terminal.scrollTop = terminal.scrollHeight;
        };
        
        window.socket.onerror = (error) => {
            terminal.innerHTML += `<span class="text-danger">Fehler: ${error.message || 'Verbindung fehlgeschlagen'}</span>`;
        };
        
        window.socket.onclose = () => {
            terminal.innerHTML += '<br><span class="text-muted">Verbindung geschlossen</span>';
        };
    }
    
    function sendCommand() {
        const input = document.getElementById('command-input');
        if (window.socket && window.socket.readyState === WebSocket.OPEN && input.value.trim()) {
            window.socket.send(input.value + '\n');
            input.value = '';
        }
    }
    
    window.connectToTerminal = connectToTerminal;
    window.startContainer = function(containerId) {
        const btn = document.querySelector(`button[onclick="startContainer('${containerId}')"]`);
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Starte';
        btn.disabled = true;
        
        fetch(`/start-container/${containerId}`, { method: 'POST' })
            .then(() => {
                setTimeout(fetchContainers, 1000);
            });
    };
    
    window.stopContainer = function(containerId) {
        const btn = document.querySelector(`button[onclick="stopContainer('${containerId}')"]`);
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Stoppe';
        btn.disabled = true;
        
        fetch(`/stop-container/${containerId}`, { method: 'POST' })
            .then(() => {
                setTimeout(fetchContainers, 1000);
            });
    };
    
    window.deleteContainer = function(containerId) {
        if (confirm('Sind Sie sicher, dass Sie diese VM löschen möchten? Alle Daten gehen verloren!')) {
            const btn = document.querySelector(`button[onclick="deleteContainer('${containerId}')"]`);
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lösche';
            btn.disabled = true;
            
            fetch(`/delete-container/${containerId}`, { method: 'POST' })
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