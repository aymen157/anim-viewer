
const log = console.log
import fs from 'fs';
import path from 'path';
const __dirname = import.meta.dirname;
import express from 'express';
import cors from 'cors';
import { exec, spawn } from "child_process";
import open, { openApp, apps } from 'open';
import micromatch from 'micromatch';

// usage: app.use(IOServer({ api: someApiIfNeeded }))
export default function IOServer(options) {
    const router = express.Router();
    router.use(cors());

    options = {
        ...options
    }

    let API = options.api || {};
    if (!options.noDefaultAPIs)
        setup_default_API(API)

    router.get('/api.js', (req, res) => {
        const origin = `${req.protocol}://${req.get('host')}`;
        let sourceCode = `;(${client_api})();`;
        sourceCode = sourceCode.replaceAll(`const baseUrl = window.location.origin`,
            `const baseUrl = '${origin}'`)
        res.type('application/javascript').send(sourceCode);
    });

    router.post(`/api/`, express.json(), async (req, res) => {
        const {
            func,
            params
        } = req.body;

        if (!API.hasOwnProperty(func)) {
            return res.status(400).json({
                error: 'Unknown function'
            });
        }

        try {
            const result = await API[func].apply(null, params);
            res.json(result);
        } catch (err) {
            console.error(`[API ERROR] Function: ${func}, Params:`, params);
            console.error(err);
            res.status(500).json({
                error: 'Internal server error',
                message: err.message
            });
        }
    });

    return router;
}

// example usage in your html file/js
// var files = await api.walkdir(path, settings);
// or api.openFolder("./pictures/")
function client_api() {
    const api = (function createAPIProxy(path = []) {
        return new Proxy(function () { }, {
            // Handle property access: api.users
            get: (target, prop) => {
                // Create a new proxy with the updated path
                return createAPIProxy([...path, prop]);
            },

            // Handle function calls: api.users.get() or api.users()
            apply: (target, thisArg, args) => {
                // Join the path segments to create the full function name
                const fullFuncName = path.join('.');
                return sendRequest(fullFuncName, args);
            }
        });
    })();

    // this has an annoying syntax: await(await api.walkdir(path, settings)).json()
    // function sendRequest(func, params) {
    //     const argObj = {
    //         func,
    //         params
    //     };
    //     console.log(argObj);
    //     return fetch('/api/', {
    //         method: 'POST',
    //         headers: {
    //             'Content-Type': 'application/json'
    //         },
    //         body: JSON.stringify(argObj)
    //     });
    // }

    const baseUrl = window.location.origin;
    const apiRoute = `${baseUrl}/api/`

    function sendRequest(func, params) {
        const argObj = { func, params };

        return fetch(apiRoute, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(argObj)
        })
            .then(response => {
                const contentType = response.headers.get('content-type') || '';
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}`);
                }
                if (!contentType.includes('application/json')) {
                    throw new Error('Expected JSON response');
                }
                return response.json();
            });
    }


    window.API = api;
}


function setup_default_API(API) {
    API.open = open // opens folder or files
    API.openFolder = openFolder // opens folder (if file, opens its folder)
    // searching
    API.wildcard = wildcardTest
    API.walkdir = walkAsync
    // read/write
    API.exists = async (p) => fs.promises.access(p).then(() => true).catch(() => false);
    // API.writeFile = async (...args) => { fs.promises.writeFile(...args); return "success"; }
    API.writeFile = safeWriteFile;
    API.readFile = fs.promises.readFile;
    API.stat = fs.promises.stat; // get metadata
    // cmds
    API.cmdExec = cmdExec;
    API.cmdSpawn = cmdSpawn;
    // path
    // todo: avoid tbh. less network hops, can be done in-browser
    // tod: maybe we make API supports local functions rather than all async network funcs?
    API.dirname = async (p) => path.dirname(p)
    API.basename = async (p) => path.basename(p); //get just the file/folder name.
    API.server_dirname = async () => __dirname
}


async function safeWriteFile(path, data, options = {}) {
    // safety check
    async function shouldOverwrite(filePath) {
        return options.overwrite; // just follow options for now.
    }

    if (await shouldOverwrite(path)) {
        await fs.writeFile(path, data, options);
        return true;
    }
    return false; // skip writing
}


async function cmdExec(cmd, options = {}) {
    return new Promise((resolve, reject) => {
        exec(cmd, options, (error, stdout, stderr) => {
            if (error) return reject({ error, stderr });
            resolve({ stdout, stderr });
        });
    });
}

async function cmdSpawn(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: ["ignore", "pipe", "pipe"],
            ...options,
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (d) => (stdout += d.toString()));
        child.stderr.on("data", (d) => (stderr += d.toString()));

        child.on("error", reject);

        child.on("close", (code) => {
            resolve({ code, stdout, stderr });
        });
    });
}


async function wildcardTest(string, pattern) {
    return micromatch.isMatch(string, pattern)
}

async function openFolder(filePath) {
    const stat = await fs.promises.stat(filePath);
    const folder = stat.isDirectory() ? filePath : path.dirname(filePath);
    await open(folder);
}

export async function walkAsync(root, options = {}) {

    const {
        depth = Infinity,
        gather = 'files', // dirs, files, all
        wildcard = null, // '*.png' OR ['**/*.png', '**/*.fbx']
        ignore = ['**/node_modules/**', '**/.git/**'],
    } = options;

    const results = new Set();

    // normalize to arrays
    const wildcardPatterns = wildcard
        ? Array.isArray(wildcard)
            ? wildcard
            : [wildcard]
        : null;

    const ignorePatterns = ignore
        ? Array.isArray(ignore)
            ? ignore
            : [ignore]
        : [];

    // compile matchers
    const isMatch = wildcardPatterns
        ? micromatch.matcher(wildcardPatterns)
        : null;

    const isIgnored = ignorePatterns.length
        ? micromatch.matcher(ignorePatterns)
        : null;

    // iterative queue = faster than recursion
    const queue = [{
        dir: root,
        depth: 0
    }];

    while (queue.length > 0) {

        const current = queue.pop();

        let entries;

        try {
            entries = await fs.promises.readdir(current.dir, {
                withFileTypes: true
            });
        }
        catch {
            continue;
        }

        for (const entry of entries) {

            const full = path.join(current.dir, entry.name);

            // relative path for glob matching
            const relative = path.relative(root, full).replaceAll('\\', '/');

            if (isIgnored?.(relative)) {
                continue;
            }

            if (entry.isDirectory()) {

                if (
                    (gather === 'dirs' || gather === 'all') &&
                    (!isMatch || isMatch(relative))
                ) {
                    results.add(full);
                }

                if (current.depth < depth) {
                    queue.push({
                        dir: full,
                        depth: current.depth + 1
                    });
                }

                continue;
            }

            if (entry.isFile()) {

                if (
                    (gather === 'files' || gather === 'all') &&
                    (!isMatch || isMatch(relative))
                ) {
                    results.add(full);
                }
            }
        }
    }

    return Array.from(results);
}





// --- if run directly, start an express server ---
// if (import.meta.main) { // doesn't work on pm1. argv[1] fails miserably too
// if (process.argv.some(arg => arg.includes('io_server.js'))) { // hacky, can fail easily.

    // ANSI escape codes
    const RESET = '\x1b[0m';
    const CYAN = '\x1b[36m';
    const DIM = '\x1b[2m';
    console.log(`${DIM}To change port, run as:${RESET}`);
    console.log(`${DIM}   UNIX/POWERSHELL: $env:PORT=4000; node io_server.js${RESET}`);
    console.log(`${DIM}To serve HTML file (for api testing purposes) enable:${RESET}`);
    console.log(`${DIM}   UNIX/POWERSHELL: $env:HTML="index.html"; ${RESET}`);

    const app = express();
    app.use(IOServer({}));

    if (process.env.HTML) {
        app.use(express.static('./'));
        app.get('/', (req, res) => {
            const htmlFileLocation = path.resolve(`./${process.env.HTML}`)
            res.sendFile(htmlFileLocation); // don't use __dirnamee. rather "./"
        });
        console.log(`Serving HTML file for API testing purposes.`);
    }
    const PORT = process.env.PORT || 3645;
    app.listen(PORT, () => {
        console.log(`IO Server listening at ${CYAN}http://localhost:${PORT}/${RESET}`, `${DIM}API script is at /api.js${RESET}`);
    });
// }


