const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Konfiguration laden
const config = JSON.parse(fs.readFileSync('data.json', 'utf8'));
const recipients = JSON.parse(fs.readFileSync('liste.json', 'utf8'));

// Nodemailer Transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: config.gmailUser,
    pass: config.gmailAppPassword
  }
});

// Webseite
app.get('/', (req, res) => {
  let recipientOptions = recipients.map(r => 
    `<option value="${r.emails}">${r.name} (${r.emails})</option>`
  ).join('');

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Email Sender</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        form { max-width: 600px; margin: auto; }
        label, input, textarea, select { display: block; width: 100%; margin-bottom: 10px; }
        textarea { height: 150px; }
        button { padding: 10px 15px; background: #007bff; color: white; border: none; cursor: pointer; }
        .radio-group { display: flex; gap: 15px; margin-bottom: 10px; }
        .radio-group label { width: auto; }
        .success { color: green; }
        .error { color: red; }
      </style>
    </head>
    <body>
      <h1>Email Versand</h1>
      ${req.query.success ? '<p class="success">Email wurde erfolgreich versendet!</p>' : ''}
      ${req.query.error ? '<p class="error">Fehler beim Versenden: ' + req.query.error + '</p>' : ''}
      
      <form action="/send" method="post">
        <label for="recipient">Empfänger:</label>
        <select id="recipient" name="recipient" required>
          <option value="">-- Bitte auswählen --</option>
          ${recipientOptions}
        </select>
        
        <label for="subject">Betreff:</label>
        <input type="text" id="subject" name="subject" required>
        
        <div class="radio-group">
          <label><input type="radio" name="contentType" value="text" checked> Normaler Text</label>
          <label><input type="radio" name="contentType" value="html"> HTML</label>
        </div>
        
        <label for="message">Nachricht:</label>
        <textarea id="message" name="message" required></textarea>
        
        <button type="submit">Email senden</button>
      </form>
    </body>
    </html>
  `);
});

// Email senden
app.post('/send', async (req, res) => {
  try {
    const { recipient, subject, message, contentType } = req.body;
    
    // E-Mail-Empfänger aufteilen
    const toEmails = recipient.split(',').map(email => email.trim()).filter(email => email);
    
    const mailOptions = {
      from: config.gmailUser,
      to: toEmails.join(', '),
      subject: subject,
      [contentType === 'html' ? 'html' : 'text']: message
    };

    await transporter.sendMail(mailOptions);
    res.redirect('/?success=true');
  } catch (error) {
    console.error('Fehler beim Senden:', error);
    res.redirect('/?error=' + encodeURIComponent(error.message));
  }
});

// Server starten
app.listen(config.port, () => {
  console.log(`Server läuft auf http://localhost:${config.port}`);
});