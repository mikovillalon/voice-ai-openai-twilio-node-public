import axios from 'axios';  // Make sure axios is imported at the top
import dotenv from 'dotenv';
dotenv.config();

// Function to refresh the access token using the refresh token
export async function refreshAccessToken() {
  try {
    const res = await axios.post('https://accounts.zoho.com/oauth/v2/token', null, {
      params: {
        grant_type: 'refresh_token',
        client_id: process.env.ZOHO_CLIENT_ID,
        client_secret: process.env.ZOHO_CLIENT_SECRET,
        refresh_token: process.env.ZOHO_REFRESH_TOKEN,
      }
    });

    // Log full response for debugging
    console.log("Zoho Response:", res.data);

    const { access_token, expires_in } = res.data;
    const newExpiry = Date.now() + expires_in * 1000;

    if (!access_token) {
      throw new Error('No access token received from Zoho');
    }

    console.log('🔁 Refreshed Zoho access token');
    console.log('New Access Token:', access_token);
    console.log('Token Expires In:', expires_in, 'ms');

    // Store refreshed token and expiry time
    process.env.ZOHO_ACCESS_TOKEN = access_token;
    process.env.ZOHO_ACCESS_TOKEN_EXPIRY = newExpiry;

    return access_token;  // Return the refreshed token
  } catch (err) {
    console.error('❌ Failed to refresh access token:', err.response?.data || err.message);
    throw err;
  }
}
