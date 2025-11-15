// Utility to check if backend is ready
import http from "http";

export function checkBackendReady(port: number = 3000, timeout: number = 10000): Promise<boolean> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    const check = () => {
      const req = http.get(`http://localhost:${port}/health`, { timeout: 1000 }, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          if (Date.now() - startTime < timeout) {
            setTimeout(check, 500);
          } else {
            resolve(false);
          }
        }
      });
      
      req.on("error", () => {
        if (Date.now() - startTime < timeout) {
          setTimeout(check, 500);
        } else {
          resolve(false);
        }
      });
      
      req.on("timeout", () => {
        req.destroy();
        if (Date.now() - startTime < timeout) {
          setTimeout(check, 500);
        } else {
          resolve(false);
        }
      });
    };
    
    check();
  });
}

