// callRegistry.js
const callRegistry = new Map();

/**
 * Save caller info to the call registry.
 * @param {string} callSid - Unique CallSid from Twilio.
 * @param {string} phoneNumber - The caller's phone number.
 */
function registerCaller(callSid, phoneNumber) {
  callRegistry.set(callSid, { callSid, phoneNumber });
}

/**
 * Retrieve caller info by CallSid.
 * @param {string} callSid - CallSid to look up.
 * @returns {object|null} Caller info or null.
 */
function getCallerInfo(callSid) {
  return callRegistry.get(callSid) || null;
}

/**
 * Debug helper to log the contents of the call registry.
 */
function debugRegistry() {
  console.log("🧠 callRegistry contents:");
  for (const [key, value] of callRegistry.entries()) {
    console.log(`- ${key}: ${JSON.stringify(value)}`);
  }
}

export { registerCaller, getCallerInfo, debugRegistry };
