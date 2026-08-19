# PowersOfZeroPOS API Server

Small TypeScript backend for the first phase of PowersOfZeroPOS.

## What it includes

- Vercel-compatible serverless backend in `backend/`
- Protected `GET /api/health` endpoint
- Protected `GET /api/stripe/status` endpoint
- Protected `POST /api/terminal/connection-token` endpoint
- Protected `GET /api/terminal/locations` endpoint
- Protected `POST /api/terminal/locations` endpoint
- Bearer token authentication using `POS_API_KEY`
- Typed JSON success and error responses

## Quick start

```bash
cd backend
npm install
npm run typecheck
```

Create `backend/.env` from `backend/.env.example` and set:

```env
POS_API_KEY=replace_with_a_long_random_secret
STRIPE_SECRET_KEY=sk_test_replace_with_your_stripe_test_secret_key
```

## Deploy

Deploy to Vercel and configure `POS_API_KEY` and `STRIPE_SECRET_KEY` environment variables in the project settings.
