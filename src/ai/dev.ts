import { config } from 'dotenv';
config();

import '@/ai/flows/ocr-and-digitalize-documents.ts';
import '@/ai/flows/answer-questions-about-documents.ts';
import '@/ai/flows/extract-document-metadata.ts';