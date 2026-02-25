# Serverless Deployment Guide

## Overview

This backend is now configured to work both as a traditional Express server and as a serverless function on platforms like Vercel, Netlify, or AWS Lambda.

## Features Added

### 1. **Serverless MongoDB Connection**

- Connection pooling with state management
- Reuses existing connections to avoid cold start issues
- Automatic reconnection on serverless invocations

### 2. **Middleware Stack**

- **Request Logging**: Timestamps all incoming requests
- **Security Headers**: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection
- **CORS**: Configured for multiple origins with credentials support
- **Body Parser**: Handles JSON and URL-encoded data (50MB limit)
- **Cookie Parser**: Manages cookies for authentication
- **Database Connection**: Ensures MongoDB connection before processing requests
- **Error Handling**: Comprehensive error handling with detailed logs in development

### 3. **Enhanced Routes**

- All existing API routes maintained
- Health check endpoint with database status
- 404 handler for invalid routes
- Global error handler with environment-aware stack traces

### 4. **Dual Mode Operation**

- **Local Development**: Runs on port 5000 with traditional server
- **Serverless**: Exports Express app for serverless platforms

## Deployment

### Vercel

1. Install Vercel CLI: `npm i -g vercel`
2. Configure environment variables in Vercel dashboard:
   - `MONGODB_URL`
   - `JWT_SECRET`
   - `CLIENT_URL`
   - `NODE_ENV=production`
3. Deploy: `vercel --prod`

### Netlify

1. Install Netlify CLI: `npm i -g netlify-cli`
2. Create `netlify.toml`:

```toml
[build]
  functions = "functions"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/server/:splat"
  status = 200
```

3. Deploy: `netlify deploy --prod`

### AWS Lambda

1. Use Serverless Framework or AWS SAM
2. Configure API Gateway to route to Lambda function
3. Set environment variables in Lambda configuration

## Environment Variables Required

```
MONGODB_URL=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
PORT=5000
NODE_ENV=development|production
CLIENT_URL=your_frontend_url (optional)
```

## Local Development

```bash
npm start
```

The server will run on `http://localhost:5000` by default.

## Testing

Test the health endpoint:

```bash
curl http://localhost:5000/api/health
```

Expected response:

```json
{
  "status": "OK",
  "message": "Server is running",
  "timestamp": "2026-02-25T...",
  "database": "Connected"
}
```

## Benefits

- ✅ Zero configuration cold starts
- ✅ Automatic scaling
- ✅ Cost-effective for variable traffic
- ✅ Global CDN distribution
- ✅ Easy rollbacks and versioning
- ✅ Works in both serverless and traditional environments
