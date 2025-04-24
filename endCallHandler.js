// endCallHandler.js
import pkg from 'twilio'; // ✅ Use default import
import dotenv from 'dotenv';

dotenv.config();

const twilio = pkg; // or: const { twilio } = pkg;

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

const endCallPhrases = [
  "end the call",
  "hang up",
  "goodbye",
  "i'm done",
  "that’s all",
  "you can end",
  "bye"
];

export async function checkAndHandleEndCall(transcript, callSid, connection, openAiWs, streamSid) {
  if (!transcript) return false;

  const match = endCallPhrases.some(p =>
    transcript.toLowerCase().includes(p)
  );

  if (!match) return false;

  console.log(`[AUTO-END] Trigger detected: "${transcript}"`);

  // Stop the Twilio media stream
  connection.send(JSON.stringify({ event: 'stop', streamSid }));

  // Close the OpenAI WebSocket
  if (openAiWs?.readyState === openAiWs.OPEN) {
    openAiWs.close();
  }

  // Actively end the Twilio call
  if (callSid) {
    try {
      await twilioClient.calls(callSid).update({ status: 'completed' });
      console.log(`[Call Ended] Call ${callSid} forcefully terminated.`);
    } catch (err) {
      console.error(`[Twilio End Call Error]`, err.message);
    }
  }

  return true;
}
