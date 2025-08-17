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

app.use(express.static('public'));
app.use(express.json());

// Chat-Sessions speichern
const chatSessions = new Map();

// Funktion zum Abrufen des Website-Titels
async function getWebsiteTitle(url) {
    try {
        const response = await axios.get(url, { timeout: 5000 });

// Hilfsfunktionen
function generateChatTitle(firstMessage) {
    const words = firstMessage.trim().split(' ').slice(0, 4);
    return words.join(' ') + (firstMessage.split(' ').length > 4 ? '...' : '');
}
        const dom = new JSDOM(response.data);
        const title = dom.window.document.querySelector('title');
        return title ? title.textContent.trim() : url;
    } catch (error) {
        return url;
    }
}

// Socket.IO Connection
io.on('connection', (socket) => {
    console.log('Neuer Client verbunden:', socket.id);

    // Neue Chat-Session erstellen
    socket.on('new_chat', () => {
        const chatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        chatSessions.set(chatId, []);
        socket.emit('chat_created', { chatId, title: 'Neuer Chat' });
    });

    // Chat-Nachricht senden
    socket.on('send_message', async (data) => {
        const { chatId, message } = data;
        
        if (!chatSessions.has(chatId)) {
            chatSessions.set(chatId, []);
        }

        const chatHistory = chatSessions.get(chatId);
        chatHistory.push({ role: 'user', content: message });

        try {
            // Streaming-Request an Ollama
            const response = await axios.post('http://localhost:11434/api/chat', {
                model: config.ollama.model,
                messages: [
                    { role: 'system', content: config.system_prompt },
                    ...chatHistory
                ],
                stream: true
            }, {
                responseType: 'stream'
            });

            let aiResponse = '';
            
            response.data.on('data', async (chunk) => {
                const lines = chunk.toString().split('\n').filter(line => line.trim());
                
                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);
                        if (data.message && data.message.content) {
                            aiResponse += data.message.content;
                            
                            // Live-Update an Client senden
                            const formattedChunk = await formatMessage(aiResponse);
                            socket.emit('message_streaming', {
                                chatId,
                                message: formattedChunk,
                                raw: aiResponse,
                                done: data.done || false
                            });
                        }
                        
                        if (data.done) {
                            chatHistory.push({ role: 'assistant', content: aiResponse });
                            
                            // Chat-Titel automatisch generieren
                            if (chatHistory.length === 2) { // Erste Nachricht
                                const title = generateChatTitle(message);
                                socket.emit('chat_title_updated', { chatId, title });
                            }
                        }
                    } catch (e) {
                        // JSON Parse Fehler ignorieren
                    }
                }
            });

            response.data.on('end', () => {
                if (!aiResponse) {
                    socket.emit('error', 'Keine Antwort von der AI erhalten');
                }
            });

        } catch (error) {
            console.error('Ollama Fehler:', error);
            socket.emit('error', 'Fehler bei der Kommunikation mit der AI');
        }
    });

    // Chat laden
    socket.on('load_chat', (chatId) => {
        if (chatSessions.has(chatId)) {
            const history = chatSessions.get(chatId);
            socket.emit('chat_loaded', { chatId, history });
        }
    });

    // Chat löschen
    socket.on('delete_chat', (chatId) => {
        if (chatSessions.has(chatId)) {
            chatSessions.delete(chatId);
            socket.emit('chat_deleted', { chatId });
        }
    });

    socket.on('disconnect', () => {
        console.log('Client getrennt:', socket.id);
    });
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

// Server starten
const PORT = config.server.port || 3000;
server.listen(PORT, () => {
    console.log(`Tontoo AI Server läuft auf Port ${PORT}`);
    console.log(`Öffnen Sie http://localhost:${PORT} in Ihrem Browser`);
});