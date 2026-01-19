'use server';

/**
 * @fileOverview This file defines a Genkit flow for extracting metadata from documents using AI.
 *
 * The flow takes a document (as a data URI) and its type as input, and returns extracted metadata
 * such as keywords, dates, and entities. This metadata can then be used for document search and categorization.
 *
 * @module extract-document-metadata
 * @typicalname extractDocumentMetadata
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExtractDocumentMetadataInputSchema = z.object({
  documentDataUri: z
    .string()
    .describe(
      "The document as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  documentType: z.string().describe('The type of the document (e.g., invoice, government circular, PDF with handwritten text).'),
  availableCategories: z.array(z.string()).optional().describe('Available categories for this organization')
});
export type ExtractDocumentMetadataInput = z.infer<
  typeof ExtractDocumentMetadataInputSchema
>;

const ExtractDocumentMetadataOutputSchema = z.object({
  // core
  keywords: z.array(z.string()).min(3).describe('Keywords extracted from the document (>=3).'),
  dates: z.array(z.string()).describe('Dates extracted from the document.'),
  entities: z.array(z.string()).describe('Entities (e.g., people, organizations, locations) extracted from the document.'),
  summary: z.string().describe('A short summary of the document.'),
  // extended fields used to pre-fill the upload form (compulsory where indicated)
  title: z.string().min(1).describe('Human-friendly title of the document.'),
  filename: z.string().optional().describe('The original filename if present in the content.'),
  sender: z.string().optional().describe('Primary sender/author/issuer of the document.'),
  receiver: z.string().optional().describe('Primary receiver/recipient of the document.'),
  senderOptions: z.array(z.string()).optional().describe('Multiple potential senders if document contains several candidates.'),
  receiverOptions: z.array(z.string()).optional().describe('Multiple potential receivers if document contains several candidates.'),
  documentDate: z.string().optional().describe('Primary date associated with the document.'),
  documentType: z.string().optional().describe('High-level type/category of the document.'),
  subject: z.string().min(1).describe('Subject or headline.'),
  description: z.string().optional().describe('One-paragraph description suitable for a textarea.'),
  category: z.string().optional().describe('General category.'),
  tags: z.array(z.string()).min(3).describe('Free-form tags (>=3).'),
  // deep insights for detail page
  aiPurpose: z.string().optional().describe('Single line purpose of the document.'),
  aiKeyPoints: z.array(z.string()).optional().describe('List of 3-7 key points.'),
  aiContext: z.string().optional().describe('1-3 sentences of context.'),
  aiOutcome: z.string().optional().describe('Outcome or action summary.'),
  aiKeywords: z.array(z.string()).optional().describe('Extra AI keywords for tagging.'),
});
export type ExtractDocumentMetadataOutput = z.infer<
  typeof ExtractDocumentMetadataOutputSchema
>;

export async function extractDocumentMetadata(
  input: ExtractDocumentMetadataInput
): Promise<ExtractDocumentMetadataOutput> {
  return extractDocumentMetadataFlow(input);
}

const extractDocumentMetadataPrompt = ai.definePrompt({
  name: 'extractDocumentMetadataPrompt',
  input: {schema: ExtractDocumentMetadataInputSchema},
  output: {schema: ExtractDocumentMetadataOutputSchema},
  prompt: `You are an expert document summarizer and information extractor.

You will receive a document in various formats (PDF, PNG, JPG, DOCX, TXT, MD). Your task is to:

1. Create a concise summary of the document, no more than 300 words, in English.
2. Identify the subject of the document.
3. Identify the date the document was sent. If you cannot find one, leave it blank.
4. Identify all distinct pairs of sender and receiver in the document. For each pair, provide the sender and the receiver.
5. Extract keywords from the document.
6. Categorize the document into one of the following categories: {{#if availableCategories}}{{#each availableCategories}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}{{else}}General{{/if}}. Choose the single most appropriate category. IMPORTANT: You MUST always select a category from the provided list. If none seem perfect, choose the closest match. Never leave category empty or undefined.

Even if the document is in another language, you must provide the summary, subject, date, sender/receiver pairs, keywords, and category in English.

Consider the entire document, including any tables, images, and handwritten text. If there are multiple distinct sender/receiver pairs, identify each one.

IMPORTANT OUTPUT REQUIREMENTS:
- summary: Use the summary from step 1 (max 300 words)
- subject: Use the subject from step 2
- documentDate: Use the date from step 3
- sender: Use the primary sender from step 4
- receiver: Use the primary receiver from step 4
- senderOptions: Array of all senders found in step 4
- receiverOptions: Array of all receivers found in step 4
- keywords: Use keywords from step 5 (minimum 3)
- category: Use category from step 6
- tags: Generate 3-8 relevant tags based on document content
- title: Generate a concise title based on subject and content

Document Type: {{{documentType}}}
Document: {{media url=documentDataUri}}

Return strictly in the specified JSON schema.`,
});

const extractDocumentMetadataFlow = ai.defineFlow(
  {
    name: 'extractDocumentMetadataFlow',
    inputSchema: ExtractDocumentMetadataInputSchema,
    outputSchema: ExtractDocumentMetadataOutputSchema,
  },
  async input => {
    const {output} = await extractDocumentMetadataPrompt(input);
    return output!;
  }
);


