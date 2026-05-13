require('dotenv').config();
const { spawn } = require('child_process');
const https = require('https');
const http = require('http');

const PORT = process.env.PORT || 3000;
const EVO_API_URL = process.env.EVO_API_URL || '';
const EVO_API_KEY = process.env.EVO_API_KEY || '';
const EVO_INSTANCE = process.env.EVO_INSTANCE || 'jesus-ai';

async function waitForCloudflared(maxRetries = 40, interval = 1500) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const url = `http://localhost:${PORT}/api/health`;
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
      });

      const tunnelUrl = await new Promise((resolve, reject) => {
        const req = http.get('http://localhost:37621/metrics', (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            const match = data.match(/cloudflared_tunnel_ha_connections\s+\d+\s*$/m);
            resolve(null);
          });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(2000, () => { req.destroy(); resolve(null); });
      });

      const publicUrl = await new Promise((resolve, reject) => {
        const req = http.get('http://localhost:37621/tunnels', (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              const tunnels = JSON.parse(data);
              resolve(tunnels);
            } catch {
              resolve(null);
            }
          });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(2000, () => { req.destroy(); resolve(null); });
      });

    } catch {}

    try {
      const response = await fetch('http://localhost:37621/tunnels');
      if (response.ok) {
        const tunnels = await response.json();
        if (Array.isArray(tunnels) && tunnels.length > 0) {
          const url = tunnels[0]?.url || tunnels[0]?.config?.ingress?.[0]?.hostname;
          if (url) return url.startsWith('http') ? url.replace(/^http/, 'https') : `https://${url}`;
        }
      }
    } catch {}

    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error('Could not get cloudflared tunnel URL');
}

async function setupWebhook(ngrokUrl) {
  if (!EVO_API_URL || !EVO_API_KEY) {
    console.log('EVO_API_URL or EVO_API_KEY not set, skipping webhook setup.');
    return;
  }

  const webhookUrl = `${ngrokUrl}/api/whatsapp/webhook`;
  console.log(`Setting up webhook: ${webhookUrl}`);

  const body = JSON.stringify({
    webhook: {
      enabled: true,
      url: webhookUrl,
      byEvents: false,
      base64: false,
      events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
    },
  });

  return new Promise((resolve, reject) => {
    const url = new URL(`/webhook/set/${EVO_INSTANCE}`, EVO_API_URL);
    const proto = url.protocol === 'http:' ? http : https;
    const opts = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVO_API_KEY,
      },
    };

    const req = proto.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log(`Webhook configured! Status: ${res.statusCode}`);
        resolve();
      });
    });

    req.on('error', (err) => {
      console.error('Webhook setup error:', err.message);
      reject(err);
    });

    req.write(body);
    req.end();
  });
}

console.log('Starting cloudflared tunnel...');
const tunnel = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${PORT}`], {
  shell: true,
  stdio: 'pipe',
});

let tunnelUrl = null;

tunnel.stdout.on('data', (data) => {
  const text = data.toString();
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (match) {
    tunnelUrl = match[0];
  }
  if (text.trim()) console.log('[cloudflared]', text.trim());
});

tunnel.stderr.on('data', (data) => {
  const text = data.toString();
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (match) {
    tunnelUrl = match[0];
  }
  if (text.includes('INF') || text.includes('ERR')) {
    console.log('[cloudflared]', text.trim());
  }
});

(async () => {
  try {
    for (let i = 0; i < 60 && !tunnelUrl; i++) {
      await new Promise(r => setTimeout(r, 1000));
    }

    if (!tunnelUrl) {
      tunnelUrl = await waitForCloudflared();
    }

    if (!tunnelUrl) {
      throw new Error('Could not determine tunnel URL');
    }

    console.log(`\n  ╔══════════════════════════════════════════════╗`);
    console.log(`  ║  Cloudflare Tunnel Active                    ║`);
    console.log(`  ║  ${tunnelUrl.padEnd(42)}║`);
    console.log(`  ╚══════════════════════════════════════════════╝\n`);

    await setupWebhook(tunnelUrl);

    console.log('\n  Setup complete! WhatsApp webhooks forwarded to your server.');
    console.log('  Press Ctrl+C to stop.\n');
  } catch (err) {
    console.error('Setup failed:', err.message);
    tunnel.kill();
    process.exit(1);
  }
})();

process.on('SIGINT', () => {
  console.log('\nStopping cloudflared tunnel...');
  tunnel.kill();
  process.exit(0);
});