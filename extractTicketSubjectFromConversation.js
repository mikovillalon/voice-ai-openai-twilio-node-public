import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function extractTicketSubjectFromConversation(conversation) {
  const prompt = `
You are a helpful assistant. Read this conversation between a user and a support AI. Based on the user's issue, return a clear, 5-7 word subject line for a support ticket. Use title case.

Conversation:
${conversation}

Respond with only the subject line.
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You are a smart ticket subject generator.' },
      { role: 'user', content: prompt }
    ]
  });

  return response.choices[0].message.content.trim();
}
