# PowersOfZeroPOS Backend

First backend version for the PowersOfZeroPOS mobile frontend.

## Features

- Vercel-compatible TypeScript serverless API
- `GET /api/health` protected by `Authorization: Bearer <POS_API_KEY>`
- `GET /api/stripe/status` protected by `Authorization: Bearer <POS_API_KEY>`
- `POST /api/terminal/connection-token` protected by `Authorization: Bearer <POS_API_KEY>`
- Consistent typed JSON success and error responses
- Minimal dependency footprint

## Environment variables

Copy `.env.example` to `.env` and set:

```env
POS_API_KEY=replace_with_a_long_random_secret
STRIPE_SECRET_KEY=sk_test_replace_with_your_stripe_test_secret_key
```

## Local setup

```bash
cd backend
npm install
npm run typecheck
```

To run with Vercel locally:

```bash
vercel dev
```

## Endpoint

### `GET /api/health`

Requires:

```http
Authorization: Bearer <POS_API_KEY>
```

Success response:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "PowersOfZeroPOS",
    "apiVersion": 1
  }
}
```

### `GET /api/stripe/status`

Requires:

```http
Authorization: Bearer <POS_API_KEY>
```

Success response:

```json
{
  "success": true,
  "data": {
    "connected": true,
    "livemode": false
  }
}
```

### `POST /api/terminal/connection-token`

Requires:

```http
Authorization: Bearer <POS_API_KEY>
```

Success response:

```json
{
  "success": true,
  "data": {
    "secret": "<connection-token-secret>"
  }
}
```

Unauthorized response:

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or missing POS API key."
  }
}
```
