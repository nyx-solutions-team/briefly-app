import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

// Require env; do not ship hardcoded keys
const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

export const ai = genkit({
  plugins: [googleAI({ apiKey: API_KEY })],
  model: 'googleai/gemini-2.0-flash',
});
