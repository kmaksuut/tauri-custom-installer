"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.obfuscateUiBundleDirectory = obfuscateUiBundleDirectory;
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const REGEX_PRECEDING_CHARS = new Set([
    '(',
    '[',
    '{',
    ',',
    ';',
    ':',
    '=',
    '!',
    '?',
    '&',
    '|',
    '^',
    '~',
    '+',
    '-',
    '*',
    '%',
    '<',
    '>',
]);
const REGEX_PRECEDING_KEYWORDS = new Set([
    'return',
    'case',
    'throw',
    'typeof',
    'void',
    'delete',
    'await',
    'yield',
    'in',
    'instanceof',
    'new',
    'else',
    'do',
]);
const SKIP_PRECEDING_KEYWORDS = new Set(['import', 'from', 'export', 'case', 'as']);
const DIRECTIVE_STRINGS = new Set([
    'use strict',
    'use asm',
    'use client',
    'use server',
]);
const HTML_GUARD_SCRIPT = '<script data-tci-guard="1">(function(){try{document.addEventListener("contextmenu",function(e){e.preventDefault();},{capture:true});document.addEventListener("keydown",function(e){var k=(e.key||"").toUpperCase();var c=e.ctrlKey||e.metaKey;if(k==="F12"||(c&&e.shiftKey&&(k==="I"||k==="J"||k==="C"))||(c&&k==="U")){e.preventDefault();e.stopPropagation();}},{capture:true});}catch(_){}})();</script>';
function isIdentChar(ch) {
    const code = ch.charCodeAt(0);
    return ((code >= 48 && code <= 57) ||
        (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122) ||
        code === 95 ||
        code === 36);
}
function unescapeJsString(rawInner) {
    let out = '';
    for (let i = 0; i < rawInner.length; i++) {
        const ch = rawInner[i];
        if (ch !== '\\') {
            out += ch;
            continue;
        }
        i++;
        if (i >= rawInner.length)
            return null;
        const esc = rawInner[i];
        switch (esc) {
            case 'n':
                out += '\n';
                break;
            case 'r':
                out += '\r';
                break;
            case 't':
                out += '\t';
                break;
            case 'b':
                out += '\b';
                break;
            case 'f':
                out += '\f';
                break;
            case 'v':
                out += '\v';
                break;
            case '\\':
            case '\'':
            case '"':
            case '/':
                out += esc;
                break;
            case '0':
                if (i + 1 < rawInner.length && rawInner[i + 1] >= '0' && rawInner[i + 1] <= '7') {
                    return null;
                }
                out += '\0';
                break;
            case 'x': {
                const hex = rawInner.slice(i + 1, i + 3);
                if (!/^[0-9a-fA-F]{2}$/.test(hex))
                    return null;
                out += String.fromCharCode(parseInt(hex, 16));
                i += 2;
                break;
            }
            case 'u': {
                if (rawInner[i + 1] === '{') {
                    const closeIdx = rawInner.indexOf('}', i + 2);
                    if (closeIdx === -1)
                        return null;
                    const hex = rawInner.slice(i + 2, closeIdx);
                    if (!/^[0-9a-fA-F]{1,6}$/.test(hex))
                        return null;
                    out += String.fromCodePoint(parseInt(hex, 16));
                    i = closeIdx;
                }
                else {
                    const hex = rawInner.slice(i + 1, i + 5);
                    if (!/^[0-9a-fA-F]{4}$/.test(hex))
                        return null;
                    out += String.fromCharCode(parseInt(hex, 16));
                    i += 4;
                }
                break;
            }
            case '\r':
                if (rawInner[i + 1] === '\n')
                    i++;
                break;
            case '\n':
                break;
            default:
                out += esc;
                break;
        }
    }
    return out;
}
function readPrevTokenInfo(output) {
    let idx = output.length - 1;
    while (idx >= 0 && /\s/.test(output[idx])) {
        idx--;
    }
    if (idx < 0)
        return { prevWord: '', prevChar: '' };
    const prevChar = output[idx];
    if (isIdentChar(prevChar)) {
        let start = idx;
        while (start > 0 && isIdentChar(output[start - 1])) {
            start--;
        }
        return { prevWord: output.slice(start, idx + 1), prevChar };
    }
    return { prevWord: '', prevChar };
}
function findNextNonWsChar(code, start) {
    let i = start;
    while (i < code.length && /\s/.test(code[i])) {
        i++;
    }
    return i < code.length ? code[i] : '';
}
function stripCommentsAndEncodeStrings(code, keyBytes, helperName) {
    const table = [];
    let out = '';
    let i = 0;
    const encodeEntry = (val) => {
        const idx = table.length;
        const raw = Buffer.from(val, 'utf8');
        const enc = Buffer.alloc(raw.length);
        for (let j = 0; j < raw.length; j++) {
            enc[j] = raw[j] ^ keyBytes[(idx + j) % keyBytes.length];
        }
        table.push(enc.toString('base64'));
        return idx;
    };
    while (i < code.length) {
        const ch = code[i];
        // Line comment
        if (ch === '/' && code[i + 1] === '/') {
            i += 2;
            while (i < code.length && code[i] !== '\n') {
                i++;
            }
            continue;
        }
        // Block comment
        if (ch === '/' && code[i + 1] === '*') {
            i += 2;
            while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) {
                i++;
            }
            i += 2;
            if (out.length > 0 && isIdentChar(out[out.length - 1])) {
                out += ' ';
            }
            continue;
        }
        // Regex literal check
        if (ch === '/') {
            const { prevWord, prevChar } = readPrevTokenInfo(out);
            const isRegex = prevChar === '' ||
                REGEX_PRECEDING_CHARS.has(prevChar) ||
                REGEX_PRECEDING_KEYWORDS.has(prevWord);
            if (isRegex) {
                out += ch;
                i++;
                let inClass = false;
                while (i < code.length) {
                    const rc = code[i];
                    out += rc;
                    i++;
                    if (rc === '\\' && i < code.length) {
                        out += code[i];
                        i++;
                    }
                    else if (rc === '[') {
                        inClass = true;
                    }
                    else if (rc === ']' && inClass) {
                        inClass = false;
                    }
                    else if (rc === '/' && !inClass) {
                        break;
                    }
                    else if (rc === '\n') {
                        break;
                    }
                }
                continue;
            }
        }
        // Template literal (preserve verbatim so embedded ${...} stays intact)
        if (ch === '`') {
            out += ch;
            i++;
            let exprDepth = 0;
            while (i < code.length) {
                const tc = code[i];
                out += tc;
                i++;
                if (tc === '\\' && i < code.length) {
                    out += code[i];
                    i++;
                }
                else if (tc === '$' && code[i] === '{') {
                    out += '{';
                    i++;
                    exprDepth++;
                }
                else if (tc === '{' && exprDepth > 0) {
                    exprDepth++;
                }
                else if (tc === '}' && exprDepth > 0) {
                    exprDepth--;
                }
                else if (tc === '`' && exprDepth === 0) {
                    break;
                }
            }
            continue;
        }
        // Single or double-quoted string literal
        if (ch === '\'' || ch === '"') {
            const quote = ch;
            const start = i;
            i++;
            let rawInner = '';
            let closed = false;
            while (i < code.length) {
                const sc = code[i];
                if (sc === '\\' && i + 1 < code.length) {
                    rawInner += sc + code[i + 1];
                    i += 2;
                }
                else if (sc === quote) {
                    i++;
                    closed = true;
                    break;
                }
                else {
                    rawInner += sc;
                    i++;
                }
            }
            if (!closed) {
                out += code.slice(start, i);
                continue;
            }
            const rawLiteral = code.slice(start, i);
            const { prevWord, prevChar } = readPrevTokenInfo(out);
            const nextChar = findNextNonWsChar(code, i);
            const decoded = unescapeJsString(rawInner);
            const isModuleSpecifier = SKIP_PRECEDING_KEYWORDS.has(prevWord) ||
                (prevChar === '(' && /(?:import|require)\s*\($/.test(out.trimEnd()));
            const isPropertyKey = nextChar === ':';
            const isDirective = decoded !== null && DIRECTIVE_STRINGS.has(decoded);
            if (decoded !== null &&
                decoded.length >= 4 &&
                !isModuleSpecifier &&
                !isPropertyKey &&
                !isDirective) {
                const idx = encodeEntry(decoded);
                out += `${helperName}(${idx})`;
            }
            else {
                out += rawLiteral;
            }
            continue;
        }
        out += ch;
        i++;
    }
    if (table.length === 0) {
        return { transformed: out.trimEnd() + '\n', encodedCount: 0 };
    }
    const keyVar = `${helperName}_k`;
    const tabVar = `${helperName}_t`;
    const cacheVar = `${helperName}_c`;
    const keyArr = Array.from(keyBytes).join(',');
    const header = `const ${keyVar}=[${keyArr}],${tabVar}=${JSON.stringify(table)},${cacheVar}=[];function ${helperName}(i){if(${cacheVar}[i]!==undefined)return ${cacheVar}[i];const b=atob(${tabVar}[i]),u=new Uint8Array(b.length);for(let j=0;j<b.length;j++)u[j]=b.charCodeAt(j)^${keyVar}[(i+j)%${keyBytes.length}];return(${cacheVar}[i]=new TextDecoder().decode(u));}`;
    // Place decoder cleanly after any leading `"use strict";` directive
    const strictMatch = out.match(/^(\s*(?:"use strict"|'use strict');?\s*)/);
    if (strictMatch) {
        const prefix = strictMatch[1];
        return {
            transformed: `${prefix}${header}\n${out.slice(prefix.length).trimEnd()}\n`,
            encodedCount: table.length,
        };
    }
    return {
        transformed: `${header}\n${out.trimEnd()}\n`,
        encodedCount: table.length,
    };
}
function collectFiles(dir) {
    const results = [];
    if (!node_fs_1.default.existsSync(dir))
        return results;
    for (const entry of node_fs_1.default.readdirSync(dir, { withFileTypes: true })) {
        const full = node_path_1.default.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...collectFiles(full));
        }
        else if (entry.isFile()) {
            results.push(full);
        }
    }
    return results;
}
/**
 * Strips source maps & comments, encodes JS string literals into a polymorphic
 * XOR+Base64 lookup table, and injects runtime DevTools/contextmenu hardening into HTML files.
 */
function obfuscateUiBundleDirectory(distDir, options = {}) {
    const result = {
        filesProcessed: 0,
        sourcemapsRemoved: 0,
        stringsEncoded: 0,
        bytesBefore: 0,
        bytesAfter: 0,
    };
    if (!node_fs_1.default.existsSync(distDir))
        return result;
    const baseSeed = options.seedHex || node_crypto_1.default.randomBytes(16).toString('hex');
    const allFiles = collectFiles(distDir);
    for (const filePath of allFiles) {
        const lower = filePath.toLowerCase();
        if (lower.endsWith('.map')) {
            const sz = node_fs_1.default.statSync(filePath).size;
            result.bytesBefore += sz;
            node_fs_1.default.rmSync(filePath, { force: true });
            result.sourcemapsRemoved++;
            continue;
        }
        if (lower.endsWith('.js') || lower.endsWith('.mjs')) {
            const original = node_fs_1.default.readFileSync(filePath, 'utf8');
            result.bytesBefore += Buffer.byteLength(original, 'utf8');
            const rel = node_path_1.default.relative(distDir, filePath).replace(/\\/g, '/');
            if (original.includes('data-tci-obf="1"') || /function __tci_[0-9a-f]{4}\(/.test(original)) {
                result.bytesAfter += Buffer.byteLength(original, 'utf8');
                continue;
            }
            const keyBytes = node_crypto_1.default
                .createHash('sha256')
                .update(`${baseSeed}:${rel}`)
                .digest();
            const shortTag = keyBytes.subarray(0, 2).toString('hex');
            const helperName = `__tci_${shortTag}`;
            const { transformed, encodedCount } = stripCommentsAndEncodeStrings(original, keyBytes, helperName);
            node_fs_1.default.writeFileSync(filePath, transformed, 'utf8');
            result.filesProcessed++;
            result.stringsEncoded += encodedCount;
            result.bytesAfter += Buffer.byteLength(transformed, 'utf8');
            continue;
        }
        if (lower.endsWith('.html') || lower.endsWith('.htm')) {
            const original = node_fs_1.default.readFileSync(filePath, 'utf8');
            result.bytesBefore += Buffer.byteLength(original, 'utf8');
            let updated = original.replace(/<!--[\s\S]*?-->/g, '');
            if (!updated.includes('data-tci-guard="1"')) {
                if (updated.includes('</head>')) {
                    updated = updated.replace('</head>', `${HTML_GUARD_SCRIPT}\n</head>`);
                }
                else {
                    updated = `${HTML_GUARD_SCRIPT}\n${updated}`;
                }
            }
            node_fs_1.default.writeFileSync(filePath, updated, 'utf8');
            result.filesProcessed++;
            result.bytesAfter += Buffer.byteLength(updated, 'utf8');
        }
    }
    return result;
}
