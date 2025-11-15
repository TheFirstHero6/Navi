# Assets Folder

Place your logo and other static assets here.

## Logo Usage

After placing your logo file here (e.g., `navi-logo.png`, `navi-logo.svg`), import it in your components like this:

```tsx
import naviLogo from "@/assets/navi-logo.png";
// or
import naviLogo from "./assets/navi-logo.svg";

// Then use it:
<img src={naviLogo} alt="Navi Logo" />;
```

## Supported Formats

- PNG
- SVG
- JPG/JPEG
- WebP

Vite will automatically process these files and include them in the build.


