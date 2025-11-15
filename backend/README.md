# Backend Server

This is the Express backend server that runs inside the Electron app.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file with your Gemini API key:
```
GEMINI_API_KEY=your_api_key_here
```

## Running

The backend server is automatically started by the Electron main process. In development, you can also run it manually:

```bash
npm start
```

## Port

The server runs on port 3000 by default. This is hardcoded to match the frontend expectations.

