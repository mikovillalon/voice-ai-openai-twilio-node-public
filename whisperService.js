// whisperService.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import wav from 'wav';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function whisperTranscribe(audioBuffer) {
  try {
    const tmpRawPath = path.join(__dirname, 'tmp_audio.ulaw');
    const tmpWavPath = path.join(__dirname, 'tmp_audio.wav');

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
      response_format: 'verbose_json'
    });

    // Clean up temp files
    fs.unlinkSync(tmpRawPath);
    fs.unlinkSync(tmpWavPath);

    return response; // contains .segments array
  } catch (err) {
    console.error('[Whisper Transcription Error]', err);
    return null;
  }
}
