const http = require('http');
const { URL, URLSearchParams } = require('url');

const CLIENT_ID = '77pc7omun6t35u';
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || '';
const REDIRECT_URI = 'http://localhost:3000/callback';
const SCOPES = 'openid profile email w_member_social';

const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost:3000');

    // Main page
    if (url.pathname === '/' && req.method === 'GET') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        const errorDesc = url.searchParams.get('error_description');

        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>LinkedIn OAuth Token Generator</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
        .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .btn { background: #0077b5; color: white; padding: 12px 24px; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block; font-size: 16px; margin: 10px 0; }
        .btn:hover { background: #004c8c; }
        .token { background: #f0f8ff; padding: 15px; border-radius: 4px; margin: 20px 0; border-left: 4px solid #0077b5; word-break: break-all; }
        .error { background: #ffebee; padding: 15px; border-radius: 4px; margin: 20px 0; border-left: 4px solid #d32f2f; }
        .warning { background: #fff8e1; padding: 15px; border-radius: 4px; margin: 20px 0; border-left: 4px solid #ffa726; }
        textarea { width: 100%; margin: 10px 0; padding: 8px; font-family: monospace; border: 1px solid #ddd; border-radius: 4px; resize: vertical; }
    </style>
</head>
<body>
    <div class="container">
        <h1>LinkedIn OAuth Token Generator</h1>
        
        ${code ? '' : `
        <p>Click below to authenticate with LinkedIn and get your access token:</p>
        <a href="https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPES)}" class="btn">
            🔗 Authenticate with LinkedIn
        </a>
        `}

        <div id="result">
            ${error ? `
                <div class="error">
                    <strong>❌ Authentication Error:</strong><br>
                    <strong>Error:</strong> ${error}<br>
                    <strong>Description:</strong> ${errorDesc ? decodeURIComponent(errorDesc.replace(/\+/g, ' ')) : 'Unknown'}
                </div>
            ` : ''}
            ${code ? '<div class="warning">⏳ Exchanging authorization code for access token...</div>' : ''}
        </div>

        ${!code && !error ? `
        <div class="warning">
            <strong>⚠️ Important:</strong> Make sure your LinkedIn app has these scopes enabled:
            <ul>
                <li><code>openid</code> - OpenID Connect</li>
                <li><code>profile</code> - Profile information</li>
                <li><code>email</code> - Email address</li>
                <li><code>w_member_social</code> - Share content on LinkedIn</li>
            </ul>
        </div>

        <h3>How to use your token:</h3>
        <ol>
            <li>Click "Authenticate with LinkedIn" above</li>
            <li>Log in to LinkedIn and allow permissions</li>
            <li>Copy the access token that appears</li>
            <li>Paste it in DotShare extension → Platforms → LinkedIn → Access Token</li>
        </ol>
        ` : ''}
    </div>

    <script>
        const code = '${code || ''}';
        
        if (code) {
            console.log('Authorization code detected:', code.substring(0, 20) + '...');
            exchangeCodeForToken(code);
        }

        async function exchangeCodeForToken(authCode) {
            try {
                console.log('Sending token exchange request...');
                const response = await fetch('/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: authCode })
                });

                console.log('Response status:', response.status);
                const data = await response.json();
                console.log('Response data:', data);

                if (data.access_token) {
                    document.getElementById('result').innerHTML = \`
                        <div class="token">
                            <strong>✅ Success! Your LinkedIn Access Token:</strong><br>
                            <textarea rows="4" id="token-text">\${data.access_token}</textarea>
                            <button onclick="copyToken()" class="btn">📋 Copy Token</button><br><br>
                            <strong>Expires in:</strong> \${data.expires_in ? Math.round(data.expires_in / 86400) + ' days (' + data.expires_in + ' seconds)' : 'Unknown'}<br>
                            <strong>Scope:</strong> \${data.scope || 'Not specified'}<br><br>
                            <strong>Next step:</strong> Paste this token in DotShare extension → Platforms → LinkedIn
                        </div>
                    \`;
                    // Auto-select token
                    setTimeout(() => {
                        const textarea = document.getElementById('token-text');
                        if (textarea) {
                            textarea.select();
                            textarea.focus();
                        }
                    }, 100);
                } else {
                    document.getElementById('result').innerHTML = \`
                        <div class="error">
                            <strong>❌ Error getting token:</strong><br>
                            <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; white-space: pre-wrap;">\${JSON.stringify(data, null, 2)}</pre>
                            <a href="/" class="btn">🔄 Try Again</a>
                        </div>
                    \`;
                }
            } catch (error) {
                console.error('Exchange failed:', error);
                document.getElementById('result').innerHTML = \`
                    <div class="error">
                        <strong>❌ Failed to exchange code:</strong><br>
                        \${error.message}<br><br>
                        <a href="/" class="btn">🔄 Try Again</a>
                    </div>
                \`;
            }
        }

        function copyToken() {
            const textarea = document.getElementById('token-text');
            textarea.select();
            document.execCommand('copy');
            const btn = event.target;
            const originalText = btn.textContent;
            btn.textContent = '✅ Copied!';
            setTimeout(() => btn.textContent = originalText, 2000);
        }
    </script>
</body>
</html>`;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
    }
    
    // Token exchange endpoint
    else if (url.pathname === '/token' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { code } = JSON.parse(body);
                console.log('\n📤 Exchanging authorization code...');
                console.log('Code (first 20 chars):', code.substring(0, 20) + '...');

                const https = require('https');
                const postData = new URLSearchParams({
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: REDIRECT_URI,
                    client_id: CLIENT_ID,
                    client_secret: CLIENT_SECRET
                });

                const options = {
                    hostname: 'www.linkedin.com',
                    port: 443,
                    path: '/oauth/v2/accessToken',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Content-Length': Buffer.byteLength(postData.toString())
                    }
                };

                const tokenData = await new Promise((resolve, reject) => {
                    const tokenReq = https.request(options, (tokenRes) => {
                        let data = '';
                        tokenRes.on('data', chunk => data += chunk);
                        tokenRes.on('end', () => {
                            try {
                                const parsed = JSON.parse(data);
                                console.log('📥 LinkedIn response status:', tokenRes.statusCode);
                                if (parsed.error) {
                                    console.error('❌ Error from LinkedIn:', parsed);
                                } else {
                                    console.log('✅ Token received successfully');
                                    console.log('Token (first 20 chars):', parsed.access_token?.substring(0, 20) + '...');
                                }
                                resolve(parsed);
                            } catch (e) {
                                console.error('❌ Failed to parse response:', data);
                                reject(new Error('Invalid JSON response: ' + data));
                            }
                        });
                    });

                    tokenReq.on('error', (err) => {
                        console.error('❌ Request error:', err);
                        reject(err);
                    });
                    
                    tokenReq.write(postData.toString());
                    tokenReq.end();
                });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(tokenData));
            } catch (error) {
                console.error('❌ Token exchange failed:', error.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    }
    
    // Callback handler - redirect to main page with params
    else if (url.pathname === '/callback' && req.method === 'GET') {
        const params = url.search.substring(1);
        console.log('\n📍 Callback received, redirecting to main page...');
        res.writeHead(302, { 'Location': '/?' + params });
        res.end();
    }
    
    // 404
    else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`\n===========================================`);
    console.log(`🔗 LinkedIn OAuth Server Started!`);
    console.log(`===========================================`);
    console.log(`➤ Open: http://localhost:${PORT}`);
    console.log(`➤ Scopes: ${SCOPES}`);
    console.log(`➤ Press Ctrl+C to stop`);
    console.log(`===========================================\n`);
});

process.on('SIGINT', () => {
    console.log('\n🔗 Server stopped.');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🔗 Server stopped.');
    process.exit(0);
});