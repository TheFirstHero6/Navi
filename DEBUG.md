# Debugging Black Screen Issue

If you see a black screen in the dev server, try these steps:

1. **Check Browser Console:**
   - Open DevTools (F12)
   - Look for JavaScript errors in the Console tab
   - Check if React is loading properly

2. **Verify Dev Server is Running:**
   ```bash
   npm run dev
   ```
   Should show: `VITE vX.X.X ready in XXX ms` and `➜ Local: http://localhost:5173/`

3. **Check Network Tab:**
   - Open DevTools > Network tab
   - Refresh the page
   - Verify all files are loading (main.tsx, App.tsx, CSS files)
   - Look for 404 errors

4. **Verify React is Rendering:**
   - In browser console, type: `document.getElementById('root')`
   - Should return the root element
   - Check if it has children: `document.getElementById('root').children.length`

5. **Common Issues:**
   - **Port conflict:** Another app might be using port 5173
   - **Module not found:** Check if all dependencies are installed (`npm install`)
   - **TypeScript errors:** Run `npm run build` to check for TS errors
   - **CSS not loading:** Check if `src/index.css` and `src/App.css` exist

6. **Quick Test:**
   - Add this to `src/App.tsx` temporarily:
   ```tsx
   return <div style={{padding: '20px', color: 'white'}}>TEST - If you see this, React is working!</div>;
   ```
   - If you see the test text, the issue is in the App component
   - If you don't see it, React isn't rendering

7. **Clear Cache:**
   - Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
   - Or clear browser cache

8. **Check Vite Config:**
   - Verify `vite.config.ts` is correct
   - Check if port 5173 is accessible

