import { AccessToken } from 'livekit-server-sdk';

export default async function handler(req, res) {
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
    const at = new AccessToken(apiKey, apiSecret, { identity: participantName });
    at.addGrant({ roomJoin: true, room: roomName });
    const token = await at.toJwt();
    res.status(200).json({ token, url: lvkUrl });
  } catch (error) {
    console.error("Token generation failed:", error);
    res.status(500).json({ 
      error: "Failed to generate token", 
      message: error.message 
    });
  }
}
