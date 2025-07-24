const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const port = 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(express.json());

// HTML-Editor Daten
let savedDesigns = {};
let currentId = 1;

// Routes
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>HTML/CSS/JS Generator</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f9; }
        .container { display: flex; gap: 20px; }
        .editor-panel, .preview-panel { flex: 1; border: 1px solid #ddd; padding: 15px; border-radius: 5px; background-color: #fff; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1); }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input, textarea, select { width: 100%; padding: 8px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 4px; }
        button { padding: 8px 15px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #0056b3; }
        #preview { border: 1px solid #ddd; min-height: 300px; padding: 15px; background-color: #fff; }
        .toolbar { margin-bottom: 15px; display: flex; gap: 10px; flex-wrap: wrap; }
        .element-item { margin-bottom: 10px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; background-color: #f9f9f9; }
        .element-actions button { margin-right: 5px; }
        .tab { display: none; }
        .tab.active { display: block; }
        .tab-buttons { display: flex; gap: 10px; margin-bottom: 15px; }
        .tab-buttons button { padding: 8px 15px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; }
        .tab-buttons button.active { background: #007bff; }
      </style>
    </head>
    <body>
      <h1>HTML/CSS/JS Generator</h1>
      <div class="container">
        <div class="editor-panel">
          <div class="tab-buttons">
            <button class="active" onclick="openTab('html-tab')">HTML</button>
            <button onclick="openTab('css-tab')">CSS</button>
            <button onclick="openTab('js-tab')">JavaScript</button>
          </div>
          <div id="html-tab" class="tab active">
            <h2>HTML Editor</h2>
            <div class="toolbar">
              <button onclick="addElement('heading')">Überschrift</button>
              <button onclick="addElement('paragraph')">Absatz</button>
              <button onclick="addElement('button')">Button</button>
              <button onclick="addElement('image')">Bild</button>
              <button onclick="addElement('link')">Link</button>
            </div>
            <form id="element-form" style="display: none;">
              <div class="form-group">
                <label for="element-type">Element Typ:</label>
                <select id="element-type" disabled>
                  <option value="heading">Überschrift</option>
                  <option value="paragraph">Absatz</option>
                  <option value="button">Button</option>
                  <option value="image">Bild</option>
                  <option value="link">Link</option>
                </select>
              </div>
              <div class="form-group">
                <label for="element-content">Inhalt:</label>
                <textarea id="element-content" rows="3"></textarea>
              </div>
              <div class="form-group">
                <label for="element-color">Text Farbe:</label>
                <input type="color" id="element-color" value="#000000">
              </div>
              <div class="form-group">
                <label for="element-bgcolor">Hintergrund:</label>
                <input type="color" id="element-bgcolor" value="#ffffff">
              </div>
              <div class="form-group" id="element-src-group" style="display: none;">
                <label for="element-src">Quelle (URL):</label>
                <input type="text" id="element-src">
              </div>
              <div class="form-group" id="element-href-group" style="display: none;">
                <label for="element-href">Link (URL):</label>
                <input type="text" id="element-href">
              </div>
              <button type="button" onclick="saveElement()">Speichern</button>
            </form>
            <div id="elements-list"></div>
          </div>
          <div id="css-tab" class="tab">
            <h2>CSS Editor</h2>
            <textarea id="css-editor" rows="10" style="width: 100%;"></textarea>
          </div>
          <div id="js-tab" class="tab">
            <h2>JavaScript Editor</h2>
            <textarea id="js-editor" rows="10" style="width: 100%;"></textarea>
          </div>
          <button onclick="saveDesign()">Design speichern</button>
          <button onclick="loadDesign()">Design laden</button>
        </div>
        <div class="preview-panel">
          <h2>Vorschau</h2>
          <div id="preview"></div>
          <h3>HTML Code</h3>
          <textarea id="html-code" rows="5" style="width: 100%;" readonly></textarea>
          <h3>CSS Code</h3>
          <textarea id="css-code" rows="5" style="width: 100%;" readonly></textarea>
          <h3>JavaScript Code</h3>
          <textarea id="js-code" rows="5" style="width: 100%;" readonly></textarea>
        </div>
      </div>
      <script>
        let elements = [];
        let editingIndex = -1;

        function openTab(tabName) {
          document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
          });
          document.querySelectorAll('.tab-buttons button').forEach(button => {
            button.classList.remove('active');
          });
          document.getElementById(tabName).classList.add('active');
          event.currentTarget.classList.add('active');
        }

        function addElement(type) {
          document.getElementById('element-form').style.display = 'block';
          document.getElementById('element-type').value = type;
          document.getElementById('element-content').value = '';
          document.getElementById('element-color').value = '#000000';
          document.getElementById('element-bgcolor').value = '#ffffff';
          document.getElementById('element-src-group').style.display = type === 'image' ? 'block' : 'none';
          document.getElementById('element-href-group').style.display = type === 'link' ? 'block' : 'none';
          editingIndex = -1;
        }

        function saveElement() {
          const type = document.getElementById('element-type').value;
          const content = document.getElementById('element-content').value;
          const color = document.getElementById('element-color').value;
          const bgColor = document.getElementById('element-bgcolor').value;
          const src = document.getElementById('element-src').value;
          const href = document.getElementById('element-href').value;

          const element = { type, content, color, bgColor, src, href };

          if (editingIndex >= 0) {
            elements[editingIndex] = element;
          } else {
            elements.push(element);
          }

          updateElementsList();
          updatePreview();
          document.getElementById('element-form').style.display = 'none';
        }

        function editElement(index) {
          const element = elements[index];
          document.getElementById('element-form').style.display = 'block';
          document.getElementById('element-type').value = element.type;
          document.getElementById('element-content').value = element.content;
          document.getElementById('element-color').value = element.color;
          document.getElementById('element-bgcolor').value = element.bgColor;
          document.getElementById('element-src').value = element.src || '';
          document.getElementById('element-href').value = element.href || '';
          document.getElementById('element-src-group').style.display = element.type === 'image' ? 'block' : 'none';
          document.getElementById('element-href-group').style.display = element.type === 'link' ? 'block' : 'none';
          editingIndex = index;
        }

        function deleteElement(index) {
          elements.splice(index, 1);
          updateElementsList();
          updatePreview();
        }

        function updateElementsList() {
          const listDiv = document.getElementById('elements-list');
          listDiv.innerHTML = '<h3>Elemente</h3>';

          if (elements.length === 0) {
            listDiv.innerHTML += '<p>Keine Elemente hinzugefügt</p>';
            return;
          }

          elements.forEach((element, index) => {
            const elementDiv = document.createElement('div');
            elementDiv.className = 'element-item';

            const shortContent = element.content.length > 20
              ? element.content.substring(0, 20) + '...'
              : element.content;

            elementDiv.innerHTML = `
              <strong>${element.type}</strong>: ${shortContent}
              <div class="element-actions">
                <button onclick="editElement(${index})">Bearbeiten</button>
                <button onclick="deleteElement(${index})">Löschen</button>
              </div>
            `;

            listDiv.appendChild(elementDiv);
          });
        }

        function updatePreview() {
          const previewDiv = document.getElementById('preview');
          const htmlTextarea = document.getElementById('html-code');
          const cssTextarea = document.getElementById('css-code');
          const jsTextarea = document.getElementById('js-code');

          let html = '';
          let css = document.getElementById('css-editor').value;
          let js = document.getElementById('js-editor').value;

          elements.forEach((element, index) => {
            const elementId = 'element-' + index;

            switch(element.type) {
              case 'heading':
                html += `<h1 id="${elementId}" style="color: ${element.color}; background-color: ${element.bgColor};">${element.content}</h1>`;
                break;
              case 'paragraph':
                html += `<p id="${elementId}" style="color: ${element.color}; background-color: ${element.bgColor};">${element.content}</p>`;
                break;
              case 'button':
                html += `<button id="${elementId}" style="color: ${element.color}; background-color: ${element.bgColor};">${element.content}</button>`;
                break;
              case 'image':
                html += `<img id="${elementId}" src="${element.src}" alt="${element.content}" style="max-width: 100%; height: auto; background-color: ${element.bgColor};">`;
                break;
              case 'link':
                html += `<a id="${elementId}" href="${element.href}" style="color: ${element.color}; background-color: ${element.bgColor};">${element.content}</a>`;
                break;
            }
          });

          previewDiv.innerHTML = html;
          htmlTextarea.value = html;
          cssTextarea.value = css;

          try {
            const script = document.createElement('script');
            script.textContent = js;
            previewDiv.appendChild(script);
            jsTextarea.value = js;
          } catch (e) {
            console.error("Error executing JavaScript:", e);
          }
        }

        async function saveDesign() {
          const designName = prompt('Design Name:');
          if (!designName) return;

          const cssCode = document.getElementById('css-editor').value;
          const jsCode = document.getElementById('js-editor').value;

          const response = await fetch('/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: designName, elements, css: cssCode, js: jsCode })
          });

          const result = await response.json();
          alert(result.message);
        }

        async function loadDesign() {
          const designName = prompt('Design Name:');
          if (!designName) return;

          const response = await fetch('/load?name=' + encodeURIComponent(designName));
          const result = await response.json();

          if (result.elements) {
            elements = result.elements;
            document.getElementById('css-editor').value = result.css || '';
            document.getElementById('js-editor').value = result.js || '';
            updateElementsList();
            updatePreview();
          } else {
            alert('Design nicht gefunden');
          }
        }
      </script>
    </body>
    </html>
  `);
});

// API Endpunkte
app.post('/save', (req, res) => {
  const { name, elements, css, js } = req.body;
  savedDesigns[name] = { elements, css, js };
  res.json({ message: `Design "${name}" gespeichert!`, success: true });
});

app.get('/load', (req, res) => {
  const name = req.query.name;
  if (savedDesigns[name]) {
    res.json({ ...savedDesigns[name], success: true });
  } else {
    res.status(404).json({ error: 'Design nicht gefunden', success: false });
  }
});

// Server starten
app.listen(port, () => {
  console.log(`HTML Generator app listening at http://localhost:${port}`);
});