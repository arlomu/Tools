das sind aber keine 1500+ zeilen code nur 1100 zeilen ca! warum? gebe mir den ganzen code und da waren der fehler: /workspaces/Tools/Node-JS/app.js:748
                    <div class="note ${note.isPinned ? 'pinned' : ''}" data-note-id="${note.id}" style="border-left-color: ${note.color};">
                         ^^^^^

SyntaxError: Unexpected token 'class'
    at wrapSafe (node:internal/modules/cjs/loader:1662:18)
    at Module._compile (node:internal/modules/cjs/loader:1704:20)
    at Object..js (node:internal/modules/cjs/loader:1895:10)
    at Module.load (node:internal/modules/cjs/loader:1465:32)
    at Function._load (node:internal/modules/cjs/loader:1282:12)
    at TracingChannel.traceSync (node:diagnostics_channel:322:14)
    at wrapModuleLoad (node:internal/modules/cjs/loader:235:24)
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:171:5)
    at node:internal/main/run_main_module:36:49

Node.js v22.17.0