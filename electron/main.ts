import { app, BrowserWindow, ipcMain, globalShortcut } from "electron";
import path from "path";
import { spawn, ChildProcess } from "child_process";
import http from "http";
import fs from "fs";

const appDir = __dirname;

let backendProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let isMinimalMode = true;
let wasMinimizedFromFullMode = false;
const animateWindowResize = (
  mainWindow: BrowserWindow,
  targetWidth: number,
  targetHeight: number,
  targetX?: number,
  targetY?: number
) => {
  if (!mainWindow) return;

  const currentBounds = mainWindow.getBounds();
  const startWidth = currentBounds.width;
  const startHeight = currentBounds.height;
  const startX = currentBounds.x;
  const startY = currentBounds.y;

  const finalX = targetX !== undefined ? targetX : startX;
  const finalY = targetY !== undefined ? targetY : startY;

  const duration = 300;
  const steps = 30;
  const stepDuration = duration / steps;
  let currentStep = 0;

  const animate = () => {
    if (!mainWindow || currentStep > steps) return;

    const progress = currentStep / steps;
    const eased =
      progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    const currentWidth = Math.round(
      startWidth + (targetWidth - startWidth) * eased
    );
    const currentHeight = Math.round(
      startHeight + (targetHeight - startHeight) * eased
    );
    const currentX = Math.round(startX + (finalX - startX) * eased);
    const currentY = Math.round(startY + (finalY - startY) * eased);

    mainWindow.setBounds({
      x: currentX,
      y: currentY,
      width: currentWidth,
      height: currentHeight,
    });

    currentStep++;
    if (currentStep <= steps) {
      setTimeout(animate, stepDuration);
    }
  };

  animate();
};

function checkBackendHealth(port: number = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      `http://localhost:${port}/health`,
      { timeout: 2000 },
      (res) => {
        resolve(res.statusCode === 200);
      }
    );

    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

try {
  if (require("electron-squirrel-startup")) {
    app.quit();
    process.exit(0);
  }
} catch (e) {}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
  process.exit(0);
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.show();
    }
  });
}

process.on("uncaughtException", (error) => {
  console.error("=== UNCAUGHT EXCEPTION ===");
  console.error("Error:", error);
  console.error("Stack:", error.stack);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("=== UNHANDLED REJECTION ===");
  console.error("Reason:", reason);
  console.error("Promise:", promise);
});

const createWindow = () => {
  try {
    let iconPath: string | undefined;
    if (process.env.NODE_ENV === "development" || !app.isPackaged) {
      const devIconIco = path.join(appDir, "..", "src", "assets", "icon.ico");
      const devIconPng = path.join(appDir, "..", "src", "assets", "logo.png");
      if (fs.existsSync(devIconIco)) {
        iconPath = devIconIco;
      } else if (fs.existsSync(devIconPng)) {
        iconPath = devIconPng;
      }
    } else {
      const packagedIconIco = path.join(process.resourcesPath, "src", "assets", "icon.ico");
      const packagedIconPng = path.join(process.resourcesPath, "src", "assets", "logo.png");
      if (fs.existsSync(packagedIconIco)) {
        iconPath = packagedIconIco;
      } else if (fs.existsSync(packagedIconPng)) {
        iconPath = packagedIconPng;
      } else {
        const fallbackIconIco = path.join(app.getAppPath(), "src", "assets", "icon.ico");
        const fallbackIconPng = path.join(app.getAppPath(), "src", "assets", "logo.png");
        if (fs.existsSync(fallbackIconIco)) {
          iconPath = fallbackIconIco;
        } else if (fs.existsSync(fallbackIconPng)) {
          iconPath = fallbackIconPng;
        }
      }
    }
    mainWindow = new BrowserWindow({
      width: 600,
      height: 64,
      minWidth: 400,
      minHeight: 64,
      maxHeight: 64,
      icon: iconPath,
      webPreferences: {
        preload: path.join(appDir, "preload.js"),
        nodeIntegration: false,
        contextIsolation: true,
      },
      backgroundColor: "#00000000",
      frame: false,
      titleBarStyle: "hidden",
      resizable: false,
      alwaysOnTop: false,
      skipTaskbar: false,
      transparent: true,
      show: false,
      hasShadow: false,
    });

    if (process.env.NODE_ENV === "development" || !app.isPackaged) {
      mainWindow.loadURL("http://localhost:5173");
      mainWindow.webContents.openDevTools();
      mainWindow.webContents.on("did-frame-finish-load", () => {});
    } else {
      const distPath = path.join(app.getAppPath(), "dist", "index.html");

      if (!fs.existsSync(distPath)) {
        console.error(`ERROR: HTML file not found at: ${distPath}`);
        const distDir = path.join(app.getAppPath(), "dist");
        console.error(`Dist directory exists: ${fs.existsSync(distDir)}`);
        if (fs.existsSync(distDir)) {
          try {
            const files = fs.readdirSync(distDir);
            console.error(`Files in dist: ${files.join(", ")}`);
          } catch (e) {
            console.error(`Error reading dist directory: ${e}`);
          }
        }
        mainWindow.show();
      }

      mainWindow.webContents.on(
        "did-fail-load",
        (event, errorCode, errorDescription, validatedURL) => {
          console.error(`Failed to load: ${validatedURL}`);
          console.error(
            `Error code: ${errorCode}, Description: ${errorDescription}`
          );
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
          }
        }
      );

      mainWindow.webContents.on("render-process-gone", (event, details) => {
        console.error("Renderer process gone:", details);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
        }
      });

      mainWindow.on("unresponsive", () => {
        console.error("=== Window became unresponsive ===");
      });

      try {
        mainWindow.loadFile(distPath).catch((error) => {
          console.error("=== Error loading HTML file ===");
          console.error("Error:", error);
          console.error(`Attempted path: ${distPath}`);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
          }
        });
      } catch (error) {
        console.error("Exception loading HTML:", error);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
        }
      }
    }

    mainWindow.on("minimize", () => {
      if (!isMinimalMode) {
        wasMinimizedFromFullMode = true;
      }
    });

    mainWindow.on("show", () => {
      setTimeout(() => {
        if (wasMinimizedFromFullMode && mainWindow) {
          wasMinimizedFromFullMode = false;
          isMinimalMode = true;
          mainWindow.setResizable(false);
          mainWindow.setMinimumSize(400, 64);
          mainWindow.setMaximumSize(800, 64);

          const { screen } = require("electron");
          const primaryDisplay = screen.getPrimaryDisplay();
          const { width, height } = primaryDisplay.workAreaSize;
          const targetWidth = 600;
          const targetHeight = 64;
          const targetX = Math.floor((width - targetWidth) / 2);
          const targetY = Math.floor(height * 0.1);

          animateWindowResize(
            mainWindow,
            targetWidth,
            targetHeight,
            targetX,
            targetY
          );
          mainWindow.webContents.send("window-mode-changed", "minimal");
        }
      }, 50);
    });

    ipcMain.handle("window-minimize", () => {
      if (mainWindow) {
        mainWindow.minimize();
      }
    });

    ipcMain.handle("window-maximize", () => {
      if (mainWindow) {
        if (mainWindow.isMaximized()) {
          mainWindow.unmaximize();
        } else {
          mainWindow.maximize();
        }
      }
    });

    ipcMain.handle("window-close", () => {
      if (mainWindow) {
        mainWindow.close();
      }
    });

    mainWindow.once("ready-to-show", () => {
      centerWindow();
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });

    mainWindow.webContents.once("did-finish-load", () => {
      if (mainWindow && !mainWindow.isVisible()) {
        mainWindow.show();
        mainWindow.focus();
      }
    });

    mainWindow.on("blur", () => {
      if (mainWindow) {
        mainWindow.setBackgroundColor("#00000000");
        mainWindow.webContents
          .executeJavaScript(
            `
        document.body.style.backgroundColor = 'transparent';
        document.documentElement.style.backgroundColor = 'transparent';
        const root = document.getElementById('root');
        if (root) root.style.backgroundColor = 'transparent';
      `
          )
          .catch(() => {});
      }
    });

    mainWindow.on("focus", () => {
      if (mainWindow) {
        mainWindow.setBackgroundColor("#00000000");
      }
    });

    mainWindow.on("show", () => {
      if (mainWindow) {
        mainWindow.setBackgroundColor("#00000000");
      }
    });

    const centerWindow = () => {
      if (!mainWindow) return;
      const { screen } = require("electron");
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width, height } = primaryDisplay.workAreaSize;

      if (isMinimalMode) {
        const windowWidth = 600;
        const windowHeight = 64;
        mainWindow.setBounds({
          x: Math.floor((width - windowWidth) / 2),
          y: Math.floor(height * 0.1),
          width: windowWidth,
          height: windowHeight,
        });
      } else {
        const windowWidth = 1200;
        const windowHeight = 800;
        mainWindow.setBounds({
          x: Math.floor((width - windowWidth) / 2),
          y: Math.floor((height - windowHeight) / 2),
          width: windowWidth,
          height: windowHeight,
        });
      }
    };

    ipcMain.handle("set-window-mode", (event, mode: "minimal" | "full") => {
      if (!mainWindow) return;

      const wasFullMode = !isMinimalMode;
      isMinimalMode = mode === "minimal";

      if (isMinimalMode) {
        mainWindow.setResizable(false);
        mainWindow.setMinimumSize(400, 64);
        mainWindow.setMaximumSize(800, 64);

        const { screen } = require("electron");
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.workAreaSize;
        const targetWidth = 600;
        const targetHeight = 64;
        const targetX = Math.floor((width - targetWidth) / 2);
        const targetY = Math.floor(height * 0.1);

        if (wasFullMode) {
          animateWindowResize(
            mainWindow,
            targetWidth,
            targetHeight,
            targetX,
            targetY
          );
        } else {
          mainWindow.setSize(targetWidth, targetHeight);
          centerWindow();
        }
      } else {
        mainWindow.setResizable(true);
        mainWindow.setMinimumSize(800, 600);
        const { screen } = require("electron");
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.workAreaSize;
        mainWindow.setMaximumSize(width, height);

        const targetWidth = 1200;
        const targetHeight = 800;
        const targetX = Math.floor((width - targetWidth) / 2);
        const targetY = Math.floor((height - targetHeight) / 2);

        animateWindowResize(
          mainWindow,
          targetWidth,
          targetHeight,
          targetX,
          targetY
        );
      }

      mainWindow.webContents.send("window-mode-changed", mode);
    });

    ipcMain.handle("toggle-window-visibility", () => {
      if (!mainWindow) return;

      if (mainWindow.isVisible()) {
        if (!isMinimalMode) {
          wasMinimizedFromFullMode = true;
        }
        mainWindow.hide();
      } else {
        if (wasMinimizedFromFullMode) {
          wasMinimizedFromFullMode = false;
          isMinimalMode = true;
          mainWindow.setResizable(false);
          mainWindow.setMinimumSize(400, 64);
          mainWindow.setMaximumSize(800, 64);

          const { screen } = require("electron");
          const primaryDisplay = screen.getPrimaryDisplay();
          const { width, height } = primaryDisplay.workAreaSize;
          const targetWidth = 600;
          const targetHeight = 64;
          const targetX = Math.floor((width - targetWidth) / 2);
          const targetY = Math.floor(height * 0.1);

          setTimeout(() => {
            if (mainWindow) {
              animateWindowResize(
                mainWindow,
                targetWidth,
                targetHeight,
                targetX,
                targetY
              );
            }
          }, 50);

          mainWindow.webContents.send("window-mode-changed", "minimal");
        }
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send("focus-input");
      }
    });

    ipcMain.handle("get-window-mode", () => {
      return isMinimalMode ? "minimal" : "full";
    });

    ipcMain.handle("set-window-height", (event, height: number) => {
      if (!mainWindow || !isMinimalMode) return;
      const currentBounds = mainWindow.getBounds();
      mainWindow.setResizable(true);
      mainWindow.setMaximumSize(800, height);
      mainWindow.setSize(currentBounds.width, height);
      const { screen } = require("electron");
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width, height: screenHeight } = primaryDisplay.workAreaSize;
      const targetY = Math.floor(screenHeight * 0.1);
      mainWindow.setBounds({
        ...currentBounds,
        y: targetY,
        height: height,
      });
    });

    ipcMain.handle("reset-window-max-height", () => {
      if (!mainWindow || !isMinimalMode) return;
      mainWindow.setMaximumSize(800, 64);
      mainWindow.setResizable(false);
    });
  } catch (error) {
    console.error("Error in createWindow():", error);
    throw error;
  }
};

function getPreferencesPath(): string {
  const userDataPath = app.getPath("userData");
  return path.join(userDataPath, "preferences.json");
}

function loadPreferences(): any {
  try {
    const prefsPath = getPreferencesPath();
    if (fs.existsSync(prefsPath)) {
      const data = fs.readFileSync(prefsPath, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error loading preferences:", error);
  }
  return {
    ide: "code",
    defaultPort: "3000",
    projects: [],
  };
}

function savePreferences(preferences: any): void {
  try {
    const prefsPath = getPreferencesPath();
    fs.writeFileSync(prefsPath, JSON.stringify(preferences, null, 2), "utf-8");
  } catch (error) {
    console.error("Error saving preferences:", error);
    throw error;
  }
}

async function detectInstalledTerminals(): Promise<string[]> {
  const terminals: string[] = [];
  const { exec } = require("child_process");
  const { promisify } = require("util");
  const execAsync = promisify(exec);

  const checks = [
    { name: "wt", command: "where wt.exe", displayName: "Windows Terminal" },
    {
      name: "powershell",
      command: "where powershell.exe",
      displayName: "PowerShell",
    },
    { name: "cmd", command: "where cmd.exe", displayName: "CMD" },
    { name: "git-bash", command: "where git.exe", displayName: "Git Bash" },
    { name: "wsl", command: "wsl --list --quiet", displayName: "WSL" },
  ];

  for (const check of checks) {
    try {
      await execAsync(check.command, { shell: "cmd.exe", timeout: 2000 });
      terminals.push(check.name);
    } catch (error) {}
  }

  return terminals;
}

ipcMain.handle("get-preferences", () => {
  return loadPreferences();
});

ipcMain.handle("save-preferences", (event, preferences: any) => {
  savePreferences(preferences);
  return { success: true };
});

ipcMain.handle("detect-terminals", async () => {
  return await detectInstalledTerminals();
});

function startBackendServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const fs = require("fs");
    let backendPath: string;
    let backendIndex: string;
    let checkedPaths: string[] = [];

    if (app.isPackaged) {
      const appPath = app.getAppPath();
      const resourcesPath = process.resourcesPath || path.dirname(appPath);
      const unpackedPath = appPath.replace("app.asar", "app.asar.unpacked");

      checkedPaths = [
        path.join(resourcesPath, "backend"),
        path.join(unpackedPath, "backend"),
        path.join(appPath, "backend"),
        path.join(path.dirname(appPath), "backend"),
      ];

      backendPath =
        checkedPaths.find((p) => fs.existsSync(path.join(p, "index.js"))) ||
        checkedPaths[0];
      backendIndex = path.join(backendPath, "index.js");
    } else {
      backendPath = path.join(appDir, "../backend");
      backendIndex = path.join(backendPath, "index.js");
    }

    if (!fs.existsSync(backendIndex)) {
      console.error(`Backend file not found at: ${backendIndex}`);
      if (checkedPaths.length > 0) {
        console.error(`Checked paths: ${checkedPaths.join(", ")}`);
        checkedPaths.forEach((p) => {
          console.error(
            `  - ${p}: ${fs.existsSync(p) ? "exists" : "not found"}`
          );
          if (fs.existsSync(p)) {
            try {
              const files = fs.readdirSync(p);
              console.error(`    Files: ${files.join(", ")}`);
            } catch (e) {
              console.error(`    Error reading directory: ${e}`);
            }
          }
        });
      }
      reject(new Error(`Backend file not found at: ${backendIndex}`));
      return;
    }

    const nodeModulesPath = path.join(backendPath, "node_modules");
    const nodePath = process.env.NODE_PATH
      ? `${process.env.NODE_PATH}${path.delimiter}${nodeModulesPath}`
      : nodeModulesPath;

    console.log(`Backend path: ${backendPath}`);
    console.log(`Node modules path: ${nodeModulesPath}`);
    console.log(`Node modules exists: ${fs.existsSync(nodeModulesPath)}`);
    
    if (fs.existsSync(nodeModulesPath)) {
      const modules = fs.readdirSync(nodeModulesPath);
      console.log(`Found ${modules.length} modules in node_modules`);
    } else {
      console.error(`⚠️ WARNING: node_modules not found at ${nodeModulesPath}`);
    }

    const electronPath = process.execPath;
    console.log(`Spawning backend with Electron: ${electronPath}`);
    console.log(`Backend script: ${backendIndex}`);
    console.log(`Working directory: ${backendPath}`);
    
    backendProcess = spawn(electronPath, [backendIndex], {
      cwd: backendPath,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        NODE_ENV:
          process.env.NODE_ENV ||
          (app.isPackaged ? "production" : "development"),
        NODE_PATH: nodePath,
        NODE_MODULE_PATHS: nodeModulesPath,
        PATH: process.env.PATH,
        PWD: backendPath,
        NODE_NO_WARNINGS: "1",
      },
    });
    
    // Ensure output streams are not buffered
    if (backendProcess.stdout) {
      backendProcess.stdout.setEncoding("utf8");
    }
    if (backendProcess.stderr) {
      backendProcess.stderr.setEncoding("utf8");
    }

    console.log(`Backend process PID: ${backendProcess.pid}`);
    console.log(`Backend process spawned successfully`);

    let backendReady = false;

    backendProcess.stdout?.on("data", (data: Buffer | string) => {
      const output = typeof data === "string" ? data : data.toString();
      const lines = output.split("\n").filter((line) => line.trim());
      
      lines.forEach((line) => {
        if (line.trim()) {
          console.log(`[Backend] ${line.trim()}`);
        }
      });
      
      if (
        !backendReady &&
        (output.includes("server running on") || 
         output.includes("AI Assistant Backend server running") ||
         output.includes("listening") ||
         output.includes("Server is listening") ||
         output.includes("Server is listening and ready"))
      ) {
        setTimeout(() => {
          checkBackendHealth()
            .then((isReady) => {
              if (isReady) {
                backendReady = true;
                resolve();
              } else if (!backendReady) {
                backendReady = true;
                resolve();
              }
            })
            .catch(() => {
              backendReady = true;
              resolve();
            });
        }, 1000);
      }
    });

    backendProcess.stderr?.on("data", (data: Buffer | string) => {
      const output = typeof data === "string" ? data : data.toString();
      const lines = output.split("\n").filter((line) => line.trim());
      
      lines.forEach((line) => {
        if (line.trim()) {
          console.error(`[Backend Error] ${line.trim()}`);
        }
      });
      
      if (
        output.includes("Cannot find module") ||
        output.includes("MODULE_NOT_FOUND") ||
        output.includes("Error: Cannot find module")
      ) {
        console.error(
          "⚠️ Backend dependencies may not be installed or not found."
        );
        console.error(`Backend path: ${backendPath}`);
        console.error(`Node modules path: ${nodeModulesPath}`);
        console.error(`Node modules exists: ${fs.existsSync(nodeModulesPath)}`);
        if (fs.existsSync(nodeModulesPath)) {
          try {
            const modules = fs.readdirSync(nodeModulesPath);
            console.error(`Modules found: ${modules.slice(0, 10).join(", ")}...`);
          } catch (e) {
            console.error(`Error reading node_modules: ${e}`);
          }
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.executeJavaScript(`
            if (typeof window !== 'undefined') {
              console.error('[Backend] Missing dependencies detected. Check console for details.');
            }
          `).catch(() => {});
        }
      }
    });

    backendProcess.on("error", (error: Error) => {
      console.error("=== Backend process error event ===");
      console.error("Failed to start backend server:", error);
      console.error("Error details:", error.message, error.stack);
      console.error("This usually means the script file is missing or cannot be executed.");
      console.error(`Backend script path: ${backendIndex}`);
      console.error(`Backend script exists: ${fs.existsSync(backendIndex)}`);
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.executeJavaScript(`
          if (typeof window !== 'undefined' && window.electronAPI) {
            const errorMsg = 'Backend failed to start: ${error.message.replace(/'/g, "\\'")}\\n\\nPlease check the console for details.';
            alert(errorMsg);
          }
        `).catch(() => {});
      }
      
      backendReady = true;
      resolve();
    });

    backendProcess.on("exit", (code: number | null) => {
      console.error(`Backend process exited with code ${code}`);
      
      // If backend exits with code 0, it might have detected an existing server
      // Check if backend is actually running before assuming failure
      if (code === 0) {
        console.log("Backend exited with code 0 - checking if server is still running...");
        setTimeout(() => {
          checkBackendHealth()
            .then((isReady) => {
              if (isReady) {
                console.log("✓ Backend server is still running (existing instance)");
                backendProcess = null;
                if (!backendReady) {
                  backendReady = true;
                  resolve();
                }
              } else {
                console.error("Backend process exited but server is not responding");
                backendProcess = null;
                if (!backendReady) {
                  backendReady = true;
                  resolve();
                }
              }
            })
            .catch(() => {
              console.error("Backend process exited and health check failed");
              backendProcess = null;
              if (!backendReady) {
                backendReady = true;
                resolve();
              }
            });
        }, 1000);
        return;
      }
      
      backendProcess = null;
      
      if (code !== 0 && code !== null) {
        console.error("Backend crashed! Attempting to restart...");
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.executeJavaScript(`
            if (typeof window !== 'undefined') {
              console.error('[Backend] Backend crashed with code ${code}. Attempting to restart...');
            }
          `).catch(() => {});
        }
        setTimeout(() => {
          if (!backendProcess) {
            startBackendServer().catch((err) => {
              console.error("Failed to restart backend:", err);
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.executeJavaScript(`
                  if (typeof window !== 'undefined') {
                    alert('Backend restart failed. Please restart the application.');
                  }
                `).catch(() => {});
              }
            });
          }
        }, 2000);
      }
      
      if (!backendReady) {
        if (code !== null) {
          backendReady = true;
          resolve();
        }
      }
    });

    setTimeout(() => {
      if (!backendReady) {
        console.warn("Backend server startup timeout - checking health...");
        checkBackendHealth()
          .then((isReady) => {
            if (isReady) {
              console.log("✓ Backend is responding to health checks");
              backendReady = true;
              resolve();
            } else {
              console.warn("Backend not responding to health checks, but resolving anyway");
              backendReady = true;
              resolve();
            }
          })
          .catch(() => {
            console.warn("Health check failed, but resolving anyway");
            backendReady = true;
            resolve();
          });
      }
    }, 15000);
  });
}

app.whenReady().then(() => {
  try {
    createWindow();
  } catch (error) {
    console.error("=== ERROR CREATING WINDOW ===");
    console.error("Error:", error);
    console.error("Stack:", error instanceof Error ? error.stack : "No stack");

    const errorWindow = new BrowserWindow({
      width: 600,
      height: 400,
      webPreferences: { nodeIntegration: true },
    });
    errorWindow.loadURL(
      `data:text/html,<html><body><h1>Error</h1><pre>${error instanceof Error ? error.message : String(error)}</pre></body></html>`
    );
    errorWindow.show();
  }

  startBackendServer().catch((error) => {
    console.error("=== Backend startup failed (non-critical) ===");
    console.error("Error:", error instanceof Error ? error.message : error);
  });

  const ret = globalShortcut.register("Alt+Space", () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        if (!isMinimalMode) {
          wasMinimizedFromFullMode = true;
        }
        mainWindow.hide();
      } else {
        if (wasMinimizedFromFullMode) {
          wasMinimizedFromFullMode = false;
          isMinimalMode = true;
          mainWindow.setResizable(false);
          mainWindow.setMinimumSize(400, 64);
          mainWindow.setMaximumSize(800, 64);

          const { screen } = require("electron");
          const primaryDisplay = screen.getPrimaryDisplay();
          const { width, height } = primaryDisplay.workAreaSize;
          const targetWidth = 600;
          const targetHeight = 64;
          const targetX = Math.floor((width - targetWidth) / 2);
          const targetY = Math.floor(height * 0.1);

          setTimeout(() => {
            if (mainWindow) {
              animateWindowResize(
                mainWindow,
                targetWidth,
                targetHeight,
                targetX,
                targetY
              );
            }
          }, 50);

          mainWindow.webContents.send("window-mode-changed", "minimal");
        }
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send("focus-input");
      }
    }
  });

  if (!ret) {
    console.warn("Failed to register Alt+Space global shortcut");
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (backendProcess) {
      backendProcess.kill();
      backendProcess = null;
    }
    app.quit();
  }
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled rejection at:", promise, "reason:", reason);
});

app.on("before-quit", () => {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
