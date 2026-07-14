const crypto = require('crypto');

// Generate a LiveKit-compatible JWT using only Node.js built-ins.
// This avoids any ESM/CJS compatibility issues with livekit-server-sdk.
function createLivekitToken(apiKey, apiSecret, identity, roomName, ttlSeconds = 3600) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: apiKey,
    sub: identity,
    jti: identity,
    iat: now,
    nbf: now,
    exp: now + ttlSeconds,
    video: {
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    },
  })).toString('base64url');

  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const roomName = req.query.room || 'nexcell-lobby';
  const participantName = req.query.name || 'Guest';

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const lvkUrl = process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret) {
    return res.status(500).json({ 
      error: 'LiveKit API credentials missing',
      hasKey: !!apiKey,
      hasSecret: !!apiSecret,
      hasUrl: !!lvkUrl
    });
  }

  try {
    const token = createLivekitToken(apiKey, apiSecret, participantName, roomName);
    res.status(200).json({ token, url: lvkUrl });
  } catch (error) {
    console.error("Token generation failed:", error);
    res.status(500).json({ 
      error: "Failed to generate token", 
      message: error.message 
    });
  }
};
