# Troubleshooting Guide

## Backend Connection Issues

If you see "Could not connect to backend server", check the following:

### 1. Check Electron Console

Open the Electron DevTools (View > Toggle Developer Tools) and check the Console tab. Look for:
- `[Backend]` messages showing backend startup
- Any error messages about file paths or missing dependencies
- Health check messages

### 2. Verify Backend Installation

Make sure backend dependencies are installed:

```bash
cd electron-app/backend
npm install
```

### 3. Check Backend Paths

The backend should be located at:
- **Development**: `electron-app/backend/`
- **Production**: `resources/backend/` (relative to Electron app)

### 4. Verify Backend is Starting

Look for these messages in the console:
```
Starting backend server from: [path]
[Backend] AI Assistant Backend server running on http://localhost:3000
✓ Backend server is ready and responding
```

### 5. Check Port 3000

Make sure port 3000 is not already in use by another application:

**Windows:**
```powershell
netstat -ano | findstr :3000
```

**Mac/Linux:**
```bash
lsof -i :3000
```

### 6. Environment Variables

Make sure `.env` file exists in `electron-app/backend/`:

```
GEMINI_API_KEY=your_api_key_here
```

### 7. Manual Backend Test

You can test the backend manually:

```bash
cd electron-app/backend
node index.js
```

Then open `http://localhost:3000/health` in a browser. You should see:
```json
{
  "status": "ok",
  "message": "AI Assistant Backend is running",
  "geminiConfigured": true
}
```

### 8. Common Issues

**Issue: "Backend file not found"**
- Make sure `backend/index.js` exists
- Check that the path resolution is correct (see console logs)

**Issue: "Cannot find module"**
- Run `npm install` in the `backend` directory
- Check that `backend/node_modules` exists

**Issue: Backend starts but frontend can't connect**
- Wait a few seconds after Electron starts
- Check firewall settings
- Verify backend is actually listening (check console for "server running on" message)

**Issue: Port already in use**
- Close any other applications using port 3000
- Or modify `backend/index.js` to use a different port

## Development vs Production

### Development Mode
- Backend runs from `electron-app/backend/`
- Uses development dependencies
- More verbose logging

### Production Mode (Packaged)
- Backend runs from `resources/backend/`
- Uses production dependencies
- Backend is bundled with the app
- `asar: false` ensures backend files are accessible

## Debugging Tips

1. **Enable verbose logging**: Check Electron console for detailed backend output
2. **Test backend separately**: Run `cd backend && node index.js` to isolate issues
3. **Check file permissions**: Ensure Electron has permission to read backend files
4. **Verify Node.js version**: Backend requires Node.js 18+

## Still Having Issues?

1. Check the Electron console for detailed error messages
2. Verify all dependencies are installed
3. Try rebuilding: `npm run build:electron`
4. Check that `.env` file exists and has correct format

