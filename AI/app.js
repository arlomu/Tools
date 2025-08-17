const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const axios = require('axios');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const { JSDOM } = require('jsdom');

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

// Chat-Datenbank
const CHAT_FILE = 'chat.json';

// Funktion zum Laden der Chats
function loadChats() {
    try {
        if (fs.existsSync(CHAT_FILE)) {
            const data = fs.readFileSync(CHAT_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Fehler beim Laden der Chat-Daten:', e);
    }
    return { messages: [], createdAt: new Date().toISOString() };
}

// Funktion zum Speichern der Chats
function saveChats(chatData) {
    try {
        const dataToSave = {
            messages: chatData.messages,
            createdAt: chatData.createdAt,
            updatedAt: new Date().toISOString()
        };
        fs.writeFileSync(CHAT_FILE, JSON.stringify(dataToSave, null, 2));
    } catch (e) {
        console.error('Fehler beim Speichern der Chat-Daten:', e);
    }
}

app.use(express.static('public'));
app.use(express.json());

// Funktion zum Abrufen des Website-Titels
async function getWebsiteTitle(url) {
    try {
        const response = await axios.get(url, { timeout: 5000 });
        const dom = new JSDOM(response.data);
        const title = dom.window.document.querySelector('title');
        return title ? title.textContent.trim() : url;
    } catch (error) {
        return url;
    }
}

// Aktive Streams verwalten
const activeStreams = new Map();

io.on('connection', (socket) => {
    console.log('Neuer Client verbunden:', socket.id);

    // Aktiven Stream beim Trennen beenden
    socket.on('disconnect', () => {
        if (activeStreams.has(socket.id)) {
            activeStreams.get(socket.id).abort();
            activeStreams.delete(socket.id);
        }
    });

    // Chat laden
    socket.on('load_chat', () => {
        const chatData = loadChats();
        socket.emit('chat_loaded', chatData);
    });

    // Nachricht senden
    socket.on('send_message', async (data) => {
        const { message } = data;
        let chatData = loadChats();
        
        // Nutzernachricht hinzufügen
        chatData.messages.push({ role: 'user', content: message });
        saveChats(chatData);
        
        // Vorherigen Stream beenden falls vorhanden
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

            const response = await axios.post('http://localhost:11434/api/chat', {
                model: config.ollama.model,
                messages: [
                    { role: 'system', content: config.system_prompt },
                    ...chatData.messages
                ],
                stream: true
            }, {
                responseType: 'stream',
                signal: abortController.signal
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
                            chatData.messages.push({
                                role: 'assistant',
                                content: aiResponse,
                                stats: {
                                    tokens: tokenCount,
                                    duration: ((endTime - startTime) / 1000).toFixed(2)
                                }
                            });
                            saveChats(chatData);
                            activeStreams.delete(socket.id);
                        }
                    } catch (e) {
                        // JSON Parse Fehler ignorieren
                    }
                }
            });

            response.data.on('end', () => {
                activeStreams.delete(socket.id);
            });

        } catch (error) {
            if (!axios.isCancel(error)) {
                console.error('Ollama Fehler:', error);
                socket.emit('error', 'Fehler bei der Kommunikation mit der AI');
            }
            activeStreams.delete(socket.id);
        }
    });

    // Chat zurücksetzen
    socket.on('reset_chat', () => {
        if (activeStreams.has(socket.id)) {
            activeStreams.get(socket.id).abort();
            activeStreams.delete(socket.id);
        }
        const chatData = { messages: [], createdAt: new Date().toISOString() };
        saveChats(chatData);
        socket.emit('chat_reset');
    });

    // Nachrichtenformatierung
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

        // URLs zu anklickbaren Links mit Website-Titel
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urls = formatted.match(urlRegex);
        
        if (urls) {
            for (const url of urls) {
                const title = await getWebsiteTitle(url);
                formatted = formatted.replace(url, 
                    `<a href="${url}" target="_blank" rel="noopener noreferrer" class="url-link">
                        <i class="fas fa-external-link-alt"></i> ${title}
                    </a>`
                );
            }
        }

        return formatted;
    }
});

// Server starten
const PORT = config.server.port || 3000;
server.listen(PORT, () => {
    console.log(`Tontoo AI Server läuft auf Port ${PORT}`);
    console.log(`Öffnen Sie http://localhost:${PORT} in Ihrem Browser`);
});