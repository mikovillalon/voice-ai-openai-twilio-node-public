// whisperService.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import wav from 'wav';
import Vad from 'node-vad'; // <-- NEW: Import node-vad

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const vad = new Vad(Vad.Mode.NORMAL); // NORMAL sensitivity

export async function whisperTranscribe(audioBuffer) {
  let tmpRawPath, tmpWavPath;

  try {
    // First: Check if audio contains voice using VAD
    const vadResult = await vad.processAudio(audioBuffer, 8000); // 8000 Hz (telephony audio sample rate)

    if (vadResult !== Vad.Event.VOICE) {
      console.log('🔇 [VAD] No voice detected, skipping transcription.');
      return null; // Skip processing if no voice
    }

    console.log('🎤 [VAD] Voice detected, proceeding to Whisper transcription.');

    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    tmpRawPath = path.join(__dirname, `tmp_audio-${uniqueId}.ulaw`);
    tmpWavPath = path.join(__dirname, `tmp_audio-${uniqueId}.wav`);

    // Save raw ulaw audio
    fs.writeFileSync(tmpRawPath, audioBuffer);

    // Convert to .wav format using WAV wrapper
    const writer = new wav.FileWriter(tmpWavPath, {
      channels: 1,
      sampleRate: 8000,
      bitDepth: 8,
      audioFormat: 7, // 7 = ulaw
    });

    const rawStream = fs.createReadStream(tmpRawPath);
    rawStream.pipe(writer);

    // Wait until WAV writing is done
    await new Promise((resolve) => writer.on('finish', resolve));

    // Transcribe with Whisper using verbose_json to get full segments
    const response = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tmpWavPath),
      model: 'whisper-1',
      response_format: 'verbose_json',
    });

    return response; // contains .segments array
  } catch (err) {
    console.error('[Whisper Transcription Error]', err);
    return null;
  } finally {
    // Always clean up temp files
    if (tmpRawPath && fs.existsSync(tmpRawPath)) {
      fs.unlinkSync(tmpRawPath);
    }
    if (tmpWavPath && fs.existsSync(tmpWavPath)) {
      fs.unlinkSync(tmpWavPath);
    }
  }
}
