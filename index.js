// index.js
import Fastify from 'fastify';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';
import twilio from 'twilio';
import { fileURLToPath } from 'url';
import { whisperTranscribe } from './whisperService.js';
import { createZohoDeskTicket } from './ticketService.js';
import { extractTicketSubjectFromConversation } from './extractTicketSubjectFromConversation.js';
import { registerCaller, getCallerInfo, debugRegistry } from './callRegistry.js';
import { checkAndHandleEndCall } from './endCallHandler.js';
import { startCallTimer, stopCallTimer } from './calltimer.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pendingCallers = new Map();

const { OPENAI_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
if (!OPENAI_API_KEY || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
  console.error('Missing environment variables.');
  process.exit(1);
}

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const configPath = './config.json';
let config;

try {
  const configData = fs.readFileSync(configPath, 'utf8');
  config = JSON.parse(configData);
  config.system_message = JSON.stringify(config.system_message);
} catch (error) {
  console.error('Failed to load config:', error);
  process.exit(1);
}

const fastify = Fastify();
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

const { system_message, voice, temperature, api_url, model } = config;
const transcriptLogPath = path.join(__dirname, 'transcript.log');

fastify.all('/incoming-call', async (request, reply) => {
  const callSid = request.body.CallSid || request.query.CallSid;
  const from = request.body.From || request.query.From || 'Unknown';

  console.log('[Incoming Call] Query:', request.query);
  console.log('[Incoming Call] Body:', request.body);

  if (callSid && from) {
    pendingCallers.set(callSid, from);
    console.log(`🕓 Stored pending caller ${from} for CallSid ${callSid}`);
  }

  const voiceResponse = new twilio.twiml.VoiceResponse();
  voiceResponse.say({ voice: 'Polly.Matthew' }, "Thank you for calling. I am connecting you to Luna, Lumiring technical support. Please wait a moment.");
  voiceResponse.pause({ length: 1 });
  voiceResponse.say({ voice: 'Polly.Matthew' }, "You are now connected. Please state your concern.");
  voiceResponse.connect().stream({
    url: `wss://${request.headers.host}/media-stream`
  });

  reply.type('text/xml').send(voiceResponse.toString());
});

fastify.register(async (fastify) => {
  fastify.get('/media-stream', { websocket: true }, (connection, req) => {
    let callSid = null;
    let streamSid = null;
    const callStartTime = Date.now();
    let allowInterruption = true;
    let audioChunks = [];
    let transcriptList = [];

    function logTranscript(speaker, message) {
      const timestamp = Date.now() - callStartTime;
      if (
        transcriptList.length &&
        transcriptList.at(-1).speaker === speaker &&
        transcriptList.at(-1).message === message.trim()
      ) return;
      transcriptList.push({ speaker, message: message.trim(), timestamp });
    }

    const openAiWs = new WebSocket(`${api_url}?model=${model}`, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1"
      }
    });

    connection.on('message', (msg) => {
      const data = JSON.parse(msg);

      if (data.event === 'start') {
        streamSid = data.start.streamSid;
        callSid = data.start.callSid;
        console.log("🛰️ WebSocket started for CallSid:", callSid);

        const from = pendingCallers.get(callSid) || 'Unknown';
        console.log("📥 Retrieved pending caller from map:", from);

        if (callSid && from) {
          registerCaller(callSid, from);
          console.log(`📞 Registered Caller: ${from} (CallSid: ${callSid})`);
          pendingCallers.delete(callSid);
        }

        startCallTimer(callSid, connection, streamSid, openAiWs);
      } else if (data.event === 'media' && openAiWs.readyState === WebSocket.OPEN) {
        const payload = data.media.payload;
        audioChunks.push(Buffer.from(payload, 'base64'));
        openAiWs.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: payload
        }));
      }
    });

    openAiWs.on('open', () => {
      openAiWs.send(JSON.stringify({
        type: 'session.update',
        session: {
          turn_detection: {
            type: 'server_vad',
            threshold: 0.8,
            silence_duration_ms: 400
          },
          input_audio_format: 'g711_ulaw',
          output_audio_format: 'g711_ulaw',
          voice,
          instructions: system_message,
          modalities: ['text', 'audio'],
          temperature
        }
      }));
    });

    openAiWs.on('message', async (data) => {
      try {
        const response = JSON.parse(data);

        if (response.type === 'turn.start') {
          deliverPendingWarning(callSid, openAiWs);
        }

        if (response.type === 'response.audio.delta' && response.delta) {
          allowInterruption = false;
          setTimeout(() => { allowInterruption = true }, 1500);
          connection.send(JSON.stringify({
            event: 'media',
            streamSid,
            media: { payload: response.delta }
          }));
        }

        if (response.type === 'response.done') {
          const transcript = response.response.output?.[0]?.content?.[0]?.transcript || '';
          logTranscript("Luna", transcript);

          const shouldEnd = await checkAndHandleEndCall(transcript, callSid, connection, openAiWs, streamSid);
          if (shouldEnd) return;

          const transferPhrases = [
            "speak to an agent", "talk to a person", "human", "representative",
            "transfer me", "transfer you to one of our human representatives",
            "i'll transfer you", "please hold", "connect you to a human"
          ];

          if (transferPhrases.some(p => transcript.toLowerCase().includes(p))) {
            if (callSid) {
              console.log(`[AUTO-TRANSFER] Trigger detected: "${transcript}"`);
              setTimeout(() => handleCallTransfer(callSid, "+639265803317"), 6000);
            }
          }
        }

        if (response.type === 'input.text') {
          logTranscript("User", response.text || '');
        }

        if (response.type === "input_audio_buffer.speech_started" && allowInterruption) {
          connection.send(JSON.stringify({ event: 'clear', streamSid }));
          openAiWs.send(JSON.stringify({ type: 'response.cancel' }));
        }

      } catch (err) {
        console.error('Error processing OpenAI message:', err, 'Raw message:', data);
      }
    });

    connection.on('close', async () => {
      openAiWs.close();
      stopCallTimer(callSid);

      try {
        const completeAudio = Buffer.concat(audioChunks);
        const result = await whisperTranscribe(completeAudio);

        if (result?.segments?.length) {
          for (const segment of result.segments) {
            transcriptList.push({
              speaker: 'User',
              message: segment.text.trim(),
              timestamp: segment.start * 1000
            });
          }
        }

        transcriptList.sort((a, b) => a.timestamp - b.timestamp);
        for (const entry of transcriptList) {
          const logEntry = `${entry.speaker}: ${entry.message}\n`;
          fs.appendFile(transcriptLogPath, logEntry, (err) => {
            if (err) console.error('Failed to write to transcript log:', err);
          });
        }

        const transcriptText = transcriptList.map(t => `${t.speaker}: ${t.message}`).join('\n');
        debugRegistry();

        const callerInfo = getCallerInfo(callSid);
        console.log("📦 Retrieved Caller Info:", callerInfo);

        const callerNumber = callerInfo?.phoneNumber || 'Unknown Number';
        const fullDescription = `Caller Number: ${callerNumber}\n\n${transcriptText}`;
        const subject = await extractTicketSubjectFromConversation(transcriptText);

        await createZohoDeskTicket(subject, fullDescription, 'test@lumiring.com');

      } catch (err) {
        console.error('[Whisper Logging Error]', err);
      }
    });
  });
});

async function handleCallTransfer(callSid, agentNumber) {
  try {
    const conferenceName = `transfer_${callSid}`;
    const call = await twilioClient.calls(callSid).fetch();

    const customerTwiml = new twilio.twiml.VoiceResponse();
    customerTwiml.say({ voice: 'Polly.Matthew' }, "Please hold while we connect you to an agent.");
    customerTwiml.dial().conference({
      startConferenceOnEnter: false,
      endConferenceOnExit: false,
      waitUrl: "http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical"
    }, conferenceName);

    await twilioClient.calls(callSid).update({ twiml: customerTwiml.toString() });

    await twilioClient.calls.create({
      to: agentNumber,
      from: call.from,
      twiml: `<Response><Say voice="Polly.Matthew">Connecting you to a caller from Luna AI.</Say><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false">${conferenceName}</Conference></Dial></Response>`
    });

    console.log(`[Transfer] Call ${callSid} transferred successfully.`);
  } catch (err) {
    console.error("[Transfer Error]:", err);
  }
}

const PORT = process.env.PORT || 5050;
fastify.listen({ port: PORT, host: '0.0.0.0' }, () => {
  console.log(`Server is listening on port ${PORT}`);
});
