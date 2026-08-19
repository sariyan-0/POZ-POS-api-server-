# PowersOfZeroPOS API Server

Small TypeScript backend for the first phase of PowersOfZeroPOS.

## What it includes

- Vercel-compatible serverless backend in `backend/`
- Protected `GET /api/health` endpoint
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
```

## Deploy

Deploy the `backend/` directory to Vercel and configure the `POS_API_KEY` environment variable in the Vercel project settings.
