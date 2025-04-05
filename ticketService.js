import axios from 'axios';
import dotenv from 'dotenv';
import { refreshAccessToken } from './tokenService.js';
import { extractTicketSubjectFromConversation } from './extractTicketSubjectFromConversation.js';

dotenv.config();

export async function createZohoDeskTicket(description, email = 'caller@lumiring.com') {
  try {
    const departmentId = process.env.ZOHO_DEPARTMENT_ID;
    if (!departmentId) {
      throw new Error('Department ID is missing in the environment variables');
    }

    const subject = await extractTicketSubjectFromConversation(description);
    const formattedDescription = description.replace(/\n/g, '<br>');

    console.log("📝 Creating Zoho Desk Ticket with:", {
      subject,
      departmentId,
      email,
      formattedDescription
    });

    let accessToken = process.env.ZOHO_ACCESS_TOKEN;
    if (!accessToken || Date.now() > Number(process.env.ZOHO_ACCESS_TOKEN_EXPIRY)) {
      console.log('⚠️ No token found or token expired. Refreshing...');
      accessToken = await refreshAccessToken();
    }

    const ticketData = {
      subject,
      departmentId,
      contact: { email },
      description: formattedDescription,
      priority: "Medium",
      status: "Open"
    };

    const res = await axios.post(
      `https://desk.zoho.com/api/v1/tickets`,
      ticketData,
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          orgId: process.env.ZOHO_ORG_ID,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Ticket created:', res.data.ticketNumber);
    return res.data;
  } catch (err) {
    if (err.response?.data?.errorCode === 'INVALID_OAUTH') {
      console.warn('🔄 Token expired. Retrying with new token...');
      accessToken = await refreshAccessToken();
      return await createZohoDeskTicket(description, email);
    } else {
      console.error('❌ Failed to create ticket:', err.response?.data || err.message);
      throw err;
    }
  }
}
