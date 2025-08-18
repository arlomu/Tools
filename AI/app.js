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

// Verbesserte loadChats Funktion mit Fehlerbehandlung
function loadChats() {
    try {
        if (fs.existsSync(CHAT_FILE)) {
            const data = fs.readFileSync(CHAT_FILE, 'utf8');
            const parsed = JSON.parse(data);
            if (!Array.isArray(parsed.messages)) {
                parsed.messages = [];
            }
            return {
                messages: parsed.messages || [],
                createdAt: parsed.createdAt || new Date().toISOString(),
                updatedAt: parsed.updatedAt || new Date().toISOString()
            };
        }
    } catch (e) {
        console.error('Fehler beim Laden der Chat-Daten:', e);
    }
    return { 
        messages: [], 
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

// Verbesserte saveChats Funktion
function saveChats(chatData) {
    try {
        const dataToSave = {
            messages: Array.isArray(chatData.messages) ? chatData.messages : [],
            createdAt: chatData.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        fs.writeFileSync(CHAT_FILE, JSON.stringify(dataToSave, null, 2));
    } catch (e) {
        console.error('Fehler beim Speichern der Chat-Daten:', e);
    }
}

app.use(express.static('public'));
app.use(express.json());

// URL-Titel Funktion
async function getWebsiteTitle(url) {
    try {
        // Handle URL: prefix
        const cleanUrl = url.startsWith('URL:') ? url.substring(4).trim() : url;
        const fullUrl = cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`;
        
        const response = await axios.get(fullUrl, { 
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        const dom = new JSDOM(response.data);
        const title = dom.window.document.querySelector('title');
        return title ? title.textContent.trim() : cleanUrl;
    } catch (error) {
        return url;
    }
}

// Aktive Streams verwalten
const activeStreams = new Map();

io.on('connection', (socket) => {
    console.log('Neuer Client verbunden:', socket.id);

    socket.on('disconnect', () => {
        if (activeStreams.has(socket.id)) {
            activeStreams.get(socket.id).abort();
            activeStreams.delete(socket.id);
        }
    });

    socket.on('load_chat', () => {
        const chatData = loadChats();
        socket.emit('chat_loaded', chatData);
    });

    socket.on('send_message', async (data) => {
        const { message } = data;
        let chatData = loadChats();
        
        // Sicherstellen, dass messages Array existiert
        if (!Array.isArray(chatData.messages)) {
            chatData.messages = [];
        }
        
        chatData.messages.push({ role: 'user', content: message });
        saveChats(chatData);
        
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

            const response = await axios.post(`${config.ollama.host || 'http://localhost:11434'}/api/chat`, {
                model: config.ollama.model,
                messages: [
                    { role: 'system', content: config.system_prompt },
                    ...chatData.messages
                ],
                stream: true
            }, {
                responseType: 'stream',
                signal: abortController.signal,
                timeout: 120000 // 2 Minuten Timeout
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
                            const stats = {
                                tokens: tokenCount,
                                duration: ((endTime - startTime) / 1000).toFixed(2)
                            };
                            
                            chatData.messages.push({
                                role: 'assistant',
                                content: aiResponse,
                                stats: stats
                            });
                            saveChats(chatData);

                            socket.emit('message_completed', {
                                responseId,
                                content: await formatMessage(aiResponse),
                                stats
                            });
                            
                            activeStreams.delete(socket.id);
                        }
                    } catch (e) {
                        console.error('Fehler beim Parsen der Stream-Daten:', e);
                    }
                }
            });

            response.data.on('end', () => {
                if (activeStreams.has(socket.id)) {
                    activeStreams.delete(socket.id);
                }
            });

        } catch (error) {
            if (!axios.isCancel(error)) {
                console.error('Ollama Fehler:', error);
                socket.emit('error', 'Fehler bei der Kommunikation mit der AI');
            }
            if (activeStreams.has(socket.id)) {
                activeStreams.delete(socket.id);
            }
        }
    });

    socket.on('stop_generation', () => {
        if (activeStreams.has(socket.id)) {
            activeStreams.get(socket.id).abort();
            activeStreams.delete(socket.id);
            socket.emit('streaming_stopped');
        }
    });

    socket.on('reset_chat', () => {
        if (activeStreams.has(socket.id)) {
            activeStreams.get(socket.id).abort();
            activeStreams.delete(socket.id);
        }
        const chatData = { 
            messages: [], 
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        saveChats(chatData);
        socket.emit('chat_reset');
    });

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

        // URLs zu anklickbaren Links (unterstützt URL: format)
        const urlRegex = /(https?:\/\/[^\s]+)|(URL:\s*([^\s]+))/gi;
        const urls = formatted.match(urlRegex) || [];
        
        for (const url of urls) {
            try {
                let cleanUrl = url.startsWith('URL:') ? url.substring(4).trim() : url;
                if (!cleanUrl.startsWith('http')) {
                    cleanUrl = `https://${cleanUrl}`;
                }
                
                const title = await getWebsiteTitle(cleanUrl);
                const displayUrl = url.startsWith('URL:') ? url.substring(4).trim() : url;
                const linkHtml = `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="url-link">
                    <i class="fas fa-external-link-alt"></i> ${title}
                </a>`;
                
                formatted = formatted.replace(url, linkHtml);
            } catch (e) {
                console.error('Fehler beim Formatieren der URL:', url, e);
            }
        }

        return formatted;
    }
});

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