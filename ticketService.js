import axios from 'axios';
import dotenv from 'dotenv';
import { refreshAccessToken } from './tokenService.js';  // ✅ Import the function here

dotenv.config();

// Function to create Zoho Desk tickets
export async function createZohoDeskTicket(subject, description, email = 'caller@lumiring.com') {
  try {
    // Ensure the department ID is correctly entered
    const departmentId = process.env.ZOHO_DEPARTMENT_ID;
    if (!departmentId) {
      throw new Error('Department ID is missing in the environment variables');
    }

    // Format description to replace \n with <br> for better display in Zoho Desk
    const formattedDescription = description.replace(/\n/g, '<br>'); 

    // Log the ticket data being sent for debugging
    console.log("Creating Zoho Desk Ticket with formatted description:", {
      subject,
      departmentId,
      email,
      formattedDescription
    });

    let accessToken = process.env.ZOHO_ACCESS_TOKEN;

    if (!accessToken || Date.now() > process.env.ZOHO_ACCESS_TOKEN_EXPIRY) {
      // If access token is expired or missing, refresh it
      console.log('⚠️ No token found or token expired. Refreshing...');
      accessToken = await refreshAccessToken();
    }

    // Constructing ticket data
    const ticketData = {
      subject,
      departmentId: departmentId,  // Ensure this is the correct department ID
      contact: { email },
      description: formattedDescription, // Use the formatted description with <br> tags
      priority: "Medium", // Ensure valid priority value (e.g., "Medium")
      status: "Open" // Ensure valid status value (e.g., "Open")
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
      // If token is invalid, refresh and retry
      console.warn('🔄 Token expired. Retrying with new token...');
      accessToken = await refreshAccessToken();
      return await createZohoDeskTicket(subject, description, email);
    } else {
      // Log full error for better debugging
      console.error('❌ Failed to create ticket:', err.response?.data || err.message);
      throw err;
    }
  }
}
