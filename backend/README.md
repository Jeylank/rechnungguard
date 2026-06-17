# RechnungGuard OCR Backend

This backend receives document images from the Expo app and returns structured OCR fields from `POST /ocr`.

It keeps OCR provider keys out of the Expo app. The default provider is `openai`; the `mock` provider is only for explicit local testing.

## Install

```bash
npm install
```

## Run

```bash
npm start
```

By default the server listens on `http://localhost:3001`.

Copy `.env.example` to `.env` when you want local environment overrides:

```env
PORT=3001
OCR_PROVIDER=mock
OPENAI_OCR_MODEL=gpt-4.1-mini
OPENAI_API_KEY=
```

## OCR Providers

### Mock provider

Mock OCR is available for local testing and requires no API key:

```env
OCR_PROVIDER=mock
```

`GET /health` should include:

```json
{
  "ok": true,
  "ocrProvider": "mock"
}
```

### OpenAI provider

To test real OCR locally, put the OpenAI key in `backend/.env` only:

```env
OCR_PROVIDER=openai
OPENAI_API_KEY=your_backend_only_key
OPENAI_OCR_MODEL=gpt-4.1-mini
```

Restart the backend after changing `.env`.

Do not put `OPENAI_API_KEY` or any provider secret in the Expo app. The mobile app should only call this backend.

When `OCR_PROVIDER=openai`, `POST /ocr` sends the uploaded image to the OpenAI Responses API as a vision input and asks for structured JSON matching the RechnungGuard document fields. If OpenAI fails or an unsupported provider is configured, the server logs a generic provider error and returns a generic OCR failure to the app.

## Expected Request

`POST /ocr`

Content type:

`multipart/form-data`

Form fields:

- `image`: required image file

Example:

```bash
curl -X POST http://localhost:3001/ocr \
  -F "image=@./sample-invoice.jpg"
```

## Expected Response

Successful responses are ScannedDocument-compatible JSON. For local testing only, the mock response is:

```json
{
  "documentType": "telecom_bill",
  "branchCategory": "telecom",
  "paymentStatus": "needs_review",
  "senderName": "ConnectTel GmbH",
  "creditorName": "ConnectTel GmbH",
  "amountTotal": "49,95 EUR",
  "dueDate": "2026-05-25",
  "invoiceDate": "2026-05-01",
  "invoiceNumber": "RG-2026-1001",
  "customerNumber": "K-123456",
  "iban": "DE89370400440532013000",
  "bic": "COBADEFFXXX",
  "paymentReference": "RG-2026-1001 K-123456",
  "documentLanguage": "de",
  "urgencyLevel": "medium",
  "expenseCategory": "telecom",
  "isExpense": true
}
```

## Mobile App Connection

The mobile app keeps `OCR_MODE` set to `backend` in `services/ocrService.ts` and calls the Cloud Run OCR URL.

For local backend testing only:

1. Set `BACKEND_OCR_URL` in `services/ocrService.ts` to the local backend OCR URL, for example `http://192.168.2.104:3001/ocr`.
2. Keep `OCR_MODE` set to `backend`.
3. Keep API keys only in the backend environment, never in the Expo app.

For Expo Go on a physical Android device, use your computer's LAN IP address instead of `localhost`.
