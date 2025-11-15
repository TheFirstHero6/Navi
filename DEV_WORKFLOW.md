# Electron Development Workflow

## Best Practice: Use Electron Window, Not Browser

**✅ DO THIS:**
```bash
npm run electron:dev
```

This will:
1. Start the Vite dev server on `http://localhost:5173`
2. Start the backend server on `http://localhost:3000`
3. Launch Electron window automatically
4. Open DevTools automatically
5. Enable hot module replacement (HMR)

**❌ DON'T DO THIS:**
- Opening `http://localhost:5173` in a regular browser
- Running `npm run dev` separately and viewing in browser

## Why Use Electron Window?

1. **Accurate Testing**: The Electron window behaves exactly like your final app
2. **Electron APIs**: You can test IPC communication, window controls, etc.
3. **DevTools Integration**: Built-in Chrome DevTools with Electron-specific features
4. **Hot Reload**: Vite HMR works seamlessly with Electron
5. **Security Context**: Tests the same security settings as production

## Development Commands

### Full Development Mode (Recommended)
```bash
npm run electron:dev
```
- Starts everything automatically
- Opens Electron window with DevTools
- Hot reload enabled

### Separate Processes (Advanced)
If you need more control:
```bash
# Terminal 1: Start Vite dev server
npm run dev

# Terminal 2: Start backend (if needed separately)
cd backend && node index.js

# Terminal 3: Start Electron
npm run build:electron && npm start
```

## DevTools Shortcuts

When Electron window is open:
- **Toggle DevTools**: `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Option+I` (Mac)
- **Reload Window**: `Ctrl+R` (Windows/Linux) or `Cmd+R` (Mac)
- **Force Reload**: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)

## Hot Module Replacement (HMR)

Vite automatically handles HMR:
- **CSS changes**: Update instantly without reload
- **Component changes**: Update with state preserved
- **Full reload**: Only when necessary (e.g., adding new dependencies)

## Debugging Tips

1. **Console Logs**: Check both:
   - Electron main process console (terminal where you ran `electron:dev`)
   - Renderer process console (DevTools in Electron window)

2. **Backend Logs**: Check terminal for `[Backend]` messages

3. **Network Tab**: Use DevTools Network tab to debug API calls

4. **React DevTools**: Install React DevTools extension for better React debugging

## Production Build

When ready to build:
```bash
npm run electron:build
```

This creates a packaged app in the `release/` directory.

