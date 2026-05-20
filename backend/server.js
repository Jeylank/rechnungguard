const dotenv = require('dotenv');
const express = require('express');
const multer = require('multer');

dotenv.config();

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

const port = Number(process.env.PORT || 3001);
const ocrProvider = process.env.OCR_PROVIDER || 'mock';
const openaiModel = process.env.OPENAI_OCR_MODEL || 'gpt-4.1-mini';

const documentTypeValues = [
  'receipt',
  'invoice',
  'medical_invoice',
  'dental_invoice',
  'utility_bill',
  'telecom_bill',
  'rent_letter',
  'insurance_document',
  'government_letter',
  'tax_letter',
  'payment_reminder',
  'inkasso_letter',
  'subscription_bill',
  'unknown',
];

const paymentStatusValues = [
  'needs_review',
  'unpaid',
  'paid',
  'sent_to_insurance',
  'waiting_reimbursement',
  'disputed',
  'closed',
];

const urgencyLevelValues = ['low', 'medium', 'high', 'critical'];

const expenseCategoryValues = [
  'housing',
  'energy',
  'telecom',
  'insurance',
  'health',
  'transport',
  'shopping',
  'subscriptions',
  'tax_government',
  'education',
  'travel',
  'legal',
  'other',
];

const mockOcrDocument = {
  documentType: 'telecom_bill',
  branchCategory: 'telecom',
  paymentStatus: 'needs_review',
  senderName: 'ConnectTel GmbH',
  creditorName: 'ConnectTel GmbH',
  amountTotal: '49,95 EUR',
  dueDate: '2026-05-25',
  invoiceDate: '2026-05-01',
  invoiceNumber: 'RG-2026-1001',
  customerNumber: 'K-123456',
  iban: 'DE89370400440532013000',
  bic: 'COBADEFFXXX',
  paymentReference: 'RG-2026-1001 K-123456',
  documentLanguage: 'de',
  urgencyLevel: 'medium',
  expenseCategory: 'telecom',
  isExpense: true,
};

const scannedDocumentSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'documentType',
    'branchCategory',
    'paymentStatus',
    'senderName',
    'creditorName',
    'amountTotal',
    'dueDate',
    'invoiceDate',
    'invoiceNumber',
    'customerNumber',
    'iban',
    'bic',
    'paymentReference',
    'documentLanguage',
    'urgencyLevel',
    'expenseCategory',
    'isExpense',
  ],
  properties: {
    documentType: { type: 'string', enum: documentTypeValues },
    branchCategory: { type: 'string' },
    paymentStatus: { type: 'string', enum: paymentStatusValues },
    senderName: { type: 'string' },
    creditorName: { type: 'string' },
    amountTotal: { type: 'string' },
    dueDate: { type: 'string' },
    invoiceDate: { type: 'string' },
    invoiceNumber: { type: 'string' },
    customerNumber: { type: 'string' },
    iban: { type: 'string' },
    bic: { type: 'string' },
    paymentReference: { type: 'string' },
    documentLanguage: { type: 'string' },
    urgencyLevel: { type: 'string', enum: urgencyLevelValues },
    expenseCategory: { type: 'string', enum: expenseCategoryValues },
    isExpense: { type: 'boolean' },
  },
};

const stringOrEmpty = (value) => (typeof value === 'string' ? value : '');
const enumOrFallback = (value, values, fallback) => (values.includes(value) ? value : fallback);

const normalizeOcrDocument = (document) => ({
  documentType: enumOrFallback(document.documentType, documentTypeValues, 'unknown'),
  branchCategory: stringOrEmpty(document.branchCategory),
  paymentStatus: enumOrFallback(document.paymentStatus, paymentStatusValues, 'needs_review'),
  senderName: stringOrEmpty(document.senderName),
  creditorName: stringOrEmpty(document.creditorName),
  amountTotal: stringOrEmpty(document.amountTotal),
  dueDate: stringOrEmpty(document.dueDate),
  invoiceDate: stringOrEmpty(document.invoiceDate),
  invoiceNumber: stringOrEmpty(document.invoiceNumber),
  customerNumber: stringOrEmpty(document.customerNumber),
  iban: stringOrEmpty(document.iban),
  bic: stringOrEmpty(document.bic),
  paymentReference: stringOrEmpty(document.paymentReference),
  documentLanguage: stringOrEmpty(document.documentLanguage) || 'de',
  urgencyLevel: enumOrFallback(document.urgencyLevel, urgencyLevelValues, 'medium'),
  expenseCategory: enumOrFallback(document.expenseCategory, expenseCategoryValues, 'other'),
  isExpense: typeof document.isExpense === 'boolean' ? document.isExpense : true,
});

const getDataUrl = (file) => `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

const extractOutputText = (payload) => {
  if (typeof payload.output_text === 'string') {
    return payload.output_text;
  }

  const message = payload.output?.find((item) => item.type === 'message');
  const textContent = message?.content?.find((item) => item.type === 'output_text');
  return typeof textContent?.text === 'string' ? textContent.text : '';
};

const parseOpenAiOcrResponse = (payload) => {
  const outputText = extractOutputText(payload);
  if (!outputText) {
    throw new Error('OpenAI OCR response did not include output text.');
  }

  return normalizeOcrDocument(JSON.parse(outputText));
};

const readOpenAiError = async (response) => {
  try {
    const payload = await response.json();
    return payload.error?.message || `OpenAI request failed with status ${response.status}`;
  } catch {
    return `OpenAI request failed with status ${response.status}`;
  }
};

const extractWithOpenAi = async (file) => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }

  const openAiResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: openaiModel,
      input: [
        {
          role: 'system',
          content:
            'Du extrahierst strukturierte Felder aus deutschen Rechnungen, Mahnungen, Inkasso-Schreiben, Belegen und Versicherungsdokumenten. Antworte nur mit JSON, das exakt dem Schema entspricht. Nutze leere Strings fuer nicht erkennbare Textfelder. Datumswerte im Format YYYY-MM-DD, falls erkennbar.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text:
                'Lies dieses Dokument und extrahiere die Felder fuer RechnungGuard. amountTotal soll eine lesbare Summe inklusive Waehrung sein, zum Beispiel "49,95 EUR". documentLanguage ist normalerweise "de".',
            },
            {
              type: 'input_image',
              image_url: getDataUrl(file),
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'rechnungguard_scanned_document',
          strict: true,
          schema: scannedDocumentSchema,
        },
      },
    }),
  });

  if (!openAiResponse.ok) {
    throw new Error(await readOpenAiError(openAiResponse));
  }

  return parseOpenAiOcrResponse(await openAiResponse.json());
};

app.get('/health', (_request, response) => {
  response.json({
    ok: true,
    ocrProvider,
  });
});

app.post('/ocr', upload.single('image'), async (request, response) => {
  if (!request.file) {
    response.status(400).json({
      error: 'image file is required',
    });
    return;
  }

  if (ocrProvider === 'mock') {
    response.json(mockOcrDocument);
    return;
  }

  if (ocrProvider === 'openai') {
    try {
      response.json(await extractWithOpenAi(request.file));
    } catch (error) {
      console.error('OpenAI OCR failed:', error.message);
      response.json(mockOcrDocument);
    }
    return;
  }

  console.error(`Unsupported OCR provider "${ocrProvider}". Falling back to mock OCR.`);
  response.json(mockOcrDocument);
});

app.use((_request, response) => {
  response.status(404).json({
    error: 'Not found',
  });
});

app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError) {
    response.status(400).json({
      error: error.message,
    });
    return;
  }

  if (error) {
    console.error('Unexpected server error:', error.message);
    response.status(400).json({
      error: 'Invalid request',
    });
    return;
  }

  response.status(500).json({
    error: 'Unexpected server error',
  });
});

app.listen(port, () => {
  console.log(`RechnungGuard OCR backend listening on port ${port}`);
});
