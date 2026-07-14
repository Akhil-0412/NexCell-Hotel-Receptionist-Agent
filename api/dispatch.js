const crypto = require('crypto');

function createAdminToken(apiKey, apiSecret, roomName) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: apiKey,
    sub: 'admin',
    jti: 'admin-' + now,
    iat: now,
    nbf: now,
    exp: now + 60,
    video: {
      roomAdmin: true,
      room: roomName
    },
  })).toString('base64url').replace(/=/g, '');

  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(`${header}.${payload}`)
    .digest('base64url').replace(/=/g, '');

  return `${header}.${payload}.${signature}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { room } = req.body || {};
  if (!room) {
    return res.status(400).json({ error: 'Missing room parameter' });
  }

  const url    = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;

  if (!url || !apiKey || !secret) {
    return res.status(500).json({ error: 'LiveKit env vars not configured' });
  }

  try {
    const token = createAdminToken(apiKey, secret, room);
    const endpoint = `${url.replace('wss://', 'https://')}/twirp/livekit.AgentDispatchService/CreateDispatch`;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        agent_name: 'nexcell-receptionist',
        room: room
      })
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("LiveKit API Error:", response.status, text);
      return res.status(response.status).json({ error: "LiveKit API failed", details: text });
    }

    const data = await response.json();
    console.log(`[Dispatch] Dispatched agent to room: ${room}`);
    return res.status(200).json({ success: true, dispatch: data });
  } catch (err) {
    console.error('[Dispatch] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
