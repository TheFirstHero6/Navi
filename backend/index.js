// Immediate logging to verify script starts
console.log("=== Backend script starting ===");
console.log("__dirname:", __dirname);
console.log("process.cwd():", process.cwd());
console.log("NODE_ENV:", process.env.NODE_ENV);

// Load environment variables from .env file
// Try to load .env from the backend directory
const path = require("path");
const fs = require("fs");
const dotenvPath = path.join(__dirname, ".env");
if (fs.existsSync(dotenvPath)) {
  require("dotenv").config({ path: dotenvPath });
  console.log("Loaded .env from:", dotenvPath);
} else {
  require("dotenv").config();
  console.log("Using default .env location");
}

// Prevent process from exiting on unhandled errors (set up early)
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  console.error("Stack:", error.stack);
  // Don't exit - keep the server running
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise);
  console.error("Reason:", reason);
  if (reason instanceof Error) {
    console.error("Stack:", reason.stack);
  }
  // Don't exit - keep the server running
});

// Keep process alive - prevent exit on SIGINT/SIGTERM unless explicitly requested
process.on("SIGINT", () => {
  console.log("\nReceived SIGINT, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\nReceived SIGTERM, shutting down gracefully...");
  process.exit(0);
});

console.log("Loading dependencies...");
const express = require("express");
console.log("✓ express loaded");
const cors = require("cors");
console.log("✓ cors loaded");
const { exec, spawn } = require("child_process");
const { promisify } = require("util");
const os = require("os");
const { GoogleGenerativeAI } = require("@google/generative-ai");
console.log("✓ All dependencies loaded");

const app = express();
const PORT = 3000;

// Promisify exec for easier async/await usage
const execAsync = promisify(exec);

// Initialize Gemini
if (!process.env.GEMINI_API_KEY) {
  console.warn("Warning: GEMINI_API_KEY not set. AI features will not work.");
}
const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;
// Use the best free model: Try Gemini 2.5 Pro first (most advanced free model as of 2025)
// Fallback options if model not available: gemini-1.5-pro-latest, gemini-1.5-pro, gemini-pro
let model = null;
if (genAI) {
  // Try models in order of preference (best to fallback)
  const modelNames = [
    "gemini-2.5-pro",
    "gemini-1.5-pro-latest",
    "gemini-1.5-pro",
    "gemini-pro",
  ];

  // Start with the best free model
  model = genAI.getGenerativeModel({ model: modelNames[0] });
}

// Middleware
app.use(cors()); // Enable CORS for React Native app
app.use(express.json()); // Parse JSON request bodies

// Define Gemini tools
const tools = [
  {
    functionDeclarations: [
      {
        name: "execute_shell_commands",
        description:
          "Execute one or more shell commands (PowerShell or CMD) on Windows. Use this for general command execution, running scripts, or any shell operations.",
        parameters: {
          type: "OBJECT",
          properties: {
            commands: {
              type: "ARRAY",
              items: { type: "STRING" },
              description: "Array of shell commands to execute sequentially",
            },
          },
          required: ["commands"],
        },
      },
      {
        name: "open_application",
        description:
          "Launch a Windows application by name or path. Examples: 'notepad', 'code' (VS Code), 'chrome', or full path to executable.",
        parameters: {
          type: "OBJECT",
          properties: {
            appName: {
              type: "STRING",
              description: "Name of the application or full path to executable",
            },
          },
          required: ["appName"],
        },
      },
      {
        name: "open_file_or_folder",
        description:
          "Open a file or folder in its default application (e.g., folder in Explorer, file in associated app).",
        parameters: {
          type: "OBJECT",
          properties: {
            path: {
              type: "STRING",
              description: "Full path to the file or folder to open",
            },
          },
          required: ["path"],
        },
      },
      {
        name: "search_in_browser",
        description:
          "Open a web search query in the user's default browser using their default search engine.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "STRING",
              description: "Search query to perform",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "system_command",
        description:
          "Execute system-level operations like restart, shutdown, sleep, lock screen, etc.",
        parameters: {
          type: "OBJECT",
          properties: {
            action: {
              type: "STRING",
              description:
                "System action: 'restart', 'shutdown', 'sleep', 'hibernate', 'lock', 'signout'",
            },
          },
          required: ["action"],
        },
      },
      {
        name: "open_terminal_in_directory",
        description:
          "Open a terminal (Windows Terminal or default terminal) in a specific directory.",
        parameters: {
          type: "OBJECT",
          properties: {
            directory: {
              type: "STRING",
              description:
                "Full path to the directory where terminal should open",
            },
          },
          required: ["directory"],
        },
      },
      {
        name: "complex_developer_workflow",
        description:
          "Execute a complex multi-step developer workflow. Use this for requests like 'boot up my dev server for X' or 'open my dev environment for Y'. The workflow can include: opening a terminal in a directory, changing directories, executing commands (like npm run dev), opening apps (like IDEs), opening URLs in browser, and opening files/folders. When the user mentions a project name (like 'noah game'), you should search for directories matching that name in common locations like user's Desktop, Documents, or common dev folders.",
        parameters: {
          type: "OBJECT",
          properties: {
            workflow: {
              type: "OBJECT",
              properties: {
                steps: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      type: {
                        type: "STRING",
                        description:
                          "Step type: 'open_terminal' (opens terminal in directory), 'cd' (change directory), 'execute_command' (run shell command), 'open_app' (launch application like 'code' for VS Code), 'open_browser' (open URL like 'http://localhost:3000'), 'open_file' (open file/folder in default app)",
                      },
                      value: {
                        type: "STRING",
                        description:
                          "Value for the step: directory path (for open_terminal/cd/open_file), command string (for execute_command), app name (for open_app), URL (for open_browser), or file path (for open_file). For directories, you can use fuzzy names like 'noah game' and the system will try to find matching folders.",
                      },
                    },
                    required: ["type", "value"],
                  },
                  description:
                    "Array of workflow steps to execute in order. Example for 'boot up dev server for noah game': [{'type':'open_terminal','value':'path/to/noah-game'}, {'type':'execute_command','value':'npm run dev'}, {'type':'open_browser','value':'http://localhost:3000'}, {'type':'open_app','value':'code'}]",
                },
              },
              required: ["steps"],
            },
          },
          required: ["workflow"],
        },
      },
    ],
  },
];

// Helper function to execute shell commands
async function executeCommands(commands) {
  const results = [];
  let allStdout = "";
  let allStderr = "";

  for (const cmd of commands) {
    try {
      const { stdout, stderr } = await execAsync(cmd, {
        shell: "powershell.exe",
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });
      results.push({ command: cmd, success: true, stdout, stderr });
      allStdout += `\n--- Command: ${cmd} ---\n${stdout || "(no output)"}\n`;
      if (stderr) allStderr += `\n--- Command: ${cmd} ---\n${stderr}\n`;
    } catch (error) {
      results.push({
        command: cmd,
        success: false,
        stdout: error.stdout || "",
        stderr: error.stderr || "",
        error: error.message,
      });
      allStdout += `\n--- Command: ${cmd} ---\n${error.stdout || ""}\n`;
      allStderr += `\n--- Command: ${cmd} ---\n${
        error.stderr || error.message
      }\n`;
    }
  }

  return { results, stdout: allStdout.trim(), stderr: allStderr.trim() };
}

// Cache for installed apps (to avoid searching every time)
let appsCache = null;
let appsCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let appsCacheLoading = false;
let appsCachePromise = null;

// Preload apps on startup
async function preloadApps() {
  if (appsCacheLoading) {
    return appsCachePromise;
  }
  if (appsCache) {
    return appsCache;
  }

  appsCacheLoading = true;
  appsCachePromise = findInstalledAppsInternal();

  try {
    const apps = await appsCachePromise;
    appsCacheLoading = false;
    return apps;
  } catch (error) {
    appsCacheLoading = false;
    throw error;
  }
}

// Internal function to find installed applications
async function findInstalledAppsInternal() {
  try {
    const now = Date.now();
    let validApps = []; // Initialize outside try block

    // Try Start Menu shortcuts first (gives actual executable paths)
    try {
      // Write PowerShell script to temp file to avoid escaping issues
      const tempScript = path.join(__dirname, "temp_get_apps.ps1");
      const psScriptContent = `$ErrorActionPreference='SilentlyContinue'
$apps=@()
# Search Start Menu folders
$paths=@("$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs","$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs")
# Also search Desktop folders for game shortcuts and other apps (non-recursive for desktop to avoid subfolders)
$desktopPaths=@("$env:USERPROFILE\\Desktop","$env:PUBLIC\\Desktop")
$allPaths=$paths+$desktopPaths

foreach($p in $allPaths){
  if(Test-Path $p){
    # For desktop, don't recurse (just get shortcuts directly on desktop)
    # For Start Menu, recurse to find all apps
    $recurse = $p -notmatch "Desktop"
    if($recurse){
      $shortcuts = Get-ChildItem -Path $p -Recurse -Filter "*.lnk" -ErrorAction SilentlyContinue
    }else{
      $shortcuts = Get-ChildItem -Path $p -Filter "*.lnk" -ErrorAction SilentlyContinue
    }
    
    $shortcuts | ForEach-Object{
      try{
        $s=New-Object -ComObject WScript.Shell
        $sc=$s.CreateShortcut($_.FullName)
        $target=$sc.TargetPath
        $workingDir=$sc.WorkingDirectory
        $arguments=$sc.Arguments
        
        # For desktop shortcuts, be more lenient - accept any valid target
        $isDesktop = $_.FullName -match "Desktop"
        
        if($target){
          # Check if target exists (file or directory)
          $targetExists = Test-Path $target
          
          if($targetExists){
            if($target -match '\\.exe$'){
              # Direct .exe file
              $appName=$_.BaseName
              $apps+=[PSCustomObject]@{Name=$appName;Path=$target;FullName=$_.FullName;WorkingDirectory=$workingDir;Arguments=$arguments}
            }elseif(Test-Path "$target" -PathType Container){
              # Target is a directory, look for .exe inside
              $exe=Get-ChildItem -Path "$target" -Filter "*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
              if($exe){
                $appName=$_.BaseName
                $apps+=[PSCustomObject]@{Name=$appName;Path=$exe.FullName;FullName=$_.FullName;WorkingDirectory=$workingDir;Arguments=$arguments}
              }elseif($isDesktop){
                # For desktop shortcuts, even if no .exe found, include it if it's a valid path
                # This handles game launchers and other special shortcuts
                $appName=$_.BaseName
                $apps+=[PSCustomObject]@{Name=$appName;Path=$target;FullName=$_.FullName;WorkingDirectory=$workingDir;Arguments=$arguments}
              }
            }elseif($isDesktop){
              # For desktop shortcuts, be more accepting - might be a special launcher
              $appName=$_.BaseName
              $apps+=[PSCustomObject]@{Name=$appName;Path=$target;FullName=$_.FullName;WorkingDirectory=$workingDir;Arguments=$arguments}
            }
          }elseif($isDesktop -and $target -match '\\.exe'){
            # Desktop shortcut pointing to .exe that might not exist yet, but include it anyway
            # (some game shortcuts might point to installers or launchers)
            $appName=$_.BaseName
            $apps+=[PSCustomObject]@{Name=$appName;Path=$target;FullName=$_.FullName;WorkingDirectory=$workingDir;Arguments=$arguments}
          }
        }
      }catch{
        # Skip invalid shortcuts
      }
    }
  }
}
$apps | Sort-Object Name -Unique | ConvertTo-Json -Compress`;

      // Write script to temp file
      fs.writeFileSync(tempScript, psScriptContent, "utf8");

      try {
        const result = await execAsync(
          `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tempScript}"`,
          {
            shell: "cmd.exe",
            maxBuffer: 10 * 1024 * 1024,
            encoding: "utf8",
            windowsHide: true,
          }
        );

        // Clean up temp file
        try {
          fs.unlinkSync(tempScript);
        } catch (unlinkError) {
          // Ignore cleanup errors
        }

        if (result.stdout && result.stdout.trim()) {
          const apps = JSON.parse(result.stdout.trim());
          const appsArray = Array.isArray(apps) ? apps : [];
          validApps = appsArray
            .filter(
              (app) =>
                app &&
                app.Name &&
                typeof app.Name === "string" &&
                app.Name.trim().length > 0 &&
                app.Path &&
                typeof app.Path === "string" &&
                app.Path.trim().length > 0
              // Allow .exe, UWP AppId, or desktop shortcuts (which might have various targets)
            )
            .map((app) => ({
              Name: app.Name,
              Path: app.Path.trim(), // Actual executable path or shortcut target
              FullName: app.FullName || app.Path, // Shortcut file path if available
              WorkingDirectory: app.WorkingDirectory || "",
              Arguments: app.Arguments || "",
            }));
        }
      } catch (error) {
        console.warn(
          "Start Menu search failed, trying Get-StartApps:",
          error.message
        );
        // Clean up temp file on error
        try {
          if (fs.existsSync(tempScript)) {
            fs.unlinkSync(tempScript);
          }
        } catch (unlinkError) {
          // Ignore cleanup errors
        }
      }
    } catch (error) {
      console.warn(
        "Start Menu search failed, trying Get-StartApps:",
        error.message
      );
    }

    // Also get UWP apps using Get-StartApps and merge with desktop apps
    let uwpApps = [];
    try {
      const result = await execAsync(
        `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-StartApps | ConvertTo-Json -Compress"`,
        {
          shell: "cmd.exe",
          maxBuffer: 5 * 1024 * 1024,
          encoding: "utf8",
          windowsHide: true,
        }
      );

      if (result.stdout && result.stdout.trim()) {
        const apps = JSON.parse(result.stdout.trim());
        const appsArray = Array.isArray(apps) ? apps : [];
        uwpApps = appsArray
          .filter(
            (app) =>
              app && app.Name && typeof app.Name === "string" && app.AppId
          )
          .map((app) => ({
            Name: app.Name,
            Path: app.AppId || "", // UWP AppId (this IS the path for UWP apps)
            FullName: app.Name,
            AppId: app.AppId || "",
            IsUWP: true, // Mark as UWP app
          }));
      }
    } catch (error) {
      console.warn("Get-StartApps failed:", error.message);
    }

    // Merge Start Menu/Desktop apps with UWP apps
    const allApps = [...(validApps || []), ...uwpApps];

    if (allApps.length > 0) {
      // Remove duplicates by name (prefer non-UWP apps)
      const uniqueApps = [];
      const seenNames = new Set();

      // First add non-UWP apps
      for (const app of allApps) {
        if (!app.IsUWP && !seenNames.has(app.Name.toLowerCase())) {
          uniqueApps.push(app);
          seenNames.add(app.Name.toLowerCase());
        }
      }

      // Then add UWP apps that aren't duplicates
      for (const app of allApps) {
        if (app.IsUWP && !seenNames.has(app.Name.toLowerCase())) {
          uniqueApps.push(app);
          seenNames.add(app.Name.toLowerCase());
        }
      }

      appsCache = uniqueApps;
      appsCacheTime = now;
      console.log(
        `✓ Preloaded ${uniqueApps.length} apps (${
          validApps?.length || 0
        } desktop/Start Menu, ${uwpApps.length} UWP)`
      );
      return uniqueApps;
    }

    return [];
  } catch (error) {
    console.error("Error finding installed apps:", error.message);
    return [];
  }
}

// Helper function to find installed applications (public API)
async function findInstalledApps(searchQuery) {
  try {
    // Use cache if available and fresh
    const now = Date.now();
    if (appsCache && now - appsCacheTime < CACHE_DURATION) {
      return appsCache;
    }

    // If cache is loading, wait for it
    if (appsCacheLoading && appsCachePromise) {
      return await appsCachePromise;
    }

    // Otherwise, load apps
    return await findInstalledAppsInternal();
  } catch (error) {
    console.error("Error finding installed apps:", error.message);
    if (error.stderr) {
      console.error("PowerShell stderr:", error.stderr);
    }
    return appsCache || [];
  }
}

// Helper function to search apps with fuzzy matching (improved algorithm)
async function searchApps(query, limit = 10) {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const apps = await findInstalledApps();
  if (apps.length === 0) {
    return [];
  }

  const queryLower = query.toLowerCase().trim();
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 0);

  // Score and sort ALL apps (don't pre-filter too aggressively)
  const scoredApps = apps.map((app) => {
    const name = app.Name || "";
    const nameLower = name.toLowerCase();
    let score = 0;

    // 1. Exact match gets highest score
    if (nameLower === queryLower) {
      score = 10000;
    }
    // 2. Starts with query gets very high score (e.g., "stardew" -> "stardew valley")
    else if (nameLower.startsWith(queryLower)) {
      score = 5000 + (queryLower.length / Math.max(nameLower.length, 1)) * 2000;
    }
    // 3. Contains query as substring gets high score
    else if (nameLower.includes(queryLower)) {
      score = 3000 + (queryLower.length / Math.max(nameLower.length, 1)) * 1000;
    }
    // 4. Word matches - check if query words appear in app name
    else {
      const nameWords = nameLower.split(/\s+/).filter((w) => w.length > 0);
      let wordMatches = 0;
      let wordScore = 0;

      for (const qWord of queryWords) {
        // Check if any word in app name starts with query word
        for (const nWord of nameWords) {
          if (nWord.startsWith(qWord)) {
            wordMatches++;
            wordScore += 2000 * (qWord.length / Math.max(nWord.length, 1));
            break;
          } else if (nWord.includes(qWord)) {
            wordMatches++;
            wordScore += 1000 * (qWord.length / Math.max(nWord.length, 1));
            break;
          } else if (qWord.startsWith(nWord) && nWord.length >= 3) {
            wordMatches++;
            wordScore += 800 * (nWord.length / Math.max(qWord.length, 1));
            break;
          }
        }
      }

      if (wordMatches > 0) {
        // Bonus for matching all query words
        const completenessBonus = wordMatches === queryWords.length ? 1000 : 0;
        score =
          wordScore +
          completenessBonus +
          (wordMatches / queryWords.length) * 500;
      }

      // 5. Character sequence matching (for typos/partial matches)
      if (score === 0 || score < 100) {
        let sequenceMatches = 0;
        let queryIndex = 0;

        // Check if characters appear in order in the app name
        for (
          let i = 0;
          i < nameLower.length && queryIndex < queryLower.length;
          i++
        ) {
          if (nameLower[i] === queryLower[queryIndex]) {
            sequenceMatches++;
            queryIndex++;
          }
        }

        if (sequenceMatches > 0) {
          score = (sequenceMatches / queryLower.length) * 300;
        }
      }
    }

    return { ...app, score };
  });

  // Sort by score and return top results
  const results = scoredApps
    .filter((app) => app.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((app) => {
      // For desktop shortcuts, prefer using the shortcut file path (.lnk) if available
      // This ensures arguments and working directory are preserved
      const fullName = app.FullName || "";
      const isDesktopShortcut =
        fullName.toLowerCase().includes("desktop") &&
        fullName.toLowerCase().endsWith(".lnk");
      // Use shortcut file path for desktop shortcuts, otherwise use the target path
      const pathToUse =
        isDesktopShortcut && fullName ? fullName : app.Path || app.AppId || "";

      return {
        name: app.Name,
        path: pathToUse,
        score: app.score,
        isUWP: app.IsUWP || false,
        workingDirectory: app.WorkingDirectory || "",
        arguments: app.Arguments || "",
      };
    });

  return results;
}

// Helper function to open application (improved version)
async function openApplication(appName) {
  try {
    // First, try to find the app using searchApps (which uses fuzzy matching)
    const searchResults = await searchApps(appName, 1);

    if (searchResults.length > 0 && searchResults[0].path) {
      // Use the top match with its path
      const bestMatch = searchResults[0];
      try {
        await execAsync(`Start-Process "${bestMatch.path}"`, {
          shell: "powershell.exe",
        });
        return {
          success: true,
          message: `Opened application: ${bestMatch.name}`,
        };
      } catch (pathError) {
        // If path fails, try app name
        try {
          await execAsync(`Start-Process "${bestMatch.name}"`, {
            shell: "powershell.exe",
          });
          return {
            success: true,
            message: `Opened application: ${bestMatch.name}`,
          };
        } catch (nameError) {
          // Continue to fallback
        }
      }
    }

    // Fallback: try common app names
    const commonApps = {
      code: "code",
      vscode: "code",
      "visual studio code": "code",
      chrome: "chrome",
      "google chrome": "chrome",
      firefox: "firefox",
      "mozilla firefox": "firefox",
      edge: "msedge",
      "microsoft edge": "msedge",
      notepad: "notepad",
      "notepad++": "notepad++",
      calculator: "calc",
      paint: "mspaint",
      explorer: "explorer",
      "file explorer": "explorer",
    };

    const normalizedName = appName.toLowerCase().trim();
    if (commonApps[normalizedName]) {
      try {
        await execAsync(`Start-Process "${commonApps[normalizedName]}"`, {
          shell: "powershell.exe",
        });
        return { success: true, message: `Opened application: ${appName}` };
      } catch (e) {
        // Continue to final fallback
      }
    }

    // Final fallback: try direct execution
    try {
      await execAsync(`Start-Process "${appName}"`, {
        shell: "powershell.exe",
      });
      return { success: true, message: `Opened application: ${appName}` };
    } catch (directError) {
      try {
        await execAsync(`start "" "${appName}"`, { shell: "cmd.exe" });
        return { success: true, message: `Opened application: ${appName}` };
      } catch (fallbackError) {
        if (searchResults.length > 0) {
          return {
            success: false,
            error: `Could not open "${appName}". Found similar app "${searchResults[0].name}" but failed to launch it.`,
          };
        }
        return {
          success: false,
          error: `Failed to open application: ${fallbackError.message}. Could not find "${appName}" or similar applications.`,
        };
      }
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to open application: ${error.message}`,
    };
  }
}

// Helper function to open file or folder
async function openFileOrFolder(filePath) {
  try {
    const normalizedPath = path.resolve(filePath);
    await execAsync(`explorer.exe "${normalizedPath}"`, { shell: "cmd.exe" });
    return { success: true, message: `Opened: ${normalizedPath}` };
  } catch (error) {
    return {
      success: false,
      error: `Failed to open path: ${error.message}`,
    };
  }
}

// Helper function to search in browser
async function searchInBrowser(query) {
  try {
    // Check if query is a URL (starts with http:// or https://)
    if (query.startsWith("http://") || query.startsWith("https://")) {
      // It's a URL, open it directly
      await execAsync(`start "" "${query}"`, { shell: "cmd.exe" });
      return { success: true, message: `Opened URL: ${query}` };
    } else {
      // It's a search query, use Google search
      const encodedQuery = encodeURIComponent(query);
      const searchUrl = `https://www.google.com/search?q=${encodedQuery}`;
      await execAsync(`start "" "${searchUrl}"`, { shell: "cmd.exe" });
      return { success: true, message: `Opened search for: ${query}` };
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to open browser: ${error.message}`,
    };
  }
}

// Helper function to execute system commands
async function executeSystemCommand(action) {
  const commands = {
    restart: "shutdown /r /t 0",
    shutdown: "shutdown /s /t 0",
    sleep: "rundll32.exe powrprof.dll,SetSuspendState 0,1,0",
    hibernate: "shutdown /h",
    lock: "rundll32.exe user32.dll,LockWorkStation",
    signout: "shutdown /l",
  };

  const command = commands[action.toLowerCase()];
  if (!command) {
    return {
      success: false,
      error: `Unknown system action: ${action}`,
    };
  }

  try {
    await execAsync(command, { shell: "cmd.exe" });
    return { success: true, message: `Executed system action: ${action}` };
  } catch (error) {
    return {
      success: false,
      error: `Failed to execute system command: ${error.message}`,
    };
  }
}

// Helper function to fuzzy find directories
async function findDirectory(query) {
  try {
    const queryLower = query.toLowerCase().trim();
    const userProfile = process.env.USERPROFILE || process.env.HOME || "";

    // Get search paths from user preferences, or use defaults
    const searchPathNames = userPreferences.projectSearchPaths
      ? userPreferences.projectSearchPaths.split(",").map((s) => s.trim())
      : [
          "Desktop",
          "Documents",
          "OneDrive/Desktop",
          "OneDrive/Documents",
          "Projects",
          "dev",
          "Development",
        ];

    const searchPaths = [];
    for (const pathName of searchPathNames) {
      // Handle nested paths like "OneDrive/Desktop"
      const pathParts = pathName.split("/").filter((p) => p);
      searchPaths.push(path.join(userProfile, ...pathParts));
    }

    const allMatches = [];

    for (const searchPath of searchPaths) {
      if (!fs.existsSync(searchPath)) continue;

      try {
        const items = fs.readdirSync(searchPath, { withFileTypes: true });
        for (const item of items) {
          if (item.isDirectory()) {
            const itemName = item.name.toLowerCase();
            // Check if directory name matches query
            if (
              itemName.includes(queryLower) ||
              queryLower.split(/\s+/).some((word) => itemName.includes(word)) ||
              itemName
                .replace(/\s+/g, "")
                .includes(queryLower.replace(/\s+/g, ""))
            ) {
              const fullPath = path.join(searchPath, item.name);
              // Score the match
              let score = 0;
              if (itemName === queryLower) score = 1000;
              else if (itemName.startsWith(queryLower)) score = 800;
              else if (itemName.includes(queryLower)) score = 600;
              else {
                const queryWords = queryLower.split(/\s+/);
                const nameWords = itemName.split(/\s+/);
                const wordMatches = queryWords.filter((qw) =>
                  nameWords.some((nw) => nw.includes(qw) || qw.includes(nw))
                ).length;
                score = (wordMatches / queryWords.length) * 400;
              }
              allMatches.push({ path: fullPath, name: item.name, score });
            }
          }
        }
      } catch (error) {
        // Skip directories we can't read
        continue;
      }
    }

    // Sort by score and return best match
    if (allMatches.length > 0) {
      allMatches.sort((a, b) => b.score - a.score);
      console.log(
        `Found directory match for "${query}": ${allMatches[0].path} (score: ${allMatches[0].score})`
      );
      return allMatches[0].path;
    }

    return null;
  } catch (error) {
    console.error(`Error finding directory: ${error.message}`);
    return null;
  }
}

// Helper function to detect default terminal (try wt first, then powershell, then cmd)
function getDefaultTerminal() {
  // Try Windows Terminal first, then PowerShell, then CMD
  // We'll use wt as default since it's the most modern
  return "wt";
}

// Helper function to open terminal in directory
async function openTerminalInDirectory(directory) {
  try {
    // Resolve the path - no fuzzy search, must exist
    let normalizedPath = path.resolve(directory);
    if (!fs.existsSync(normalizedPath)) {
      throw new Error(`Directory does not exist: ${normalizedPath}`);
    }

    // Use default terminal
    const terminal = getDefaultTerminal();

    try {
      // Use spawn with detached: true to launch terminals asynchronously
      // This prevents the process from hanging
      let terminalProcess;

      if (terminal === "wt") {
        // Windows Terminal
        terminalProcess = spawn("wt.exe", ["-d", normalizedPath], {
          detached: true,
          stdio: "ignore",
          shell: false,
        });
        terminalProcess.on("error", (err) => {
          console.error("Windows Terminal spawn error:", err);
        });
        terminalProcess.unref();
      } else if (terminal === "powershell") {
        // PowerShell
        const escapedPath = normalizedPath.replace(/'/g, "''");
        terminalProcess = spawn(
          "powershell.exe",
          ["-NoExit", "-Command", `cd '${escapedPath}'`],
          {
            detached: true,
            stdio: "ignore",
            shell: false,
          }
        );
        terminalProcess.on("error", (err) => {
          console.error("PowerShell spawn error:", err);
        });
        terminalProcess.unref();
      } else if (terminal === "cmd") {
        // CMD
        const escapedPath = normalizedPath.replace(/"/g, '""');
        terminalProcess = spawn("cmd.exe", ["/k", `cd /d "${escapedPath}"`], {
          detached: true,
          stdio: "ignore",
          shell: false,
        });
        terminalProcess.on("error", (err) => {
          console.error("CMD spawn error:", err);
        });
        terminalProcess.unref();
      } else if (terminal === "git-bash") {
        // Git Bash - try common installation paths
        const gitBashPaths = [
          "C:\\Program Files\\Git\\bin\\bash.exe",
          "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
          "bash.exe", // If git is in PATH
        ];

        let bashFound = false;
        for (const bashPath of gitBashPaths) {
          try {
            if (fs.existsSync(bashPath) || bashPath === "bash.exe") {
              terminalProcess = spawn(bashPath, ["--cd", normalizedPath], {
                detached: true,
                stdio: "ignore",
                shell: false,
              });
              terminalProcess.on("error", (err) => {
                console.error("Git Bash spawn error:", err);
              });
              terminalProcess.unref();
              bashFound = true;
              break;
            }
          } catch (error) {
            continue;
          }
        }
        if (!bashFound) {
          throw new Error("Git Bash not found in common locations");
        }
      } else if (terminal === "wsl") {
        // WSL
        terminalProcess = spawn("wsl.exe", ["--cd", normalizedPath], {
          detached: true,
          stdio: "ignore",
          shell: false,
        });
        terminalProcess.on("error", (err) => {
          console.error("WSL spawn error:", err);
        });
        terminalProcess.unref();
      } else {
        // Fallback to Windows Terminal
        terminalProcess = spawn("wt.exe", ["-d", normalizedPath], {
          detached: true,
          stdio: "ignore",
          shell: false,
        });
        terminalProcess.on("error", (err) => {
          console.error("Windows Terminal spawn error:", err);
        });
        terminalProcess.unref();
      }

      // Give it a moment to start, then return success
      await new Promise((resolve) => setTimeout(resolve, 100));

      return {
        success: true,
        message: `Opened ${
          terminal === "wt"
            ? "Windows Terminal"
            : terminal === "powershell"
            ? "PowerShell"
            : terminal === "cmd"
            ? "CMD"
            : terminal === "git-bash"
            ? "Git Bash"
            : terminal === "wsl"
            ? "WSL"
            : "Terminal"
        } in: ${normalizedPath}`,
      };
    } catch (terminalError) {
      // Fallback to PowerShell if preferred terminal fails
      try {
        const escapedPath = normalizedPath.replace(/'/g, "''");
        const fallbackProcess = spawn(
          "powershell.exe",
          ["-NoExit", "-Command", `cd '${escapedPath}'`],
          {
            detached: true,
            stdio: "ignore",
            shell: false,
          }
        );
        fallbackProcess.unref();
        await new Promise((resolve) => setTimeout(resolve, 100));
        return {
          success: true,
          message: `Opened PowerShell in: ${normalizedPath} (fallback)`,
        };
      } catch (fallbackError) {
        return {
          success: false,
          error: `Failed to open terminal: ${terminalError.message}`,
        };
      }
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to open terminal: ${error.message}`,
    };
  }
}

// Helper function to execute complex workflow
async function executeComplexWorkflow(workflow) {
  const results = [];
  let currentDirectory = process.cwd();
  let allStdout = "";
  let allStderr = "";
  let currentProject = null; // Track the current project being worked with

  // Add timeout to prevent hanging
  const workflowTimeout = setTimeout(() => {
    console.warn(
      "[Workflow] Execution timeout after 60 seconds - this should not happen"
    );
    console.warn(
      "[Workflow] Current step:",
      workflow.steps[workflow.steps.length - 1]
    );
  }, 60000); // 60 second timeout

  try {
    console.log(
      `[Workflow] Starting workflow with ${workflow.steps.length} steps`
    );
    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      console.log(
        `[Workflow] Executing step ${i + 1}/${workflow.steps.length}: ${
          step.type
        } - ${step.value || "N/A"}`
      );
      try {
        switch (step.type) {
          case "open_terminal":
            // First check if step.value is a project nickname
            const project = resolveProject(step.value);
            let terminalPath = project ? project.filepath : step.value;
            const isProject = !!project;

            // Track the project for later steps
            if (project) {
              currentProject = project;
            }

            if (!fs.existsSync(terminalPath)) {
              // Path doesn't exist - need confirmation
              const confirmationId = `confirm_${Date.now()}_${++confirmationIdCounter}`;
              pendingConfirmations.set(confirmationId, {
                type: "open_terminal",
                originalValue: step.value,
                stepIndex: i,
                workflow: workflow,
                currentDirectory: currentDirectory,
                results: results,
                allStdout: allStdout,
                allStderr: allStderr,
              });

              clearTimeout(workflowTimeout);
              return {
                needsConfirmation: true,
                confirmationId: confirmationId,
                message: `The path "${terminalPath}" does not exist. Would you like to proceed with opening a terminal in this location?`,
                path: terminalPath,
                type: "open_terminal",
              };
            }

            console.log(
              `[Workflow] Opening terminal in: ${terminalPath} (project: ${isProject})`
            );
            const terminalResult = await Promise.race([
              openTerminalInDirectory(terminalPath),
              new Promise((_, reject) =>
                setTimeout(
                  () => reject(new Error("Terminal open timeout")),
                  5000
                )
              ),
            ]).catch((error) => {
              console.error(`[Workflow] Terminal open error: ${error.message}`);
              return { success: false, error: error.message };
            });

            results.push({
              type: "open_terminal",
              value: step.value,
              resolvedPath: terminalPath,
              ...terminalResult,
            });
            if (terminalResult.success) {
              currentDirectory = path.resolve(terminalPath);
            }
            allStdout += `\n--- Opened terminal in: ${terminalPath} ---\n${
              terminalResult.message || ""
            }\n`;
            if (terminalResult.error)
              allStderr += `\n--- Terminal error: ${terminalResult.error}\n`;
            break;

          case "cd":
            let cdPath = step.value;
            // First check if step.value is a project nickname
            const cdProject = resolveProject(step.value);
            if (cdProject) {
              cdPath = cdProject.filepath;
            } else if (!fs.existsSync(cdPath)) {
              cdPath = path.resolve(currentDirectory, step.value);
            } else {
              cdPath = path.resolve(cdPath);
            }
            currentDirectory = cdPath;
            results.push({
              type: "cd",
              value: step.value,
              resolvedPath: currentDirectory,
              success: true,
              message: `Changed directory to: ${currentDirectory}`,
            });
            allStdout += `\n--- Changed directory to: ${currentDirectory} ---\n`;
            break;

          case "execute_command":
            console.log(`[Workflow] Executing command: ${step.value}`);
            console.log(`[Workflow] Current directory: ${currentDirectory}`);
            // For dev server commands, run them in a new terminal window so they don't block
            // Check if this looks like a dev server command (npm/yarn/pnpm run dev/start)
            const isDevServerCommand =
              /^(npm|yarn|pnpm|bun)\s+(run\s+)?(dev|start|serve)/i.test(
                step.value.trim()
              );
            console.log(
              `[Workflow] Is dev server command? ${isDevServerCommand}`
            );

            if (isDevServerCommand && currentDirectory) {
              console.log(
                `[Workflow] Detected dev server command, will run in terminal`
              );
              // Use the command provided in the workflow step (which should be the project's startCommand)
              const commandToRun = step.value;
              console.log(`[Workflow] Command to run: ${commandToRun}`);

              // Run in a new terminal window so it doesn't block
              const terminal = getDefaultTerminal();
              console.log(`[Workflow] Using terminal: ${terminal}`);
              console.log(`[Workflow] Directory: ${currentDirectory}`);

              try {
                // Use spawn with detached: true to launch terminal with command asynchronously
                let terminalProcess;

                console.log(`[Workflow] Spawning terminal process...`);
                if (terminal === "wt") {
                  // Windows Terminal - use start command via spawn with shell: true
                  console.log(
                    `[Workflow] Using Windows Terminal with command: ${commandToRun}`
                  );
                  // Use spawn with shell: true to run start command (which is a CMD built-in)
                  terminalProcess = spawn(
                    `start "" wt.exe -d "${currentDirectory}" cmd.exe /k "${commandToRun}"`,
                    [],
                    {
                      shell: true,
                      detached: true,
                      stdio: "ignore",
                    }
                  );
                  terminalProcess.on("error", (err) => {
                    console.error(
                      "[Workflow] Windows Terminal spawn error:",
                      err
                    );
                  });
                  terminalProcess.unref();
                } else if (terminal === "powershell") {
                  // PowerShell - use start command via spawn
                  console.log(
                    `[Workflow] Using PowerShell with command: ${commandToRun}`
                  );
                  terminalProcess = spawn(
                    `start "" powershell.exe -NoExit -Command "Set-Location '${currentDirectory.replace(
                      /'/g,
                      "''"
                    )}'; ${commandToRun.replace(/'/g, "''")}"`,
                    [],
                    {
                      shell: true,
                      detached: true,
                      stdio: "ignore",
                    }
                  );
                  terminalProcess.on("error", (err) => {
                    console.error("[Workflow] PowerShell spawn error:", err);
                  });
                  terminalProcess.unref();
                } else if (terminal === "cmd") {
                  // CMD - use start command via spawn
                  console.log(
                    `[Workflow] Using CMD with command: ${commandToRun}`
                  );
                  terminalProcess = spawn(
                    `start "" cmd.exe /k "cd /d "${currentDirectory.replace(
                      /"/g,
                      '""'
                    )}" && ${commandToRun.replace(/"/g, '""')}"`,
                    [],
                    {
                      shell: true,
                      detached: true,
                      stdio: "ignore",
                    }
                  );
                  terminalProcess.on("error", (err) => {
                    console.error("[Workflow] CMD spawn error:", err);
                  });
                  terminalProcess.unref();
                } else if (terminal === "git-bash") {
                  // Git Bash - try common installation paths
                  const gitBashPaths = [
                    "C:\\Program Files\\Git\\bin\\bash.exe",
                    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
                    "bash.exe", // If git is in PATH
                  ];

                  let bashFound = false;
                  for (const bashPath of gitBashPaths) {
                    try {
                      if (fs.existsSync(bashPath) || bashPath === "bash.exe") {
                        console.log(`[Workflow] Using Git Bash: ${bashPath}`);
                        terminalProcess = spawn(
                          bashPath,
                          ["--cd", currentDirectory, "-c", commandToRun],
                          {
                            detached: true,
                            stdio: "ignore",
                            shell: false,
                          }
                        );
                        terminalProcess.on("error", (err) => {
                          console.error(
                            "[Workflow] Git Bash spawn error:",
                            err
                          );
                        });
                        bashFound = true;
                        break;
                      }
                    } catch (error) {
                      continue;
                    }
                  }
                  if (!bashFound) {
                    throw new Error("Git Bash not found in common locations");
                  }
                } else {
                  // Fallback to Windows Terminal using start command
                  console.log(`[Workflow] Using fallback (Windows Terminal)`);
                  terminalProcess = spawn(
                    `start "" wt.exe -d "${currentDirectory}" cmd.exe /k "${commandToRun}"`,
                    [],
                    {
                      shell: true,
                      detached: true,
                      stdio: "ignore",
                    }
                  );
                  terminalProcess.on("error", (err) => {
                    console.error(
                      "[Workflow] Windows Terminal spawn error:",
                      err
                    );
                  });
                  terminalProcess.unref();
                }

                console.log(`[Workflow] Terminal process spawned`);
                if (terminalProcess) {
                  console.log(`[Workflow] Waiting 200ms before continuing...`);
                  // Give it a moment to start
                  await new Promise((resolve) => setTimeout(resolve, 200));
                  console.log(
                    `[Workflow] Dev server command completed successfully`
                  );
                } else {
                  console.error(`[Workflow] Terminal process is null!`);
                }

                results.push({
                  type: "execute_command",
                  value: commandToRun,
                  success: true,
                  message: `Started dev server in new terminal window`,
                });
                allStdout += `\n--- Started dev server: ${commandToRun} ---\nRunning in new terminal window\n`;
              } catch (error) {
                console.error(
                  `[Workflow] Error in execute_command: ${error.message}`
                );
                console.error(`[Workflow] Stack: ${error.stack}`);
                results.push({
                  type: "execute_command",
                  value: commandToRun,
                  success: false,
                  error: error.message,
                });
                allStderr += `\n--- Failed to start dev server: ${error.message}\n`;
              }
            } else {
              // For non-dev-server commands, run normally (blocking)
              try {
                const { stdout, stderr } = await execAsync(step.value, {
                  shell: "powershell.exe",
                  cwd: currentDirectory,
                  maxBuffer: 10 * 1024 * 1024,
                });
                results.push({
                  type: "execute_command",
                  value: step.value,
                  success: true,
                  stdout,
                  stderr,
                });
                allStdout += `\n--- Command: ${step.value} ---\n${
                  stdout || "(no output)"
                }\n`;
                if (stderr)
                  allStderr += `\n--- Command: ${step.value} ---\n${stderr}\n`;
              } catch (error) {
                results.push({
                  type: "execute_command",
                  value: step.value,
                  success: false,
                  error: error.message,
                });
                allStderr += `\n--- Command failed: ${step.value} ---\n${error.message}\n`;
              }
            }
            break;

          case "open_app":
            console.log(`[Workflow] Opening app: ${step.value}`);
            let appName = step.value;
            let appPath = null;

            if (
              appName.toLowerCase().startsWith("code ") ||
              appName.toLowerCase().startsWith("cursor ") ||
              appName.toLowerCase().startsWith("webstorm ")
            ) {
              const parts = appName.split(" ");
              appName = parts[0];
              appPath = parts.slice(1).join(" ");

              // First check if appPath is a project nickname
              const appProject = resolveProject(appPath);
              const isProject = !!appProject;

              if (appProject) {
                appPath = appProject.filepath;
              } else if (appPath && !fs.existsSync(appPath)) {
                // Path doesn't exist and not a project - need confirmation
                const confirmationId = `confirm_${Date.now()}_${++confirmationIdCounter}`;
                pendingConfirmations.set(confirmationId, {
                  type: "open_app",
                  originalValue: step.value,
                  appName: appName,
                  appPath: appPath,
                  stepIndex: i,
                  workflow: workflow,
                  currentDirectory: currentDirectory,
                  results: results,
                  allStdout: allStdout,
                  allStderr: allStderr,
                });

                clearTimeout(workflowTimeout);
                return {
                  needsConfirmation: true,
                  confirmationId: confirmationId,
                  message: `The path "${appPath}" does not exist. Would you like to proceed with opening ${appName} in this location?`,
                  path: appPath,
                  type: "open_app",
                  appName: appName,
                };
              } else if (appPath) {
                appPath = path.resolve(appPath);
              }
            }
            console.log(
              `[Workflow] Resolved app: ${appName}, path: ${appPath || "none"}`
            );

            if (appPath) {
              const ideToUse =
                appName === "code" ? userPreferences.ide || "code" : appName;
              try {
                await execAsync(`${ideToUse} "${appPath}"`, {
                  shell: "cmd.exe",
                });
                results.push({
                  type: "open_app",
                  value: step.value,
                  success: true,
                  message: `Opened ${ideToUse} with directory: ${appPath}`,
                });
                allStdout += `\n--- Opened ${ideToUse} with directory: ${appPath} ---\n`;
              } catch (error) {
                const appResult = await openApplication(ideToUse);
                results.push({
                  type: "open_app",
                  value: step.value,
                  ...appResult,
                });
                allStdout += `\n--- Opened app: ${step.value} ---\n${
                  appResult.message || ""
                }\n`;
                if (appResult.error)
                  allStderr += `\n--- App error: ${appResult.error}\n`;
              }
            } else {
              const appToOpen =
                appName === "code" ? userPreferences.ide || "code" : appName;
              const appResult = await openApplication(appToOpen);
              results.push({
                type: "open_app",
                value: step.value,
                ...appResult,
              });
              allStdout += `\n--- Opened app: ${appToOpen} ---\n${
                appResult.message || ""
              }\n`;
              if (appResult.error)
                allStderr += `\n--- App error: ${appResult.error}\n`;
            }
            break;

          case "open_browser":
            console.log(`[Workflow] Opening browser: ${step.value}`);
            let url = step.value;

            // If it's a localhost URL without a port, or just a port number, detect the port
            if (
              currentProject &&
              (url.includes("localhost") || url.match(/^\d+$/))
            ) {
              const detectedPort = detectPort(
                currentProject,
                userPreferences.defaultPort
              );
              if (url.match(/^\d+$/)) {
                // Just a port number
                url = `http://localhost:${url}`;
              } else if (
                url.includes("localhost") &&
                !url.match(/localhost:\d+/)
              ) {
                // localhost without port
                url = `http://localhost:${detectedPort}`;
              } else if (!url.includes(":")) {
                // Just "localhost"
                url = `http://localhost:${detectedPort}`;
              }
            }

            if (!url.startsWith("http://") && !url.startsWith("https://")) {
              if (url.includes("localhost") || url.match(/^\d+$/)) {
                url = `http://${url}`;
              } else {
                const browserResult = await searchInBrowser(step.value);
                results.push({
                  type: "open_browser",
                  value: step.value,
                  ...browserResult,
                });
                allStdout += `\n--- Opened browser: ${step.value} ---\n${
                  browserResult.message || ""
                }\n`;
                break;
              }
            }
            try {
              console.log(`[Workflow] Opening URL: ${url}`);
              await execAsync(`start "" "${url}"`, { shell: "cmd.exe" });
              console.log(`[Workflow] Browser opened successfully`);
              results.push({
                type: "open_browser",
                value: url,
                success: true,
                message: `Opened browser: ${url}`,
              });
              allStdout += `\n--- Opened browser: ${url} ---\n`;
            } catch (error) {
              console.error(`[Workflow] Browser error: ${error.message}`);
              results.push({
                type: "open_browser",
                value: url,
                success: false,
                error: error.message,
              });
              allStderr += `\n--- Browser error: ${error.message}\n`;
            }
            break;

          case "open_file":
            let filePath = step.value;
            // First check if step.value is a nickname
            const fileProject = resolveProject(step.value);
            if (fileProject) {
              filePath = fileProject.filepath;
            } else if (!fs.existsSync(filePath)) {
              filePath = path.resolve(step.value);
            }
            const fileResult = await openFileOrFolder(filePath);
            results.push({
              type: "open_file",
              value: step.value,
              resolvedPath: filePath,
              ...fileResult,
            });
            allStdout += `\n--- Opened file: ${filePath} ---\n${
              fileResult.message || ""
            }\n`;
            if (fileResult.error)
              allStderr += `\n--- File error: ${fileResult.error}\n`;
            break;

          default:
            results.push({
              type: step.type,
              success: false,
              error: `Unknown workflow step type: ${step.type}`,
            });
            allStderr += `\n--- Unknown step type: ${step.type} ---\n`;
        }
      } catch (error) {
        results.push({
          type: step.type,
          value: step.value,
          success: false,
          error: error.message,
        });
        allStderr += `\n--- Step failed: ${step.type} - ${step.value} ---\n${error.message}\n`;
      }
    }

    clearTimeout(workflowTimeout);
    console.log(
      `[Workflow] Workflow completed successfully with ${results.length} results`
    );
    return {
      results,
      stdout: allStdout.trim(),
      stderr: allStderr.trim(),
    };
  } catch (error) {
    clearTimeout(workflowTimeout);
    console.error("[Workflow] Workflow execution error:", error);
    console.error("[Workflow] Stack:", error.stack);
    return {
      results,
      stdout: allStdout.trim(),
      stderr: (
        allStderr + `\n--- Workflow error: ${error.message} ---\n`
      ).trim(),
    };
  }
}

// Helper function to get preferences file path (matches Electron's path)
function getPreferencesPath() {
  // On Windows, Electron stores userData in AppData\Roaming\AppName
  // We'll use the same location
  const appName = "Navi";
  if (process.platform === "win32") {
    const appDataPath =
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appDataPath, appName, "preferences.json");
  } else {
    // For macOS/Linux, use standard user data location
    const userDataPath =
      process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
    return path.join(userDataPath, appName, "preferences.json");
  }
}

// Load preferences from persistent storage
function loadPreferencesFromFile() {
  try {
    const prefsPath = getPreferencesPath();
    // Ensure directory exists
    const prefsDir = path.dirname(prefsPath);
    if (!fs.existsSync(prefsDir)) {
      fs.mkdirSync(prefsDir, { recursive: true });
    }

    if (fs.existsSync(prefsPath)) {
      const data = fs.readFileSync(prefsPath, "utf-8");
      const loaded = JSON.parse(data);

      // Migrate old format if needed
      if (
        loaded.pathNicknames &&
        (!loaded.projects || loaded.projects.length === 0)
      ) {
        loaded.projects = loaded.pathNicknames.map((pn) => ({
          nickname: pn.nickname,
          filepath: pn.path,
          startCommand: loaded.devServerCommand || "npm run dev",
        }));
      }

      return {
        ide: loaded.ide || "code",
        defaultPort: loaded.defaultPort || "3000",
        projects: loaded.projects || [],
      };
    }
  } catch (error) {
    console.error("Error loading preferences from file:", error);
  }

  // Return default preferences
  return {
    ide: "code",
    defaultPort: "3000",
    projects: [],
  };
}

// Save preferences to persistent storage
function savePreferencesToFile(preferences) {
  try {
    const prefsPath = getPreferencesPath();
    // Ensure directory exists
    const prefsDir = path.dirname(prefsPath);
    if (!fs.existsSync(prefsDir)) {
      fs.mkdirSync(prefsDir, { recursive: true });
    }

    fs.writeFileSync(prefsPath, JSON.stringify(preferences, null, 2), "utf-8");
    console.log("✓ Preferences saved to persistent storage");
  } catch (error) {
    console.error("Error saving preferences to file:", error);
    throw error;
  }
}

// Preferences storage (in-memory, synced from Electron persistent storage)
// Load from file on startup
let userPreferences = loadPreferencesFromFile();
console.log("✓ Loaded preferences from persistent storage:", {
  ide: userPreferences.ide,
  defaultPort: userPreferences.defaultPort,
  projectsCount: userPreferences.projects?.length || 0,
});

// Store pending confirmations (requestId -> confirmation data)
const pendingConfirmations = new Map();
let confirmationIdCounter = 0;

// Helper function to resolve project by nickname (case-insensitive)
function resolveProject(nickname) {
  if (!userPreferences.projects || !Array.isArray(userPreferences.projects)) {
    return null;
  }

  const nicknameLower = nickname.toLowerCase().trim();
  const match = userPreferences.projects.find(
    (item) => item.nickname && item.nickname.toLowerCase() === nicknameLower
  );

  return match || null;
}

// Helper function to detect port from startCommand or use project port
function detectPort(project, defaultPort) {
  // If project has explicit port, use it
  if (project && project.port) {
    return project.port;
  }

  // Try to detect port from startCommand
  if (project && project.startCommand) {
    const command = project.startCommand;

    // Look for --port or -p flags
    const portMatch = command.match(/(?:--port|-p)\s+(\d+)/i);
    if (portMatch) {
      return portMatch[1];
    }

    // Look for PORT= environment variable
    const envPortMatch = command.match(/PORT\s*=\s*(\d+)/i);
    if (envPortMatch) {
      return envPortMatch[1];
    }

    // Look for common port patterns in URLs
    const urlPortMatch = command.match(/localhost[:\s]+(\d+)/i);
    if (urlPortMatch) {
      return urlPortMatch[1];
    }

    // Check for common dev server ports based on command
    if (command.includes("vite")) {
      return "5173"; // Vite default
    }
    if (command.includes("next")) {
      return "3000"; // Next.js default
    }
    if (
      command.includes("react-scripts") ||
      command.includes("create-react-app")
    ) {
      return "3000"; // CRA default
    }
  }

  // Fall back to default port
  return defaultPort || "3000";
}

// POST endpoint for AI-powered prompts
app.post("/prompt", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({
        success: false,
        error: "Prompt is required and must be a string",
      });
    }

    if (!model) {
      return res.status(500).json({
        success: false,
        error:
          "Gemini API not configured. Please set GEMINI_API_KEY environment variable.",
      });
    }

    // Reload preferences from file to ensure we have the latest
    userPreferences = loadPreferencesFromFile();

    // Build projects context
    const projectsList =
      userPreferences.projects &&
      Array.isArray(userPreferences.projects) &&
      userPreferences.projects.length > 0
        ? userPreferences.projects
            .map((p) => {
              const port = detectPort(p, userPreferences.defaultPort);
              return `  - "${p.nickname}" -> ${p.filepath} (start: ${p.startCommand}, port: ${port})`;
            })
            .join("\n")
        : "  (none configured)";

    const preferencesContext = `User Preferences:
- IDE: ${userPreferences.ide || "code"}
- Default Port: ${userPreferences.defaultPort || "3000"}
- Projects:
${projectsList}

`;

    const systemPrompt = `${preferencesContext}You are an AI assistant for Windows developers. You help users with:
- Executing shell commands and scripts
- Opening applications and files
- Performing web searches
- System operations (restart, shutdown, etc.)
- Complex developer workflows (like opening dev environments, booting up dev servers)

IMPORTANT: When a user asks to "boot up my dev server for X" or "open my dev environment for Y":
1. FIRST check if X or Y matches a configured project nickname (case-insensitive). If it does, use the project's filepath and startCommand.
2. If no project nickname matches, tell the user: "I don't recognize that project nickname. You can add projects in Settings. Go to Settings > Projects and add a project with a nickname, filepath, and start command."
3. Use the complex_developer_workflow tool
4. The workflow should include these steps in order:
   a. open_terminal: Open a terminal in the project directory (use the project's filepath)
   b. execute_command: Run the project's startCommand (NOT the default dev server command)
   c. open_browser: Open the localhost URL (use the user's preferred port, typically "http://localhost:3000" or similar)
   d. open_app: Open the IDE (use the user's preferred IDE, typically "code" for VS Code) with the project directory
   e. open_file: Optionally open the project folder in file explorer

Example for "open the dev environment for wotc" (if "wotc" is a configured project):
- If project has port field "5173": use "http://localhost:5173"
- If startCommand is "npm run dev" (no port specified): detect port (likely 3000 for React apps)
- If startCommand is "vite": use port 5173 (Vite default)
- If startCommand is "npm run dev -- --port 8080": extract port 8080 from command

{
  "workflow": {
    "steps": [
      {"type": "open_terminal", "value": "wotc"},
      {"type": "execute_command", "value": "npm run dev"},
      {"type": "open_browser", "value": "http://localhost:3000"},
      {"type": "open_app", "value": "${userPreferences.ide || "code"} wotc"},
      {"type": "open_file", "value": "wotc"}
    ]
  }
}

IMPORTANT: For the open_browser step, ALWAYS use the project's port:
1. If the project has a port field, use that exact port
2. Otherwise, detect the port from the startCommand:
   - Look for --port or -p flags: "npm run dev -- --port 5173" -> 5173
   - Look for PORT= environment variable: "PORT=8080 npm run dev" -> 8080
   - Check for common dev server defaults: vite -> 5173, next -> 3000, react-scripts -> 3000
3. Only use the defaultPort preference if no port can be detected from the project

IMPORTANT: Use the user's preferences when available:
- Projects: ALWAYS check if the user mentions a project nickname first. Nicknames are case-insensitive. If a project is found, use its filepath and startCommand (NOT the default dev server command).
- Port: Use the project's port if specified, otherwise try to detect it from the startCommand (look for --port, -p, PORT=, or common ports like 3000, 5173, 8080). If no port can be determined, use the user's defaultPort preference.
- IDE: Use the user's preferred IDE (typically "code" for VS Code, but could be "cursor", "webstorm", etc.)

If the user mentions a project nickname that doesn't exist, tell them: "I don't recognize that project nickname. You can add projects in Settings. Go to Settings > Projects and add a project with a nickname, filepath, and start command."

When the user asks you to do something, use the appropriate tool(s) to accomplish the task.
Be smart about breaking down requests into the right sequence of actions.`;

    try {
      const modelNames = [
        "gemini-2.5-flash",
        "gemini-1.5-flash",
        "gemini-1.5-pro",
        "gemini-pro",
      ];

      let result;
      let lastError;

      for (const modelName of modelNames) {
        try {
          console.log(`Trying model: ${modelName}`);
          const currentModel = genAI.getGenerativeModel({ model: modelName });
          result = await currentModel.generateContent({
            contents: [
              {
                role: "user",
                parts: [{ text: `${systemPrompt}\n\nUser request: ${prompt}` }],
              },
            ],
            tools: tools,
            generationConfig: {
              temperature: 0.7,
            },
          });
          console.log(`✓ Successfully used model: ${modelName}`);
          break;
        } catch (modelError) {
          console.log(`✗ Model ${modelName} failed: ${modelError.message}`);
          lastError = modelError;
          continue;
        }
      }

      if (!result) {
        console.log("All models failed with tools, trying without tools...");
        for (const modelName of modelNames) {
          try {
            console.log(`Trying model ${modelName} without tools...`);
            const currentModel = genAI.getGenerativeModel({ model: modelName });
            result = await currentModel.generateContent({
              contents: [
                {
                  role: "user",
                  parts: [
                    {
                      text: `${systemPrompt}\n\nUser request: ${prompt}\n\nNote: You cannot execute functions, but please provide helpful guidance.`,
                    },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.7,
              },
            });
            console.log(
              `✓ Successfully used model: ${modelName} (without tools)`
            );
            const textResponse = result.response.text();
            return res.json({
              success: true,
              stdout:
                textResponse ||
                "I understand your request, but function calling is not available with this model. Please try a different model or API key.",
              stderr: "",
              actions: [],
            });
          } catch (modelError) {
            console.log(
              `✗ Model ${modelName} failed without tools: ${modelError.message}`
            );
            lastError = modelError;
            continue;
          }
        }

        if (!result) {
          throw lastError || new Error("All model attempts failed");
        }
      }

      const response = result.response;
      const functionCalls = [];

      if (response.candidates && response.candidates.length > 0) {
        const candidate = response.candidates[0];
        if (candidate.content && candidate.content.parts) {
          for (const part of candidate.content.parts) {
            if (part.functionCall) {
              functionCalls.push(part.functionCall);
            }
          }
        }
      }

      if (functionCalls.length === 0) {
        const textResponse = response.text();
        return res.json({
          success: true,
          stdout:
            textResponse ||
            "I understand your request, but I'm not sure how to execute it. Could you be more specific?",
          stderr: "",
          actions: [],
        });
      }

      const actions = [];
      let allStdout = "";
      let allStderr = "";
      let overallSuccess = true;

      for (const functionCall of functionCalls) {
        const functionName = functionCall.name;
        const args = functionCall.args;

        try {
          let result;

          switch (functionName) {
            case "execute_shell_commands":
              result = await executeCommands(args.commands);
              allStdout += result.stdout + "\n";
              if (result.stderr) allStderr += result.stderr + "\n";
              actions.push({
                type: "execute_shell_commands",
                commands: args.commands,
                results: result.results,
              });
              break;

            case "open_application":
              result = await openApplication(args.appName);
              allStdout += `${result.message || ""}\n`;
              if (result.error) {
                allStderr += `${result.error}\n`;
                overallSuccess = false;
              }
              actions.push({
                type: "open_application",
                appName: args.appName,
                ...result,
              });
              break;

            case "open_file_or_folder":
              result = await openFileOrFolder(args.path);
              allStdout += `${result.message || ""}\n`;
              if (result.error) {
                allStderr += `${result.error}\n`;
                overallSuccess = false;
              }
              actions.push({
                type: "open_file_or_folder",
                path: args.path,
                ...result,
              });
              break;

            case "search_in_browser":
              result = await searchInBrowser(args.query);
              allStdout += `${result.message || ""}\n`;
              if (result.error) {
                allStderr += `${result.error}\n`;
                overallSuccess = false;
              }
              actions.push({
                type: "search_in_browser",
                query: args.query,
                ...result,
              });
              break;

            case "system_command":
              result = await executeSystemCommand(args.action);
              allStdout += `${result.message || ""}\n`;
              if (result.error) {
                allStderr += `${result.error}\n`;
                overallSuccess = false;
              }
              actions.push({
                type: "system_command",
                action: args.action,
                ...result,
              });
              break;

            case "open_terminal_in_directory":
              result = await openTerminalInDirectory(args.directory);
              allStdout += `${result.message || ""}\n`;
              if (result.error) {
                allStderr += `${result.error}\n`;
                overallSuccess = false;
              }
              actions.push({
                type: "open_terminal_in_directory",
                directory: args.directory,
                ...result,
              });
              break;

            case "complex_developer_workflow":
              result = await executeComplexWorkflow(args.workflow);

              // Check if workflow needs confirmation
              if (result.needsConfirmation) {
                return res.json({
                  success: false,
                  needsConfirmation: true,
                  confirmationId: result.confirmationId,
                  message: result.message,
                  path: result.path,
                  type: result.type,
                  appName: result.appName,
                });
              }

              allStdout += result.stdout + "\n";
              if (result.stderr) allStderr += result.stderr + "\n";
              actions.push({
                type: "complex_developer_workflow",
                workflow: args.workflow,
                results: result.results,
              });
              break;

            default:
              allStderr += `Unknown function: ${functionName}\n`;
              overallSuccess = false;
          }
        } catch (error) {
          allStderr += `Error executing ${functionName}: ${error.message}\n`;
          overallSuccess = false;
          actions.push({
            type: functionName,
            success: false,
            error: error.message,
          });
        }
      }

      res.json({
        success: overallSuccess,
        stdout: allStdout.trim() || "Commands executed successfully.",
        stderr: allStderr.trim(),
        actions: actions,
      });
    } catch (geminiError) {
      console.error("Gemini API error:", geminiError);
      res.status(500).json({
        success: false,
        error: "Failed to process request with AI",
        message: geminiError.message,
      });
    }
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

// Endpoint to search apps for autocomplete (optimized for speed)
app.get("/search-apps", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== "string" || q.trim().length === 0) {
      return res.json({ suggestions: [] });
    }

    const query = q.trim();
    console.log(`Searching for apps with query: "${query}"`);

    const suggestions = await Promise.race([
      searchApps(query, 10),
      new Promise((resolve) => setTimeout(() => resolve([]), 500)),
    ]);

    console.log(`Found ${suggestions.length} suggestions for "${query}"`);
    if (suggestions.length > 0) {
      console.log(
        `Top suggestions: ${suggestions
          .slice(0, 3)
          .map((s) => s.name)
          .join(", ")}`
      );
    }

    res.json({ suggestions: Array.isArray(suggestions) ? suggestions : [] });
  } catch (error) {
    console.error("Error searching apps:", error);
    res.json({ suggestions: [] });
  }
});

// Direct endpoint to open an app (bypasses AI)
app.post("/open-app", async (req, res) => {
  try {
    const {
      appName,
      appPath,
      isUWP,
      workingDirectory,
      arguments: appArgs,
    } = req.body;

    if (!appName) {
      return res
        .status(400)
        .json({ success: false, error: "App name is required" });
    }

    console.log(
      `Attempting to open app: ${appName} with path: ${
        appPath || "none"
      }, isUWP: ${isUWP}, workingDirectory: ${
        workingDirectory || "none"
      }, arguments: ${appArgs || "none"}`
    );

    // If we have a shortcut file (.lnk), open it directly
    // This is especially important for desktop game shortcuts
    if (appPath && appPath.trim().toLowerCase().endsWith(".lnk")) {
      try {
        // Open the shortcut file directly - Windows will handle it correctly
        await execAsync(`start "" "${appPath}"`, { shell: "cmd.exe" });
        console.log(`✓ Successfully opened shortcut: ${appName}`);
        return res.json({
          success: true,
          message: `Opened application: ${appName}`,
          action: { type: "open_application", appName, appPath },
        });
      } catch (error) {
        console.warn(`Failed to open shortcut directly: ${error.message}`);
        // Fall through to try other methods
      }
    }

    if (appPath && appPath.trim()) {
      // Handle UWP apps (like Discord)
      if (isUWP || (appPath.includes("_") && appPath.includes("!"))) {
        const methods = [
          `explorer.exe shell:AppsFolder\\${appPath}`,
          `start shell:AppsFolder\\${appPath}`,
          `powershell.exe -Command "Start-Process shell:AppsFolder\\${appPath}"`,
        ];

        for (const method of methods) {
          try {
            const shell =
              method.startsWith("explorer") || method.startsWith("start")
                ? "cmd.exe"
                : "powershell.exe";
            await execAsync(method, { shell });
            console.log(`✓ Successfully opened UWP app: ${appName}`);
            return res.json({
              success: true,
              message: `Opened application: ${appName}`,
              action: { type: "open_application", appName, appPath },
            });
          } catch (error) {
            console.warn(`UWP method failed: ${error.message}`);
          }
        }
      }

      // Handle regular .exe apps with working directory and arguments
      if (appPath.toLowerCase().endsWith(".exe")) {
        const methods = [];

        // If we have working directory or arguments, use Start-Process with parameters
        if (workingDirectory || appArgs) {
          let startCmd = `Start-Process -FilePath "${appPath}"`;
          if (workingDirectory) {
            startCmd += ` -WorkingDirectory "${workingDirectory}"`;
          }
          if (appArgs) {
            startCmd += ` -ArgumentList "${appArgs}"`;
          }
          methods.push(startCmd);
        }

        // Standard methods
        methods.push(
          `Start-Process -FilePath "${appPath}"`,
          `Start-Process "${appPath}"`,
          `start "" "${appPath}"`
        );

        for (const method of methods) {
          try {
            const shell = method.includes("start")
              ? "cmd.exe"
              : "powershell.exe";
            await execAsync(method, { shell });
            console.log(
              `✓ Successfully opened app: ${appName} using method: ${method.substring(
                0,
                50
              )}...`
            );
            return res.json({
              success: true,
              message: `Opened application: ${appName}`,
              action: { type: "open_application", appName, appPath },
            });
          } catch (methodError) {
            console.warn(`Method failed: ${methodError.message}`);
          }
        }
      } else {
        // Try as regular executable
        const methods = [
          `Start-Process -FilePath "${appPath}"`,
          `Start-Process "${appPath}"`,
          `start "" "${appPath}"`,
        ];

        for (const method of methods) {
          try {
            const shell = method.includes("start")
              ? "cmd.exe"
              : "powershell.exe";
            await execAsync(method, { shell });
            console.log(`✓ Successfully opened app: ${appName}`);
            return res.json({
              success: true,
              message: `Opened application: ${appName}`,
              action: { type: "open_application", appName, appPath },
            });
          } catch (methodError) {
            console.warn(`Method failed: ${methodError.message}`);
          }
        }
      }

      console.error(
        `All methods failed to open app: ${appName} with path: ${appPath}`
      );
    }

    // Fallback: try opening by name
    try {
      await execAsync(`Start-Process "${appName}"`, {
        shell: "powershell.exe",
      });
      console.log(`✓ Successfully opened app by name: ${appName}`);
      return res.json({
        success: true,
        message: `Opened application: ${appName}`,
        action: { type: "open_application", appName },
      });
    } catch (nameError) {
      console.error(`Failed to open app by name: ${nameError.message}`);
      return res.status(500).json({
        success: false,
        error: `Failed to open application "${appName}". Path: ${
          appPath || "not provided"
        }. Please check the app name and try again.`,
      });
    }
  } catch (error) {
    console.error("Error opening app:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get running applications endpoint
app.get("/running-apps", async (req, res) => {
  try {
    // PowerShell command to get running applications
    // This gets processes with windows (visible applications)
    // Removed Get-Unique as it doesn't work well with objects - we'll deduplicate in JS
    const psCommand = `
      Get-Process | Where-Object {
        $_.MainWindowTitle -ne "" -and 
        $_.ProcessName -ne "Idle" -and 
        $_.ProcessName -ne "dwm" -and
        $_.ProcessName -ne "csrss" -and
        $_.ProcessName -ne "winlogon" -and
        $_.ProcessName -ne "services" -and
        $_.ProcessName -ne "lsass" -and
        $_.ProcessName -ne "svchost" -and
        $_.ProcessName -ne "explorer" -and
        $_.ProcessName -ne "SearchIndexer" -and
        $_.ProcessName -ne "SearchApp" -and
        $_.ProcessName -ne "RuntimeBroker" -and
        $_.ProcessName -ne "ApplicationFrameHost" -and
        $_.ProcessName -ne "Navi"
      } | Select-Object ProcessName, MainWindowTitle | 
      Sort-Object ProcessName | 
      ConvertTo-Json -Depth 3
    `;

    const { stdout, stderr } = await execAsync(psCommand, {
      shell: "powershell.exe",
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    if (stderr && !stdout) {
      throw new Error(stderr);
    }

    let processes = [];
    try {
      const parsed = JSON.parse(stdout.trim());
      // Handle both single object and array
      processes = Array.isArray(parsed) ? parsed : [parsed];
    } catch (parseError) {
      console.error("JSON parse error:", parseError.message);
      console.error("Raw stdout:", stdout);
      // If JSON parse fails, try to extract process names manually
      const lines = stdout.split("\n");
      const processSet = new Set();
      for (const line of lines) {
        const match = line.match(/ProcessName["\s:]+([^",\s}]+)/i);
        if (match && match[1]) {
          processSet.add(match[1]);
        }
      }
      processes = Array.from(processSet).map((name) => ({
        ProcessName: name,
        MainWindowTitle: "",
      }));
    }

    // Format and deduplicate by process name (case-insensitive)
    const appMap = new Map();
    for (const proc of processes) {
      if (proc && proc.ProcessName) {
        const procName = proc.ProcessName.trim();
        if (procName && !appMap.has(procName.toLowerCase())) {
          appMap.set(procName.toLowerCase(), {
            name: procName, // Keep original case for display
            windowTitle: proc.MainWindowTitle || "",
          });
        }
      }
    }

    const runningApps = Array.from(appMap.values());
    // Sort alphabetically by name
    runningApps.sort((a, b) => a.name.localeCompare(b.name));
    
    console.log(`Found ${runningApps.length} running apps`);
    res.json({ success: true, apps: runningApps });
  } catch (error) {
    console.error("Error getting running apps:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      apps: [],
    });
  }
});

// Quit application endpoint
app.post("/quit-app", async (req, res) => {
  try {
    const { appName } = req.body;

    if (!appName) {
      return res.status(400).json({
        success: false,
        error: "App name is required",
      });
    }

    console.log(`Attempting to quit app: ${appName}`);

    // Try to kill the process by name
    // Use Stop-Process which is more graceful than taskkill
    const psCommand = `
      $processes = Get-Process -Name "${appName}" -ErrorAction SilentlyContinue
      if ($processes) {
        $processes | Stop-Process -Force
        Write-Output "Success"
      } else {
        Write-Output "NotFound"
      }
    `;

    try {
      const { stdout } = await execAsync(psCommand, {
        shell: "powershell.exe",
      });

      if (stdout.trim().includes("Success")) {
        console.log(`✓ Successfully quit app: ${appName}`);
        return res.json({
          success: true,
          message: `Quit application: ${appName}`,
        });
      } else {
        return res.status(404).json({
          success: false,
          error: `Application "${appName}" is not running`,
        });
      }
    } catch (execError) {
      // If Stop-Process fails, try taskkill as fallback
      try {
        await execAsync(`taskkill /F /IM ${appName}.exe`, {
          shell: "cmd.exe",
        });
        console.log(`✓ Successfully quit app (via taskkill): ${appName}`);
        return res.json({
          success: true,
          message: `Quit application: ${appName}`,
        });
      } catch (taskkillError) {
        throw new Error(
          `Failed to quit application "${appName}": ${execError.message}`
        );
      }
    }
  } catch (error) {
    console.error("Error quitting app:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Focus/Switch to application endpoint
app.post("/focus-app", async (req, res) => {
  try {
    const { appName } = req.body;

    if (!appName) {
      return res.status(400).json({
        success: false,
        error: "App name is required",
      });
    }

    console.log(`Attempting to focus app: ${appName}`);

    // PowerShell command to bring window to front
    // Uses Windows API SetForegroundWindow via PowerShell
    // Only restores if window is minimized, otherwise just focuses
    const psCommand = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class Win32 {
          [DllImport("user32.dll")]
          [return: MarshalAs(UnmanagedType.Bool)]
          public static extern bool SetForegroundWindow(IntPtr hWnd);
          
          [DllImport("user32.dll")]
          [return: MarshalAs(UnmanagedType.Bool)]
          public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
          
          [DllImport("user32.dll")]
          [return: MarshalAs(UnmanagedType.Bool)]
          public static extern bool IsIconic(IntPtr hWnd);
          
          public static readonly int SW_RESTORE = 9;
          public static readonly int SW_SHOW = 5;
        }
"@
      $processes = Get-Process -Name "${appName}" -ErrorAction SilentlyContinue
      if ($processes) {
        $focused = $false
        foreach ($proc in $processes) {
          if ($proc.MainWindowHandle -ne [IntPtr]::Zero) {
            # Only restore if window is minimized, otherwise just focus without changing window state
            if ([Win32]::IsIconic($proc.MainWindowHandle)) {
              [Win32]::ShowWindow($proc.MainWindowHandle, [Win32]::SW_RESTORE)
            }
            # Just focus the window without changing its state (don't call ShowWindow if not minimized)
            [Win32]::SetForegroundWindow($proc.MainWindowHandle)
            $focused = $true
            break
          }
        }
        if ($focused) {
          Write-Output "Success"
        } else {
          Write-Output "NoWindow"
        }
      } else {
        Write-Output "NotFound"
      }
    `;

    try {
      const { stdout } = await execAsync(psCommand, {
        shell: "powershell.exe",
        maxBuffer: 10 * 1024 * 1024,
      });

      const result = stdout.trim();
      
      if (result.includes("Success")) {
        console.log(`✓ Successfully focused app: ${appName}`);
        return res.json({
          success: true,
          message: `Switched to ${appName}`,
        });
      } else if (result.includes("NoWindow")) {
        return res.status(404).json({
          success: false,
          error: `Application "${appName}" is running but has no visible window`,
        });
      } else {
        return res.status(404).json({
          success: false,
          error: `Application "${appName}" is not running`,
        });
      }
    } catch (execError) {
      throw new Error(
        `Failed to focus application "${appName}": ${execError.message}`
      );
    }
  } catch (error) {
    console.error("Error focusing app:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get recent files endpoint - optimized for speed
app.get("/recent-files", async (req, res) => {
  try {
    const { type } = req.query; // "files", "folders", or undefined for both
    
    // Optimized PowerShell command - faster execution with reduced processing
    const psCommand = `
      $recentPath = [Environment]::GetFolderPath('Recent')
      $shell = New-Object -ComObject WScript.Shell
      $items = New-Object System.Collections.ArrayList
      $count = 0
      $maxItems = 20
      $maxProcess = 30  # Process max 30 shortcuts, stop early if we have enough
      
      # Get shortcuts sorted by last write time, process only what we need
      Get-ChildItem -Path $recentPath -Filter "*.lnk" -ErrorAction SilentlyContinue | 
        Sort-Object LastWriteTime -Descending |
        Select-Object -First $maxProcess |
        ForEach-Object {
          if ($count -ge $maxItems) { return }
          try {
            $shortcut = $shell.CreateShortcut($_.FullName)
            $targetPath = $shortcut.TargetPath
            if ($targetPath -and (Test-Path -LiteralPath $targetPath -ErrorAction SilentlyContinue)) {
              $item = Get-Item -LiteralPath $targetPath -ErrorAction SilentlyContinue
              if ($item) {
                $null = $items.Add([PSCustomObject]@{
                  Name = $item.Name
                  Path = $targetPath
                  IsFolder = $item.PSIsContainer
                  LastAccess = $_.LastWriteTime
                })
                $count++
              }
            }
          } catch {}
        }
      
      $items | ConvertTo-Json -Depth 2 -Compress
    `;

    const { stdout, stderr } = await execAsync(psCommand, {
      shell: "powershell.exe",
      maxBuffer: 10 * 1024 * 1024,
    });

    if (stderr && !stdout) {
      throw new Error(stderr);
    }

    let items = [];
    try {
      const parsed = JSON.parse(stdout.trim());
      items = Array.isArray(parsed) ? parsed : [parsed];
    } catch (parseError) {
      console.error("JSON parse error:", parseError.message);
      items = [];
    }

    // Filter by type if specified
    if (type === "files") {
      items = items.filter((item) => !item.IsFolder);
    } else if (type === "folders") {
      items = items.filter((item) => item.IsFolder);
    }

    res.json({ success: true, items });
  } catch (error) {
    console.error("Error getting recent files:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      items: [],
    });
  }
});

// Get preferences endpoint - always read from file to ensure latest data
app.get("/preferences", (req, res) => {
  // Reload from file to ensure we have the latest preferences
  userPreferences = loadPreferencesFromFile();
  res.json(userPreferences);
});

// Get available terminals endpoint
app.get("/terminals", async (req, res) => {
  try {
    const terminals = [];
    const terminalNames = [
      { name: "wt", searchTerms: ["windows terminal", "wt.exe"] },
      { name: "powershell", searchTerms: ["powershell", "powershell.exe"] },
      { name: "cmd", searchTerms: ["cmd", "cmd.exe", "command prompt"] },
      { name: "git-bash", searchTerms: ["git bash", "bash.exe", "git"] },
      { name: "wsl", searchTerms: ["wsl", "windows subsystem"] },
    ];

    // Get all installed apps
    const apps = await findInstalledApps();

    for (const terminal of terminalNames) {
      // Check if terminal exists by searching apps
      const found = apps.some((app) => {
        const appNameLower = app.Name.toLowerCase();
        return terminal.searchTerms.some((term) =>
          appNameLower.includes(term.toLowerCase())
        );
      });

      // Also check if executable exists in PATH
      if (!found) {
        try {
          const checkCommands = {
            wt: "where wt.exe",
            powershell: "where powershell.exe",
            cmd: "where cmd.exe",
            "git-bash": "where git.exe",
            wsl: "wsl --list --quiet",
          };

          if (checkCommands[terminal.name]) {
            await execAsync(checkCommands[terminal.name], {
              shell: "cmd.exe",
              timeout: 2000,
            });
            terminals.push(terminal.name);
          }
        } catch (error) {
          // Terminal not found, skip
        }
      } else {
        terminals.push(terminal.name);
      }
    }

    // Always include basic terminals that should always be available
    if (!terminals.includes("powershell")) terminals.push("powershell");
    if (!terminals.includes("cmd")) terminals.push("cmd");

    res.json({ terminals });
  } catch (error) {
    console.error("Error detecting terminals:", error);
    // Return default terminals on error
    res.json({ terminals: ["wt", "powershell", "cmd"] });
  }
});

// Save preferences endpoint
app.post("/preferences", (req, res) => {
  try {
    const { ide, defaultPort, projects } = req.body;

    if (ide) userPreferences.ide = ide;
    if (defaultPort) userPreferences.defaultPort = defaultPort;
    if (projects !== undefined) userPreferences.projects = projects;

    // Migrate old format if needed
    if (req.body.pathNicknames && (!projects || projects.length === 0)) {
      userPreferences.projects = req.body.pathNicknames.map((pn) => ({
        nickname: pn.nickname,
        filepath: pn.path,
        startCommand: req.body.devServerCommand || "npm run dev",
      }));
    }

    // Save to persistent storage
    savePreferencesToFile(userPreferences);

    console.log("Preferences updated:", userPreferences);
    res.json({ success: true, preferences: userPreferences });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Confirmation endpoint - handle user confirmation responses
app.post("/confirm", async (req, res) => {
  try {
    const { confirmationId, confirmed, path } = req.body;

    if (!confirmationId || confirmed === undefined) {
      return res.status(400).json({
        success: false,
        error: "confirmationId and confirmed are required",
      });
    }

    const confirmation = pendingConfirmations.get(confirmationId);
    if (!confirmation) {
      return res.status(404).json({
        success: false,
        error: "Confirmation not found or expired",
      });
    }

    // Remove from pending
    pendingConfirmations.delete(confirmationId);

    if (!confirmed) {
      return res.json({
        success: false,
        cancelled: true,
        message: "Operation cancelled by user",
      });
    }

    // Continue workflow from where it left off
    const {
      type,
      originalValue,
      appName,
      stepIndex,
      workflow,
      currentDirectory,
      results,
      allStdout,
      allStderr,
    } = confirmation;

    // Re-execute the step with the confirmed path
    let stepResult;
    const confirmedPath = path || originalValue;

    try {
      switch (type) {
        case "open_terminal":
          stepResult = await openTerminalInDirectory(confirmedPath);
          results.push({
            type: "open_terminal",
            value: originalValue,
            resolvedPath: confirmedPath,
            ...stepResult,
          });
          if (stepResult.success) {
            confirmation.currentDirectory = path.resolve(confirmedPath);
          }
          break;

        case "open_app":
          if (appName) {
            const ideToUse =
              appName === "code" ? userPreferences.ide || "code" : appName;
            try {
              await execAsync(`${ideToUse} "${confirmedPath}"`, {
                shell: "cmd.exe",
              });
              results.push({
                type: "open_app",
                value: originalValue,
                resolvedPath: confirmedPath,
                success: true,
                message: `Opened ${ideToUse} with directory: ${confirmedPath}`,
              });
            } catch (error) {
              const appResult = await openApplication(ideToUse);
              results.push({
                type: "open_app",
                value: originalValue,
                resolvedPath: confirmedPath,
                ...appResult,
              });
            }
          }
          break;

        case "open_file":
          const fileResult = await openFileOrFolder(confirmedPath);
          results.push({
            type: "open_file",
            value: originalValue,
            resolvedPath: confirmedPath,
            ...fileResult,
          });
          break;
      }

      // Continue workflow from next step
      let newCurrentDirectory = confirmation.currentDirectory;
      let newAllStdout = allStdout;
      let newAllStderr = allStderr;

      // Continue executing remaining steps
      for (let i = stepIndex + 1; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];
        // ... (continue workflow execution)
        // For now, just return success and let the frontend handle re-execution
      }

      return res.json({
        success: true,
        message: "Operation confirmed and executed",
        results: results,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  } catch (error) {
    console.error("Confirmation error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Endpoint to open a file/folder path directly
app.post("/open-path", async (req, res) => {
  try {
    const { path: filePath } = req.body;

    if (!filePath || typeof filePath !== "string") {
      return res
        .status(400)
        .json({ success: false, error: "Path is required" });
    }

    const normalizedPath = filePath.trim();

    // Check if path exists
    if (!fs.existsSync(normalizedPath)) {
      return res.status(404).json({
        success: false,
        error: `Path not found: ${normalizedPath}`,
      });
    }

    // Open the path using Windows explorer
    try {
      await execAsync(`explorer.exe "${normalizedPath}"`, { shell: "cmd.exe" });
      console.log(`✓ Opened path: ${normalizedPath}`);
      return res.json({
        success: true,
        message: `Opened: ${normalizedPath}`,
        action: { type: "open_path", path: normalizedPath },
      });
    } catch (error) {
      console.error(`Failed to open path: ${error.message}`);
      return res.status(500).json({
        success: false,
        error: `Failed to open path: ${error.message}`,
      });
    }
  } catch (error) {
    console.error("Error opening path:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint to search the web
app.post("/search-web", async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== "string" || !query.trim()) {
      return res
        .status(400)
        .json({ success: false, error: "Search query is required" });
    }

    const queryTrimmed = query.trim();
    
    // Check if it's a URL (starts with http:// or https://)
    if (queryTrimmed.startsWith("http://") || queryTrimmed.startsWith("https://")) {
      // It's a URL, open it directly
      try {
        await execAsync(`start "" "${queryTrimmed}"`, { shell: "cmd.exe" });
        console.log(`✓ Opened URL: ${queryTrimmed}`);
        return res.json({
          success: true,
          message: `Opened URL: ${queryTrimmed}`,
        });
      } catch (error) {
        throw new Error(`Failed to open URL: ${error.message}`);
      }
    }

    // It's a search query, use Google search
    const searchQuery = encodeURIComponent(queryTrimmed);
    const searchUrl = `https://www.google.com/search?q=${searchQuery}`;

    // Open in default browser
    try {
      await execAsync(`start "" "${searchUrl}"`, { shell: "cmd.exe" });
      console.log(`✓ Opened web search: ${queryTrimmed}`);
      return res.json({
        success: true,
        message: `Searching for: ${queryTrimmed}`,
        action: { type: "search_web", query: query.trim(), url: searchUrl },
      });
    } catch (error) {
      console.error(`Failed to open web search: ${error.message}`);
      return res.status(500).json({
        success: false,
        error: `Failed to open web search: ${error.message}`,
      });
    }
  } catch (error) {
    console.error("Error searching web:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint to perform calculations
app.post("/calculate", async (req, res) => {
  try {
    const { expression } = req.body;

    if (!expression || typeof expression !== "string") {
      return res
        .status(400)
        .json({ success: false, error: "Expression is required" });
    }

    // Sanitize expression - only allow numbers, operators, parentheses, and spaces
    const sanitized = expression.trim().replace(/[^0-9+\-*/().\s]/g, "");

    if (!sanitized) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid expression" });
    }

    try {
      // Use PowerShell to safely evaluate the expression
      const psCommand = `[math]::Round((${sanitized}), 10)`;
      const { stdout } = await execAsync(
        `powershell.exe -Command "Write-Output ${psCommand}"`,
        { shell: "cmd.exe", maxBuffer: 1024 }
      );

      const result = stdout.trim();
      console.log(`✓ Calculated: ${sanitized} = ${result}`);
      return res.json({
        success: true,
        result: result,
        expression: sanitized,
        message: `${sanitized} = ${result}`,
        action: { type: "calculate", expression: sanitized, result },
      });
    } catch (error) {
      // If PowerShell fails, try JavaScript eval (less safe but more flexible)
      try {
        // Only allow safe math operations
        const safeExpression = sanitized.replace(/[^0-9+\-*/().\s]/g, "");
        const result = Function(`"use strict"; return (${safeExpression})`)();
        console.log(`✓ Calculated (JS): ${sanitized} = ${result}`);
        return res.json({
          success: true,
          result: String(result),
          expression: sanitized,
          message: `${sanitized} = ${result}`,
          action: {
            type: "calculate",
            expression: sanitized,
            result: String(result),
          },
        });
      } catch (evalError) {
        return res.status(400).json({
          success: false,
          error: `Invalid expression: ${sanitized}`,
        });
      }
    }
  } catch (error) {
    console.error("Error calculating:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "AI Assistant Backend is running",
    geminiConfigured: !!genAI,
  });
});

// Helper function to check if port is in use
function checkPortInUse(port) {
  return new Promise((resolve) => {
    const server = require("http").createServer();
    server.listen(port, () => {
      server.once("close", () => resolve(false));
      server.close();
    });
    server.on("error", () => resolve(true));
  });
}

// Start the server
let server;
async function startServer() {
  try {
    // Check if port is already in use
    const portInUse = await checkPortInUse(PORT);
    if (portInUse) {
      console.warn(
        `⚠ Port ${PORT} is already in use. Checking if it's our server...`
      );
      // Try to make a health check request to see if our server is already running
      try {
        const http = require("http");
        const healthCheck = await new Promise((resolve) => {
          const req = http.get(
            `http://localhost:${PORT}/health`,
            { timeout: 2000 },
            (res) => {
              let data = "";
              res.on("data", (chunk) => (data += chunk));
              res.on("end", () => {
                try {
                  const result = JSON.parse(data);
                  resolve(result.status === "ok");
                } catch {
                  resolve(res.statusCode === 200);
                }
              });
            }
          );
          req.on("error", () => resolve(false));
          req.on("timeout", () => {
            req.destroy();
            resolve(false);
          });
        });

        if (healthCheck) {
          console.log(
            `✓ Backend server is already running on port ${PORT}. Using existing instance.`
          );
          // Keep process alive by monitoring the existing server
          const keepAlive = setInterval(() => {
            const http = require("http");
            const req = http.get(`http://localhost:${PORT}/health`, { timeout: 1000 }, () => {});
            req.on("error", () => {
              // If health check fails, exit so we can restart
              clearInterval(keepAlive);
              process.exit(1);
            });
          }, 30000); // Check every 30 seconds
          
          // Create a dummy server to keep the process alive
          // This ensures the process doesn't exit when startServer returns null
          const dummyServer = require("http").createServer(() => {});
          dummyServer.listen(0, "127.0.0.1", () => {
            console.log("Process monitor active - keeping backend process alive");
          });
          
          // Prevent process from exiting - keep event loop alive
          process.stdin.resume();
          
          // Keep event loop alive with a periodic check
          const keepAliveInterval = setInterval(() => {
            // This keeps the event loop active
          }, 10000);
          
          // Store interval reference to prevent garbage collection
          if (typeof global !== "undefined") {
            global.keepAliveInterval = keepAliveInterval;
            global.dummyServer = dummyServer;
          }
          
          return null; // Return null to indicate server already exists
        } else {
          console.error(
            `✗ Port ${PORT} is in use by another application. Please stop it or change the port.`
          );
          console.error(
            `You can find and kill the process with: netstat -ano | findstr :${PORT}`
          );
          process.exit(1);
        }
      } catch (error) {
        console.error(
          `✗ Port ${PORT} is in use. Please stop the process using it or change the port.`
        );
        console.error(`Error checking existing server: ${error.message}`);
        process.exit(1);
      }
    }

    return new Promise((resolve, reject) => {
      server = app.listen(PORT, async () => {
        console.log(
          `AI Assistant Backend server running on http://localhost:${PORT}`
        );
        console.log(
          `POST endpoint available at http://localhost:${PORT}/prompt`
        );
        if (model) {
          console.log("✓ Gemini AI configured and ready");
        } else {
          console.log("⚠ Gemini AI not configured (set GEMINI_API_KEY)");
        }

        // Reload preferences from file to ensure we have the latest
        userPreferences = loadPreferencesFromFile();
        console.log("✓ Preferences loaded:", {
          ide: userPreferences.ide,
          defaultPort: userPreferences.defaultPort,
          projectsCount: userPreferences.projects?.length || 0,
        });

        // Preload apps in the background for instant search
        console.log("Loading installed apps...");
        preloadApps()
          .then(() => {
            console.log("✓ Apps preloaded successfully");
          })
          .catch((error) => {
            console.warn("Failed to preload apps:", error.message);
            if (error.stack) {
              console.warn("Stack:", error.stack);
            }
          });

        // Explicitly keep the process alive
        console.log("Server is listening and ready to handle requests");

        // Set up event listeners
        server.on("error", (error) => {
          if (error.code === "EADDRINUSE") {
            console.error(
              `✗ Port ${PORT} is already in use. Another instance may be running.`
            );
            console.error(
              `You can find and kill the process with: netstat -ano | findstr :${PORT}`
            );
            process.exit(1);
          } else {
            console.error("Server error:", error);
            console.error("Stack:", error.stack);
          }
        });

        server.on("close", () => {
          console.log("Server closed");
        });

        server.on("listening", () => {
          console.log(`✓ Server is listening on port ${PORT}`);
        });

        // Keep reference to server to prevent garbage collection
        if (typeof global !== "undefined") {
          global.server = server;
          global.app = app;
        }

        resolve(server);
      });

      server.on("error", (error) => {
        if (error.code === "EADDRINUSE") {
          console.error(
            `✗ Port ${PORT} is already in use. Please stop the process using it or change the port.`
          );
          console.error(
            `You can find and kill the process with: netstat -ano | findstr :${PORT}`
          );
          reject(error);
        } else {
          reject(error);
        }
      });
    });
  } catch (error) {
    if (error.code === "EADDRINUSE") {
      console.error(
        `✗ Port ${PORT} is already in use. Please stop the process using it or change the port.`
      );
      console.error(
        `You can find and kill the process with: netstat -ano | findstr :${PORT}`
      );
      process.exit(1);
    } else {
      console.error("Failed to start server:", error);
      throw error;
    }
  }
}

console.log("=== Setting up keep-alive interval ===");
// Explicit keep-alive - prevent Node.js from exiting
// The Express server should keep the event loop alive, but this is a safety measure
const keepAliveInterval = setInterval(() => {
  // This interval keeps the event loop alive
  // It's a no-op but prevents the process from exiting
}, 10000);

// Store interval reference to prevent garbage collection
if (typeof global !== "undefined") {
  global.keepAliveInterval = keepAliveInterval;
}

console.log("=== Calling startServer() ===");
startServer()
  .then((server) => {
    console.log("=== startServer() promise resolved ===");
    if (server === null) {
      // Server already exists, process will be kept alive by the dummy server
      console.log("Using existing server instance - process will stay alive");
    } else {
      // New server started successfully
      console.log("Backend server started successfully");
    }
  })
  .catch((error) => {
    console.error("=== startServer() promise rejected ===");
    console.error("Failed to start server:", error);
    console.error("Error stack:", error.stack);
    process.exit(1);
  });

console.log("=== Script initialization complete, waiting for server ===");
