// callTimer.js

import twilio from 'twilio';
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const callTimers = new Map();

// 🎯 Production Timing (only auto-end at 10 minutes)
const maxCallDurationMs = 10 * 60 * 1000; // 10 minutes

function startCallTimer(callSid, connection, streamSid, openAiWs) {
  const startTime = Date.now();

  const endTimeout = setTimeout(async () => {
    try {
      console.log(`🛑 Production timeout reached. Forcing call end for CallSid: ${callSid}`);
      await twilioClient.calls(callSid).update({ status: 'completed' });
    } catch (err) {
      console.error('❌ Failed to end call via Twilio:', err.message);
    }
  }, maxCallDurationMs);

  callTimers.set(callSid, { startTime, endTimeout });
  console.log(`⏱️ Timer started for CallSid: ${callSid}`);
}

function stopCallTimer(callSid) {
  const timer = callTimers.get(callSid);
  if (!timer) return null;

  clearTimeout(timer.endTimeout);
  callTimers.delete(callSid);

  const duration = Date.now() - timer.startTime;
  console.log(`⏹️ Timer stopped for CallSid: ${callSid} | Duration: ${duration}ms`);
  return duration;
}

function getElapsedTime(callSid) {
  const timer = callTimers.get(callSid);
  if (!timer) return null;

  return Date.now() - timer.startTime;
}

export { startCallTimer, stopCallTimer, getElapsedTime };
