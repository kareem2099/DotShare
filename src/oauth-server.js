const http = require('http');
const https = require('https');
const url = require('url');
const { URLSearchParams } = require('url');

// Server configuration only (no keys here)
const PORT = process.env.PORT || 3000;

const SERVER_URL = 'https://web-production-9d87f2.up.railway.app';
const REDIRECT_URI = `${SERVER_URL}/callback`;

const server = http.createServer((req, res) => {
    // Handle CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const reqUrl = new url.URL(req.url, SERVER_URL);

    // --- 1. Main user interface ---
    if (reqUrl.pathname === '/' && req.method === 'GET') {
        const code = reqUrl.searchParams.get('code');
        const error = reqUrl.searchParams.get('error');
        const errorDesc = reqUrl.searchParams.get('error_description');

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(getHtmlInterface(code, error, errorDesc));
    }

    // --- 2. Handle callback (redirects to main page with code) ---
    else if (reqUrl.pathname === '/callback' && req.method === 'GET') {
        const params = reqUrl.search; // ?code=...
        res.writeHead(302, { 'Location': '/' + params });
        res.end();
    }

    // --- 3. Token request (receives keys from user) ---
    else if (reqUrl.pathname === '/token' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);

                // Verify that user sent the keys
                if (!data.code || !data.client_id || !data.client_secret) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Missing code, client_id, or client_secret' }));
                }

                // Execute the request
                exchangeCodeForToken(data, res);
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    }

    else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

// Function to exchange code for token (uses user's keys)
function exchangeCodeForToken(data, clientRes) {
    const postData = new URLSearchParams({
        grant_type: 'authorization_code',
        code: data.code,
        redirect_uri: REDIRECT_URI,
        client_id: data.client_id,        // User's key
        client_secret: data.client_secret // User's secret
    }).toString();

    const options = {
        hostname: 'www.linkedin.com',
        port: 443,
        path: '/oauth/v2/accessToken',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const tokenReq = https.request(options, (tokenRes) => {
        let responseData = '';
        tokenRes.on('data', chunk => responseData += chunk);
        tokenRes.on('end', () => {
            clientRes.writeHead(tokenRes.statusCode, { 'Content-Type': 'application/json' });
            clientRes.end(responseData);
        });
    });

    tokenReq.on('error', () => {
        clientRes.writeHead(500, { 'Content-Type': 'application/json' });
        clientRes.end(JSON.stringify({ error: 'Failed to connect to LinkedIn' }));
    });

    tokenReq.write(postData);
    tokenReq.end();
}

// Function to generate HTML (dynamic interface)
function getHtmlInterface(code, error, errorDesc) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>DotShare - LinkedIn Token Generator</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #f3f4f6; color: #1f2937; }
        .container { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
        h1 { color: #0a66c2; margin-top: 0; font-size: 24px; text-align: center; }
        .input-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; }
        input[type="text"], input[type="password"] { width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; font-size: 16px; transition: border-color 0.2s; }
        input:focus { outline: none; border-color: #0a66c2; ring: 2px solid #0a66c2; }
        .btn { background: #0a66c2; color: white; padding: 12px 24px; border: none; border-radius: 6px; cursor: pointer; width: 100%; font-size: 16px; font-weight: 600; transition: background 0.2s; }
        .btn:hover { background: #004182; }
        .token-box { background: #f0fdf4; padding: 20px; border-radius: 8px; border: 1px solid #bbf7d0; margin-top: 20px; display: none; }
        .token-text { width: 100%; padding: 10px; background: #fff; border: 1px solid #ddd; border-radius: 4px; font-family: monospace; height: 100px; resize: none; margin-bottom: 10px; }
        .error { background: #fef2f2; color: #991b1b; padding: 15px; border-radius: 6px; border: 1px solid #fecaca; margin-bottom: 20px; }
        .hidden { display: none; }
        .loading { text-align: center; color: #6b7280; margin-top: 20px; display: none; }
        .hint { font-size: 12px; color: #6b7280; margin-top: 4px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>LinkedIn Token Generator</h1>

        ${error ? `<div class="error"><strong>Error:</strong> ${error}<br>${errorDesc || ''}</div>` : ''}

        <div id="step1">
            <p style="text-align: center; margin-bottom: 30px; color: #4b5563;">Enter your App Credentials to start.</p>

            <div class="input-group">
                <label>Client ID</label>
                <input type="text" id="clientId" placeholder="From LinkedIn Developer Portal">
            </div>

            <div class="input-group">
                <label>Client Secret</label>
                <input type="password" id="clientSecret" placeholder="From LinkedIn Developer Portal">
                <p class="hint">Your secret is processed locally and not stored on any server.</p>
            </div>

            <button onclick="startAuth()" class="btn">Authenticate</button>
        </div>

        <div id="loading" class="loading">
            Processing... Please wait.
        </div>

        <div id="result" class="token-box">
            <h3 style="margin-top: 0; color: #166534;">✅ Access Token Generated</h3>
            <textarea id="finalToken" class="token-text" readonly></textarea>
            <button onclick="copyToken()" class="btn" style="background: #16a34a;">Copy Token</button>
        </div>
    </div>

    <script>
        const REDIRECT_URI = '${REDIRECT_URI}';
        const SCOPES = 'openid profile email w_member_social'; // Updated scopes

        // Retrieve code from URL
        const urlParams = new URLSearchParams(window.location.search);
        const code = '${code || ''}';

        // Restore data from temporary storage
        if (sessionStorage.getItem('li_client_id')) {
            document.getElementById('clientId').value = sessionStorage.getItem('li_client_id');
            document.getElementById('clientSecret').value = sessionStorage.getItem('li_client_secret');
        }

        // If we returned with a code, start the exchange
        if (code) {
            exchangeToken(code);
        }

        function startAuth() {
            const clientId = document.getElementById('clientId').value.trim();
            const clientSecret = document.getElementById('clientSecret').value.trim();

            if (!clientId || !clientSecret) {
                alert('Please enter both Client ID and Client Secret');
                return;
            }

            // Save data temporarily in browser for use after return
            sessionStorage.setItem('li_client_id', clientId);
            sessionStorage.setItem('li_client_secret', clientSecret);

            const authUrl = \`https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=\${clientId}&redirect_uri=\${encodeURIComponent(REDIRECT_URI)}&scope=\${encodeURIComponent(SCOPES)}\`;
            window.location.href = authUrl;
        }

        async function exchangeToken(authCode) {
            document.getElementById('step1').classList.add('hidden');
            document.getElementById('loading').style.display = 'block';

            const clientId = sessionStorage.getItem('li_client_id');
            const clientSecret = sessionStorage.getItem('li_client_secret');

            if (!clientId || !clientSecret) {
                alert('Session expired. Please enter credentials again.');
                document.getElementById('step1').classList.remove('hidden');
                document.getElementById('loading').style.display = 'none';
                return;
            }

            try {
                const response = await fetch('/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        code: authCode,
                        client_id: clientId,
                        client_secret: clientSecret
                    })
                });

                const data = await response.json();
                document.getElementById('loading').style.display = 'none';

                if (data.access_token) {
                    document.getElementById('result').style.display = 'block';
                    document.getElementById('finalToken').value = data.access_token;
                    // Clear secrets from memory for security
                    sessionStorage.removeItem('li_client_secret');
                } else {
                    alert('Error: ' + JSON.stringify(data));
                    document.getElementById('step1').classList.remove('hidden');
                }
            } catch (_err) {
                console.error(_err);
                alert('Network error occurred');
                document.getElementById('step1').classList.remove('hidden');
            }
        }

        function copyToken() {
            const tokenText = document.getElementById('finalToken');
            tokenText.select();
            document.execCommand('copy');
            const btn = event.target;
            const originalText = btn.textContent;
            btn.textContent = '✅ Copied!';
            setTimeout(() => btn.textContent = originalText, 2000);
        }
    </script>
</body>
</html>
    `;
}

server.listen(PORT, () => {
    console.log('\n===========================================');
    console.log(`🔗 DotShare OAuth Tool Running`);
    console.log(`➤ Open: http://localhost:${PORT}`);
    console.log('===========================================\n');
});
