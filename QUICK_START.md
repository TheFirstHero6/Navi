# Quick Start Guide

## First Time Setup

1. **Install main dependencies:**
   ```bash
   npm install
   ```

2. **Install backend dependencies:**
   ```bash
   cd backend
   npm install
   cd ..
   ```

3. **Create backend .env file:**
   Create `backend/.env` with:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```

4. **Test backend (optional):**
   ```bash
   node check-backend.js
   ```
   This will verify the backend can start correctly.

5. **Run the app:**
   ```bash
   npm run electron:dev
   ```

## Troubleshooting "Failed to fetch" Error

If you see "Failed to fetch" when trying to use the app:

1. **Open Electron DevTools:**
   - View > Toggle Developer Tools
   - Check the Console tab

2. **Look for backend messages:**
   - You should see: `Starting backend server from: [path]`
   - Then: `[Backend] AI Assistant Backend server running on http://localhost:3000`
   - Finally: `✓ Backend server is ready and responding`

3. **Common issues:**

   **Backend not starting:**
   - Check if backend dependencies are installed: `cd backend && npm install`
   - Check if `.env` file exists in `backend/` directory
   - Check if port 3000 is available: `netstat -ano | findstr :3000` (Windows)

   **"Cannot find module" errors:**
   - Run: `cd backend && npm install`
   - Make sure `backend/node_modules` exists

   **Backend exits immediately:**
   - Check Electron console for error messages
   - Verify all backend dependencies are installed
   - Check if port 3000 is already in use

4. **Manual backend test:**
   ```bash
   cd backend
   node index.js
   ```
   Should see: "AI Assistant Backend server running on http://localhost:3000"
   Press Ctrl+C to stop.

5. **Check backend health:**
   Open browser to: `http://localhost:3000/health`
   Should see JSON response with status "ok"

## Still Having Issues?

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for more detailed help.

