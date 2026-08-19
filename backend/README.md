# PowersOfZeroPOS Backend

First backend version for the PowersOfZeroPOS mobile frontend.

## Features

- Vercel-compatible TypeScript serverless API
- `GET /api/health` protected by `Authorization: Bearer <POS_API_KEY>`
- Consistent typed JSON success and error responses
- Minimal dependency footprint

## Environment variables

Copy `.env.example` to `.env` and set:

```env
POS_API_KEY=replace_with_a_long_random_secret
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
