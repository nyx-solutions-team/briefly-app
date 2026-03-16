// The `ocr-and-digitalize-documents.ts` file handles OCR processing for scanned and handwritten documents.

'use server';

/**
 * @fileOverview Implements OCR to recognize and digitalize text from scanned and handwritten documents.
 *
 * - `ocrAndDigitalizeDocument` - Processes a document image to extract text.
 * - `OcrAndDigitalizeDocumentInput` - The input type for `ocrAndDigitalizeDocument`.
 * - `OcrAndDigitalizeDocumentOutput` - The return type for `ocrAndDigitalizeDocument`.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const OcrAndDigitalizeDocumentInputSchema = z.object({
  documentDataUri: z
    .string()
    .describe(
      'The document image as a data URI that must include a MIME type and use Base64 encoding. Expected format: \'data:<mimetype>;base64,<encoded_data>\'.' 
    ),
});

export type OcrAndDigitalizeDocumentInput = z.infer<typeof OcrAndDigitalizeDocumentInputSchema>;

const OcrAndDigitalizeDocumentOutputSchema = z.object({
  extractedText: z.string().describe('The extracted text from the document.'),
});

export type OcrAndDigitalizeDocumentOutput = z.infer<typeof OcrAndDigitalizeDocumentOutputSchema>;

const ocrPrompt = ai.definePrompt({
  name: 'ocrPrompt',
  input: {schema: OcrAndDigitalizeDocumentInputSchema},
  output: {schema: OcrAndDigitalizeDocumentOutputSchema},
  prompt: `Extract the text from the following document image:

{{media url=documentDataUri}}`,
});

const ocrAndDigitalizeDocumentFlow = ai.defineFlow(
  {
    name: 'ocrAndDigitalizeDocumentFlow',
    inputSchema: OcrAndDigitalizeDocumentInputSchema,
    outputSchema: OcrAndDigitalizeDocumentOutputSchema,
  },
  async input => {
    const {output} = await ocrPrompt(input);
    return output!;
  }
);

export async function ocrAndDigitalizeDocument(
  input: OcrAndDigitalizeDocumentInput
): Promise<OcrAndDigitalizeDocumentOutput> {
  return ocrAndDigitalizeDocumentFlow(input);
}
