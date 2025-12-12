import React, { useState, useRef, useEffect, useCallback } from "react";
import "./App.css";
import naviLogo from "./assets/logo.png";
import naviLogoMinimal from "./assets/logo_1.png";

declare global {
  interface Window {
    electronAPI?: {
      windowMinimize: () => Promise<void>;
      windowMaximize: () => Promise<void>;
      windowClose: () => Promise<void>;
      getPreferences: () => Promise<any>;
      savePreferences: (preferences: any) => Promise<{ success: boolean }>;
      setWindowMode: (mode: "minimal" | "full") => Promise<void>;
      toggleWindowVisibility: () => Promise<void>;
      getWindowMode: () => Promise<"minimal" | "full">;
      setWindowHeight: (height: number) => Promise<void>;
      resetWindowMaxHeight: () => Promise<void>;
      onWindowModeChanged: (
        callback: (mode: "minimal" | "full") => void
      ) => void;
      onFocusInput: (callback: () => void) => void;
    };
  }
}

interface HistoryItem {
  prompt: string;
  output: string;
}

interface Suggestion {
  name: string;
  path: string;
  score: number;
  isUWP?: boolean;
  workingDirectory?: string;
  arguments?: string;
}

interface SmartSuggestion {
  text: string;
  description: string;
  type: "search" | "calculate" | "dev" | "open" | "command" | "path";
  action?: any;
}

interface Project {
  nickname: string;
  filepath: string;
  startCommand: string;
  port?: string;
}

interface Preferences {
  ide: string;
  defaultPort: string;
  projects: Project[];
}

type ActiveView = "prompt" | "tools" | "logs" | "settings";

const fetchWithTimeout = async (
  url: string,
  options: RequestInit = {},
  timeout = 30000
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeout / 1000} seconds`);
    }
    throw error;
  }
};

// Helper function to highlight matching text in suggestions
const highlightMatch = (text: string, query: string): React.ReactNode => {
  if (!query || !text) return text;
  
  const queryLower = query.toLowerCase().trim();
  const textLower = text.toLowerCase();
  
  // Try exact substring match first (most common case)
  const exactIndex = textLower.indexOf(queryLower);
  if (exactIndex !== -1) {
    const parts: React.ReactNode[] = [];
    if (exactIndex > 0) {
      parts.push(text.substring(0, exactIndex));
    }
    parts.push(
      <mark key="match" className="highlight-match">
        {text.substring(exactIndex, exactIndex + query.length)}
      </mark>
    );
    if (exactIndex + query.length < text.length) {
      parts.push(text.substring(exactIndex + query.length));
    }
    return <>{parts}</>;
  }
  
  // Try word-based matching - highlight words that contain query
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 0);
  if (queryWords.length === 0) return text;
  
  const textWords = text.split(/(\s+)/); // Split but keep spaces
  const result: React.ReactNode[] = [];
  
  for (let i = 0; i < textWords.length; i++) {
    const segment = textWords[i];
    if (!segment.trim()) {
      // Preserve spaces
      result.push(segment);
      continue;
    }
    
    const segmentLower = segment.toLowerCase();
    let matched = false;
    
    for (const qWord of queryWords) {
      if (segmentLower.includes(qWord)) {
        const matchIndex = segmentLower.indexOf(qWord);
        if (matchIndex !== -1) {
          result.push(segment.substring(0, matchIndex));
          result.push(
            <mark key={`${i}-${matchIndex}`} className="highlight-match">
              {segment.substring(matchIndex, matchIndex + qWord.length)}
            </mark>
          );
          result.push(segment.substring(matchIndex + qWord.length));
          matched = true;
          break;
        }
      }
    }
    
    if (!matched) {
      result.push(segment);
    }
  }
  
  return result.length > 0 ? <>{result}</> : text;
};

const App = () => {
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeView, setActiveView] = useState<ActiveView>("prompt");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsScrollRef = useRef<HTMLDivElement>(null);
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const [smartSuggestions, setSmartSuggestions] = useState<SmartSuggestion[]>(
    []
  );
  const [showSmartSuggestions, setShowSmartSuggestions] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [confirmationData, setConfirmationData] = useState<{
    confirmationId: string;
    message: string;
    path: string;
    type: string;
    appName?: string;
  } | null>(null);
  const [windowMode, setWindowMode] = useState<"minimal" | "full">("minimal");
  const [preferences, setPreferences] = useState<Preferences>({
    ide: "code",
    defaultPort: "3000",
    projects: [],
  });
  const [, setPreferencesLoaded] = useState(false);
  const [cachedRunningApps, setCachedRunningApps] = useState<any[]>([]);
  const runningAppsCacheTime = useRef<number>(0);
  const isExecutingRef = useRef<boolean>(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        if (window.electronAPI?.getPreferences) {
          const saved = await window.electronAPI.getPreferences();
          if (saved) {
            const projects = saved.projects || [];
            if (
              saved.pathNicknames &&
              saved.pathNicknames.length > 0 &&
              projects.length === 0
            ) {
              projects.push(
                ...saved.pathNicknames.map((pn: any) => ({
                  nickname: pn.nickname,
                  filepath: pn.path,
                  startCommand: saved.devServerCommand || "npm run dev",
                }))
              );
            }

            setPreferences({
              ide: saved.ide || "code",
              defaultPort: saved.defaultPort || "3000",
              projects: projects,
            });
          }
        }
      } catch (error) {
        console.error("Error loading preferences:", error);
      } finally {
        setPreferencesLoaded(true);
      }
    };
    loadPreferences();
  }, []);

  const savePreferences = async (
    newPreferences: Preferences,
    immediate: boolean = false,
    filterEmpty: boolean = true
  ) => {
    try {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      const doSave = async () => {
        const cleanedPreferences = filterEmpty
          ? {
              ...newPreferences,
              projects: newPreferences.projects.filter(
                (item) => item.nickname.trim() && item.filepath.trim()
              ),
            }
          : newPreferences;

        if (window.electronAPI?.savePreferences) {
          await window.electronAPI.savePreferences(cleanedPreferences);
        }

        if (
          filterEmpty &&
          cleanedPreferences.projects.length !== newPreferences.projects.length
        ) {
          setPreferences(cleanedPreferences);
        }

        try {
          await fetch("http://localhost:3000/preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cleanedPreferences),
          });
        } catch (error) {
          console.warn("Failed to sync preferences to backend:", error);
        }
      };

      if (immediate) {
        await doSave();
      } else {
        saveTimeoutRef.current = setTimeout(() => doSave(), 500);
      }
    } catch (error) {
      console.error("Error saving preferences:", error);
      alert("Failed to save preferences");
    }
  };

  const detectIntent = useCallback(
    (
      input: string
    ): {
      type:
        | "path"
        | "app"
        | "calculate"
        | "search"
        | "chat"
        | "quit"
        | "switch"
        | "recent"
        | "url"
        | "unknown";
      value: string;
      confidence: number;
    } => {
      const trimmed = input.trim();
      const lower = trimmed.toLowerCase();

      // Check for quit command
      if (lower === "quit" || lower.startsWith("quit ")) {
        return {
          type: "quit",
          value: trimmed.replace(/^quit\s*/i, "").trim(),
          confidence: 1.0,
        };
      }

      if (
        lower === "sw" ||
        lower.startsWith("sw ") ||
        lower === "switch" ||
        lower.startsWith("switch ") ||
        lower === "focus" ||
        lower.startsWith("focus ")
      ) {
        return {
          type: "switch",
          value: trimmed.replace(/^(sw|switch|focus)\s*/i, "").trim(),
          confidence: 1.0,
        };
      }

      if (
        lower === "recent" ||
        lower.startsWith("recent ") ||
        lower === "recent files" ||
        lower === "recent folders"
      ) {
        return {
          type: "recent",
          value: trimmed.replace(/^recent\s*/i, "").trim(),
          confidence: 1.0,
        };
      }

      const urlPattern =
        /^(https?:\/\/|localhost|www\.|[a-z0-9-]+\.(com|net|org|io|dev|co|edu|gov|mil|int|app|xyz|tech|online|site|website|store|shop|blog|info|biz|tv|me|us|uk|ca|au|de|fr|jp|cn|in|br|ru|kr|es|it|nl|se|no|dk|fi|pl|cz|hu|ro|gr|pt|ie|nz|za|mx|ar|cl|co|pe|ve|ec|uy|py|bo|cr|pa|gt|hn|ni|sv|bz|jm|tt|bb|gd|lc|vc|ag|dm|kn|bs|sr|gy|gf|fk|ai|vg|ky|bm|tc|ms|aw|cw|sx|bq|mf|bl|pm|wf|pf|nc|vu|fj|pg|sb|ki|tv|nr|pw|fm|mh|as|gu|mp|vi|pr|do|ht|cu|jm|bs|bb|gd|lc|vc|ag|dm|kn|ai|vg|ky|bm|tc|ms|aw|cw|sx|bq|mf|bl|pm|wf|pf|nc|vu|fj|pg|sb|ki|nr|pw|fm|mh|as|gu|mp|vi|pr|do|ht|cu))/i;
      if (
        urlPattern.test(trimmed) ||
        trimmed.includes("://") ||
        /^localhost(:\d+)?/.test(trimmed)
      ) {
        return {
          type: "url",
          value: trimmed,
          confidence: 0.95,
        };
      }

      if (lower.startsWith("/chat") || lower.startsWith("/ai")) {
        return {
          type: "chat",
          value: trimmed.replace(/^\/chat\s*/i, "").trim(),
          confidence: 1.0,
        };
      }

      const pathPattern = /^([A-Za-z]:[\\\/]|\\\\|\.\.?[\\\/]|[\\\/])/;
      if (
        pathPattern.test(trimmed) ||
        trimmed.includes("\\") ||
        trimmed.includes("/")
      ) {
        if (
          trimmed.length > 2 &&
          (trimmed.includes("\\") || trimmed.includes("/"))
        ) {
          return {
            type: "path",
            value: trimmed,
            confidence: 0.9,
          };
        }
      }

      const mathPattern = /^[\d+\-*/().\s]+$/;
      const hasMathOps = /[\+\-\*\/\(\)]/.test(trimmed);
      if (mathPattern.test(trimmed) || (hasMathOps && /[\d]/.test(trimmed))) {
        return {
          type: "calculate",
          value: trimmed,
          confidence: 0.85,
        };
      }

      // Default to app search if it starts with open/launch/start
      if (
        lower.startsWith("open ") ||
        lower.startsWith("launch ") ||
        lower.startsWith("start ")
      ) {
        const appName = trimmed.replace(/^(open|launch|start)\s+/i, "").trim();
        if (appName.length > 0) {
          return {
            type: "app",
            value: appName,
            confidence: 0.9,
          };
        }
      }

      // Prioritize app search for most queries
      // Only classify as web search for very long queries or explicit search patterns
      const isLongQuery = trimmed.length > 50;
      const hasSearchKeywords = /\b(search|find|lookup|google|bing)\b/i.test(trimmed);
      
      if (isLongQuery && hasSearchKeywords) {
        return {
          type: "search",
          value: trimmed,
          confidence: 0.7,
        };
      }

      // Default to app search for short-medium queries
      // This allows app suggestions to show for most inputs
      if (trimmed.length <= 50) {
        return {
          type: "app",
          value: trimmed,
          confidence: 0.6,
        };
      }

      // For very long queries without search keywords, still default to app but with lower confidence
      return {
        type: "app",
        value: trimmed,
        confidence: 0.4,
      };
    },
    []
  );

  // Generate intelligent suggestions based on detected intent
  useEffect(() => {
    // Don't show smart suggestions if app suggestions are showing
    if (showSuggestions) {
      setSmartSuggestions([]);
      setShowSmartSuggestions(false);
      return;
    }

    if (!prompt.trim()) {
      setSmartSuggestions([]);
      setShowSmartSuggestions(false);
      return;
    }

    const intent = detectIntent(prompt);
    const suggestions: SmartSuggestion[] = [];

    switch (intent.type) {
      case "path":
        suggestions.push({
          text: `Open: ${intent.value}`,
          description: "Open file or folder",
          type: "path",
          action: { path: intent.value },
        });
        break;

      case "calculate":
        suggestions.push({
          text: `Calculate: ${intent.value}`,
          description: "Perform calculation",
          type: "calculate",
          action: { expression: intent.value },
        });
        break;

      case "search":
        suggestions.push({
          text: `Search: ${intent.value}`,
          description: "Search the web",
          type: "search",
          action: { query: intent.value },
        });
        break;

      case "app":
        break;

      case "chat":
        suggestions.push({
          text: `Chat: ${intent.value || "Ask Navi anything"}`,
          description: "AI Assistant",
          type: "command",
          action: { prompt: intent.value },
        });
        break;
    }

    if (suggestions.length > 0) {
      setSmartSuggestions(suggestions);
      setShowSmartSuggestions(true);
    } else {
      setSmartSuggestions([]);
      setShowSmartSuggestions(false);
    }
  }, [prompt, detectIntent, showSuggestions]);

  // System command suggestions (defined outside useEffect to avoid dependency issues)
  const systemCommands: Array<{
    name: string;
    display: string;
    action: string;
  }> = [
    { name: "restart", display: "Restart Computer", action: "restart" },
    { name: "shutdown", display: "Shutdown Computer", action: "shutdown" },
    { name: "sleep", display: "Sleep", action: "sleep" },
    { name: "hibernate", display: "Hibernate", action: "hibernate" },
    { name: "lock", display: "Lock Screen", action: "lock" },
    { name: "signout", display: "Sign Out", action: "signout" },
  ];

  useEffect(() => {
    // Don't run if we're executing a command
    if (isExecutingRef.current) {
      return;
    }

    if (!prompt.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const intent = detectIntent(prompt);

    if (intent.type === "quit") {
      const searchTerm = intent.value.toLowerCase().trim();
      const timeoutId = setTimeout(async () => {
        try {
          const response = await fetch("http://localhost:3000/running-apps");
          const data = await response.json();

          if (data.success && data.apps && data.apps.length > 0) {
            let filteredApps = data.apps;
            if (searchTerm) {
              filteredApps = data.apps.filter((app: any) =>
                app.name.toLowerCase().includes(searchTerm)
              );
            }

            if (searchTerm) {
              filteredApps.sort((a: any, b: any) => {
                const aName = a.name.toLowerCase();
                const bName = b.name.toLowerCase();
                if (aName === searchTerm) return -1;
                if (bName === searchTerm) return 1;
                if (aName.startsWith(searchTerm)) return -1;
                if (bName.startsWith(searchTerm)) return 1;
                return aName.localeCompare(bName);
              });
            } else {
              filteredApps.sort((a: any, b: any) => {
                return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
              });
            }

            if (filteredApps.length > 0) {
              const quitSuggestions: Suggestion[] = filteredApps.map(
                (app: any) => ({
                  name: `quit ${app.name}`,
                  path: app.name,
                  score: 1.0,
                })
              );
              setSuggestions(quitSuggestions);
              setShowSuggestions(true);
              setSelectedSuggestionIndex(0);
            } else {
              setSuggestions([]);
              setShowSuggestions(false);
            }
          } else {
            setSuggestions([]);
            setShowSuggestions(false);
          }
        } catch (error) {
          console.error("Error fetching running apps:", error);
          setSuggestions([]);
          setShowSuggestions(false);
        }
      }, 50);

      return () => clearTimeout(timeoutId);
    }

    if (intent.type === "switch") {
      const searchTerm = intent.value.toLowerCase().trim();
      
      // Use cached apps if available and fresh (less than 2 seconds old)
      const useCache = cachedRunningApps.length > 0 && (Date.now() - runningAppsCacheTime.current < 2000);
      
      const filterAndDisplayApps = (apps: any[]) => {
        let filteredApps = apps;
        if (searchTerm) {
          filteredApps = apps.filter((app: any) =>
            app.name.toLowerCase().includes(searchTerm)
          );
        }

        // Sort by relevance (exact matches first, then partial matches)
        if (searchTerm) {
          filteredApps.sort((a: any, b: any) => {
            const aName = a.name.toLowerCase();
            const bName = b.name.toLowerCase();

            // Exact match gets highest priority
            if (aName === searchTerm) return -1;
            if (bName === searchTerm) return 1;

            // Starts with search term gets next priority
            if (aName.startsWith(searchTerm)) return -1;
            if (bName.startsWith(searchTerm)) return 1;

            // Otherwise alphabetical
            return aName.localeCompare(bName);
          });
        } else {
          // When no search term, just sort alphabetically
          filteredApps.sort((a: any, b: any) => {
            return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
          });
        }

        if (filteredApps.length > 0) {
          // Format suggestions as "Switch to x" where x is the app name
          const switchSuggestions: Suggestion[] = filteredApps.map(
            (app: any) => ({
              name: `Switch to ${app.name}`,
              path: app.name, // Store the actual app name in path for execution
              score: 1.0,
            })
          );
          setSuggestions(switchSuggestions);
          setShowSuggestions(true);
          setSelectedSuggestionIndex(0);
        } else {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      };

      if (useCache) {
        // Filter cached apps immediately - no delay
        filterAndDisplayApps(cachedRunningApps);
      } else {
        // Fetch immediately for faster detection
        (async () => {
          try {
            const response = await fetch("http://localhost:3000/running-apps");
            const data = await response.json();

            if (data.success && data.apps && data.apps.length > 0) {
              // Cache the apps
              setCachedRunningApps(data.apps);
              runningAppsCacheTime.current = Date.now();
              
              // Filter and display
              filterAndDisplayApps(data.apps);
            } else {
              setSuggestions([]);
              setShowSuggestions(false);
            }
          } catch (error) {
            console.error("Error fetching running apps:", error);
            setSuggestions([]);
            setShowSuggestions(false);
          }
        })();
      }
      
      // Early return to prevent general app search from running
      return;
    }

    if (intent.type === "recent") {
      const searchTerm = intent.value.toLowerCase().trim();
      const typeFilter = searchTerm.includes("folder")
        ? "folders"
        : searchTerm.includes("file")
          ? "files"
          : undefined;

      const timeoutId = setTimeout(async () => {
        try {
          const url = typeFilter
            ? `http://localhost:3000/recent-files?type=${typeFilter}`
            : "http://localhost:3000/recent-files";
          const response = await fetch(url);
          const data = await response.json();

          if (data.success && data.items && data.items.length > 0) {
            let filteredItems = data.items;
            if (
              searchTerm &&
              !searchTerm.includes("folder") &&
              !searchTerm.includes("file")
            ) {
              filteredItems = data.items.filter((item: any) =>
                item.Name.toLowerCase().includes(searchTerm)
              );
            }

            if (filteredItems.length > 0) {
              const recentSuggestions: Suggestion[] = filteredItems.map(
                (item: any) => ({
                  name: item.IsFolder ? `📁 ${item.Name}` : `📄 ${item.Name}`,
                  path: item.Path,
                  score: 1.0,
                })
              );
              setSuggestions(recentSuggestions);
              setShowSuggestions(true);
              setSelectedSuggestionIndex(0);
            } else {
              setSuggestions([]);
              setShowSuggestions(false);
            }
          } else {
            setSuggestions([]);
            setShowSuggestions(false);
          }
        } catch (error) {
          console.error("Error fetching recent files:", error);
          setSuggestions([]);
          setShowSuggestions(false);
        }
      }, 50);

      return () => clearTimeout(timeoutId);
    }

    const searchTermLower = prompt.toLowerCase().trim();
    const matchesSystemCommand = systemCommands.some(
      (cmd) =>
        cmd.name.toLowerCase() === searchTermLower ||
        cmd.display.toLowerCase().includes(searchTermLower) ||
        searchTermLower.includes(cmd.name.toLowerCase())
    );

    // Only block app suggestions for high-confidence non-app intents (URL, path, calculation)
    // Allow app suggestions for everything else (including search, unknown, etc.)
    const shouldBlockAppSuggestions = 
      (intent.type === "url" && intent.confidence >= 0.9) ||
      (intent.type === "path" && intent.confidence >= 0.9) ||
      (intent.type === "calculate" && intent.confidence >= 0.85);

    if (shouldBlockAppSuggestions && !matchesSystemCommand) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    // Use the prompt directly for app search, or extract app name from intent
    const appName = intent.type === "app" ? intent.value : prompt.trim();

    const filteredSystemCommands = systemCommands.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(searchTermLower) ||
        cmd.display.toLowerCase().includes(searchTermLower)
    );

    const timeoutId = setTimeout(async () => {
      try {
        const response = await fetch(
          `http://localhost:3000/search-apps?q=${encodeURIComponent(appName)}`
        );
        const data = await response.json();

        // Combine app suggestions with system command suggestions
        const appSuggestions = data.suggestions || [];
        const systemSuggestions: Suggestion[] = filteredSystemCommands.map(
          (cmd) => ({
            name: cmd.display,
            path: `system:${cmd.action}`,
            score: 1.0,
          })
        );

        systemSuggestions.sort((a, b) => {
          const aName = a.name.toLowerCase();
          const bName = b.name.toLowerCase();
          if (aName === searchTermLower) return -1;
          if (bName === searchTermLower) return 1;
          if (aName.startsWith(searchTermLower)) return -1;
          if (bName.startsWith(searchTermLower)) return 1;
          return aName.localeCompare(bName);
        });

        const allSuggestions = [...systemSuggestions, ...appSuggestions];

        if (allSuggestions.length > 0) {
          setSuggestions(allSuggestions);
          setShowSuggestions(true);
          setSelectedSuggestionIndex(0);
        } else {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      } catch (error) {
        console.error("Error fetching suggestions:", error);
        if (filteredSystemCommands.length > 0) {
          const systemSuggestions: Suggestion[] = filteredSystemCommands.map(
            (cmd) => ({
              name: cmd.display,
              path: `system:${cmd.action}`,
              score: 1.0,
            })
          );
          setSuggestions(systemSuggestions);
          setShowSuggestions(true);
          setSelectedSuggestionIndex(0);
        } else {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      }
    }, 15);

    return () => clearTimeout(timeoutId);
  }, [prompt, detectIntent]);

  const inputRef = useRef<HTMLInputElement>(null);
  const [suggestionsPosition, setSuggestionsPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // Expand window when suggestions appear in minimal mode
  useEffect(() => {
    if (
      windowMode === "minimal" &&
      (showSuggestions || showSmartSuggestions) &&
      inputContainerRef.current
    ) {
      // Expand window height to accommodate suggestions (max 300px for suggestions + 8px spacing + 64px input)
      const suggestionsHeight = Math.min(
        300,
        (showSuggestions ? suggestions.length : smartSuggestions.length) * 44
      );
      const newHeight = 64 + 8 + suggestionsHeight;

      // Expand the window to accommodate suggestions
      if (window.electronAPI?.setWindowHeight) {
        window.electronAPI.setWindowHeight(newHeight);
      }

      return () => {
        // Reset window height when suggestions disappear
        if (window.electronAPI?.setWindowHeight) {
          window.electronAPI.setWindowHeight(64);
        }
        // Reset maxHeight back to 64
        if (window.electronAPI?.resetWindowMaxHeight) {
          window.electronAPI.resetWindowMaxHeight();
        }
      };
    } else {
      setSuggestionsPosition(null);
      // Reset window height when not in minimal mode or no suggestions
      if (windowMode === "minimal" && window.electronAPI?.setWindowHeight) {
        window.electronAPI.setWindowHeight(64);
        if (window.electronAPI?.resetWindowMaxHeight) {
          window.electronAPI.resetWindowMaxHeight();
        }
      }
    }
  }, [
    windowMode,
    showSuggestions,
    showSmartSuggestions,
    suggestions.length,
    smartSuggestions.length,
  ]);

  const handleExecute = useCallback(
    async (selectedApp?: Suggestion) => {
      if (showSuggestions && suggestions.length > 0) {
        const selected = selectedApp || suggestions[selectedSuggestionIndex];
        const intent = detectIntent(selected.name);

        if (selected.path && selected.path.startsWith("system:")) {
          const action = selected.path.replace("system:", "");
          try {
            setPrompt("");
            setShowSuggestions(false);
            setSuggestions([]);
            setIsLoading(true);
            setOutput(`Executing ${selected.name}...`);

            const response = await fetch("http://localhost:3000/prompt", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ prompt: action }),
            });

            const data = await response.json();

            if (data.success) {
              setOutput(
                data.message || `Executed ${selected.name} successfully`
              );
              // Hide window after system command (basic task)
              if (windowMode === "minimal") {
                setTimeout(() => {
                  if (window.electronAPI?.toggleWindowVisibility) {
                    window.electronAPI.toggleWindowVisibility();
                  }
                }, 500);
              }
            } else {
              setOutput(data.error || `Failed to execute ${selected.name}`);
            }
          } catch (error: any) {
            setOutput(`Error: ${error.message}`);
          } finally {
            setIsLoading(false);
          }
          return;
        }

        // Handle switch/focus command
        if (
          intent.type === "switch" ||
          selected.name.startsWith("Switch to ")
        ) {
          const appName = selected.path; // The actual app name is stored in path
          // Hide suggestions and window immediately
          setShowSuggestions(false);
          setSuggestions([]);
          setPrompt("");
          if (windowMode === "minimal" && window.electronAPI?.toggleWindowVisibility) {
            // Hide window immediately
            window.electronAPI.toggleWindowVisibility();
          }
          try {
            setIsLoading(true);
            setOutput(`Switching to ${appName}...`);

            const response = await fetch("http://localhost:3000/focus-app", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ appName }),
            });

            const data = await response.json();

            if (data.success) {
              setOutput(data.message || `Switched to ${appName}`);
            } else {
              setOutput(data.error || `Failed to switch to ${appName}`);
            }
          } catch (error: any) {
            setOutput(`Error: ${error.message}`);
          } finally {
            setIsLoading(false);
            setTimeout(() => {
              isExecutingRef.current = false;
            }, 100);
          }
          return;
        }

        if (intent.type === "quit" || selected.name.startsWith("quit ")) {
          const appName = selected.path;
          try {
            setPrompt("");
            setShowSuggestions(false);
            setSuggestions([]);
            setIsLoading(true);
            setOutput(`Quitting ${appName}...`);

            const response = await fetch("http://localhost:3000/quit-app", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ appName }),
            });

            const data = await response.json();

            if (data.success) {
              setOutput(data.message || `Quit ${appName} successfully`);
              if (windowMode === "minimal") {
                setTimeout(() => {
                  if (window.electronAPI?.toggleWindowVisibility) {
                    window.electronAPI.toggleWindowVisibility();
                  }
                }, 500);
              }
            } else {
              setOutput(data.error || `Failed to quit ${appName}`);
            }
          } catch (error: any) {
            setOutput(`Error: ${error.message}`);
          } finally {
            setIsLoading(false);
          }
          return;
        }

        if (
          selected.name.startsWith("📁") ||
          selected.name.startsWith("📄") ||
          intent.type === "recent"
        ) {
          const filePath = selected.path;
          try {
            setPrompt("");
            setShowSuggestions(false);
            setSuggestions([]);
            setIsLoading(true);
            setOutput(`Opening ${selected.name.replace(/^[📁📄]\s*/, "")}...`);

            const response = await fetch("http://localhost:3000/open-path", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ path: filePath }),
            });

            const data = await response.json();

            if (data.success) {
              setOutput(
                data.message ||
                  `Opened ${selected.name.replace(
                    /^[📁📄]\s*/,
                    ""
                  )} successfully`
              );
              // Hide window after opening file/folder (basic task)
              if (windowMode === "minimal") {
                setTimeout(() => {
                  if (window.electronAPI?.toggleWindowVisibility) {
                    window.electronAPI.toggleWindowVisibility();
                  }
                }, 500);
              }
            } else {
              setOutput(
                data.error ||
                  `Failed to open ${selected.name.replace(/^[📁📄]\s*/, "")}`
              );
            }
          } catch (error: any) {
            setOutput(`Error: ${error.message}`);
          } finally {
            setIsLoading(false);
          }
          return;
        }

        const appToOpen = selected;
        try {
          setPrompt("");
          setShowSuggestions(false);
          setSuggestions([]);
          setIsLoading(true);
          setOutput(`Opening ${appToOpen.name}...`);

          const requestBody = {
            appName: appToOpen.name,
            appPath: appToOpen.path || "",
            isUWP: appToOpen.isUWP || false,
            workingDirectory: appToOpen.workingDirectory || "",
            arguments: appToOpen.arguments || "",
          };

          const response = await fetch("http://localhost:3000/open-app", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          });

          const data = await response.json();

          if (data.success) {
            setOutput(data.message || `Opened ${appToOpen.name} successfully`);
            if (windowMode === "minimal") {
              setTimeout(() => {
                if (window.electronAPI?.toggleWindowVisibility) {
                  window.electronAPI.toggleWindowVisibility();
                }
              }, 500);
            }
          } else {
            setOutput(data.error || "Failed to open app");
          }
        } catch (error: any) {
          setOutput(`Error: ${error.message}`);
        } finally {
          setIsLoading(false);
        }
        return;
      }

      if (!prompt.trim()) return;

      const currentPrompt = prompt;
      const intent = detectIntent(currentPrompt);

      // Set executing flag to prevent useEffect from running
      isExecutingRef.current = true;
      setPrompt("");
      setShowSuggestions(false);
      setSuggestions([]);
      setShowSmartSuggestions(false);
      setSmartSuggestions([]);
      setIsLoading(true);
      setOutput("");

      try {
        let data: any;
        let endpoint = "";
        let requestBody: any = {};

        // Route to appropriate endpoint based on intent
        switch (intent.type) {
          case "chat":
            // Use AI for /chat commands - expand to full window
            if (window.electronAPI?.setWindowMode) {
              window.electronAPI.setWindowMode("full");
            }
            endpoint = "/prompt";
            requestBody = { prompt: intent.value || currentPrompt };
            break;

          case "path":
            endpoint = "/open-path";
            requestBody = { path: intent.value };
            break;

          case "calculate":
            endpoint = "/calculate";
            requestBody = { expression: intent.value };
            break;

          case "search":
            endpoint = "/search-web";
            requestBody = { query: intent.value };
            break;

          case "quit":
            if (intent.value) {
              endpoint = "/quit-app";
              requestBody = { appName: intent.value };
            } else {
              setShowSuggestions(true);
              setIsLoading(false);
              return;
            }
            break;

          case "switch":
            if (intent.value) {
              // Hide window immediately for switch command
              if (windowMode === "minimal" && window.electronAPI?.toggleWindowVisibility) {
                window.electronAPI.toggleWindowVisibility();
              }
              endpoint = "/focus-app";
              requestBody = { appName: intent.value };
            } else {
              setShowSuggestions(true);
              setIsLoading(false);
              return;
            }
            break;

          case "recent":
            setShowSuggestions(true);
            setIsLoading(false);
            return;

          case "url":
            let url = intent.value.trim();
            if (!url.startsWith("http://") && !url.startsWith("https://")) {
              if (url.startsWith("localhost")) {
                url = "http://" + url;
              } else {
                url = "https://" + url;
              }
            }
            endpoint = "/search-web";
            requestBody = { query: url };
            break;

          case "app":
            try {
              const searchResponse = await fetch(
                `http://localhost:3000/search-apps?q=${encodeURIComponent(
                  intent.value
                )}`
              );
              const searchData = await searchResponse.json();
              if (searchData.suggestions && searchData.suggestions.length > 0) {
                const app = searchData.suggestions[0];
                endpoint = "/open-app";
                requestBody = {
                  appName: app.name,
                  appPath: app.path || "",
                  isUWP: app.isUWP || false,
                  workingDirectory: app.workingDirectory || "",
                  arguments: app.arguments || "",
                };
              } else {
                endpoint = "/open-app";
                requestBody = { appName: intent.value };
              }
            } catch (searchError) {
              endpoint = "/open-app";
              requestBody = { appName: intent.value };
            }
            break;

          default:
            endpoint = "/prompt";
            requestBody = { prompt: currentPrompt };
            break;
        }

        const healthCheck = await fetchWithTimeout(
          "http://localhost:3000/health",
          { method: "GET" },
          5000
        ).catch(() => null);

        if (!healthCheck || !healthCheck.ok) {
          const errorMessage =
            "❌ Backend server is not responding.\n\n" +
            "Possible causes:\n" +
            "• Backend failed to start\n" +
            "• Node.js not found\n" +
            "• Port 3000 is in use\n\n" +
            "Please check the Electron console (View > Toggle Developer Tools) for details.";
          setOutput(errorMessage);
          setIsLoading(false);
          return;
        }

        const response = await fetchWithTimeout(
          `http://localhost:3000${endpoint}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          },
          30000
        );

        if (!response.ok) {
          throw new Error(
            `Backend returned ${response.status}: ${response.statusText}`
          );
        }

        data = await response.json();

        if (data.needsConfirmation && intent.type === "chat") {
          setConfirmationData({
            confirmationId: data.confirmationId,
            message: data.message,
            path: data.path,
            type: data.type,
            appName: data.appName,
          });
          setOutput(data.message);
          return;
        }

        if (intent.type === "chat" && window.electronAPI?.setWindowMode) {
          window.electronAPI.setWindowMode("full");
        }

        if (data.success) {
          const displayText =
            data.message ||
            data.result ||
            data.stdout ||
            data.stderr ||
            "Success";
          setOutput(displayText);

          // Add to history for chat commands
          if (intent.type === "chat") {
            setHistory([
              ...history,
              { prompt: currentPrompt, output: displayText },
            ]);
          }

          // Hide window after basic tasks (non-chat, non-quit, non-switch, non-url)
          // Note: recent and find return early, so they won't reach here
          if (
            intent.type !== "chat" &&
            intent.type !== "quit" &&
            intent.type !== "switch" &&
            intent.type !== "url" &&
            windowMode === "minimal"
          ) {
            setTimeout(() => {
              if (window.electronAPI?.toggleWindowVisibility) {
                window.electronAPI.toggleWindowVisibility();
              }
            }, 500);
          }

          // Hide window after quit or url command (switch is already hidden above)
          if (
            (intent.type === "quit" ||
              intent.type === "url") &&
            windowMode === "minimal"
          ) {
            setTimeout(() => {
              if (window.electronAPI?.toggleWindowVisibility) {
                window.electronAPI.toggleWindowVisibility();
              }
            }, 500);
          }
        } else {
          const errorText = data.error || data.stderr || "Request failed";
          setOutput(errorText);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to connect to backend. The backend server should start automatically with the Electron app.";

        let detailedError = `Error: ${errorMessage}\n\n`;
        if (
          errorMessage.includes("Failed to fetch") ||
          errorMessage.includes("NetworkError")
        ) {
          detailedError += "The backend server may not be running. Please:\n";
          detailedError +=
            "1. Check the Electron console (View > Toggle Developer Tools)\n";
          detailedError += '2. Look for "[Backend]" messages\n';
          detailedError +=
            "3. Ensure backend dependencies are installed: cd backend && npm install\n";
          detailedError += "4. Check if port 3000 is available";
        }

        setOutput(detailedError);
        console.error("Backend connection error:", error);
      } finally {
        setIsLoading(false);
        // Reset executing flag after a short delay to allow window to hide
        setTimeout(() => {
          isExecutingRef.current = false;
        }, 100);
      }
    },
    [
      showSuggestions,
      suggestions,
      selectedSuggestionIndex,
      prompt,
      history,
      detectIntent,
      windowMode,
    ]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Handle Enter key for Settings
      if (e.key === "Enter" && prompt.trim().toLowerCase() === "settings") {
        e.preventDefault();
        if (window.electronAPI?.setWindowMode) {
          window.electronAPI.setWindowMode("full");
        }
        setActiveView("settings");
        setPrompt("");
        return;
      }

      if (showSuggestions && suggestions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedSuggestionIndex((prev) => {
            const newIndex = prev < suggestions.length - 1 ? prev + 1 : prev;
            if (suggestionsScrollRef.current) {
              const itemHeight = 50;
              const containerHeight = suggestionsScrollRef.current.clientHeight;
              const scrollTop = suggestionsScrollRef.current.scrollTop;
              const itemTop = newIndex * itemHeight;
              const itemBottom = itemTop + itemHeight;

              if (itemTop < scrollTop) {
                suggestionsScrollRef.current.scrollTo({
                  top: itemTop,
                  behavior: "smooth",
                });
              } else if (itemBottom > scrollTop + containerHeight) {
                suggestionsScrollRef.current.scrollTo({
                  top: itemBottom - containerHeight,
                  behavior: "smooth",
                });
              }
            }
            return newIndex;
          });
          return;
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedSuggestionIndex((prev) => {
            const newIndex = prev > 0 ? prev - 1 : 0;
            if (suggestionsScrollRef.current) {
              const itemHeight = 50;
              const containerHeight = suggestionsScrollRef.current.clientHeight;
              const scrollTop = suggestionsScrollRef.current.scrollTop;
              const itemTop = newIndex * itemHeight;
              const itemBottom = itemTop + itemHeight;

              if (itemTop < scrollTop) {
                suggestionsScrollRef.current.scrollTo({
                  top: itemTop,
                  behavior: "smooth",
                });
              } else if (itemBottom > scrollTop + containerHeight) {
                suggestionsScrollRef.current.scrollTo({
                  top: itemBottom - containerHeight,
                  behavior: "smooth",
                });
              }
            }
            return newIndex;
          });
          return;
        } else if (e.key === "Escape") {
          e.preventDefault();
          setShowSuggestions(false);
          setSuggestions([]);
          setSelectedSuggestionIndex(0);
          return;
        } else if (e.key === "Enter") {
          e.preventDefault();
          // Hide suggestions immediately to prevent flickering
          const selected = selectedSuggestionIndex >= 0 && selectedSuggestionIndex < suggestions.length
            ? suggestions[selectedSuggestionIndex]
            : null;
          setShowSuggestions(false);
          setSuggestions([]);
          if (selected) {
            handleExecute(selected);
          } else {
            handleExecute();
          }
          return;
        }
      }

      // Handle smart suggestions
      if (
        showSmartSuggestions &&
        smartSuggestions.length > 0 &&
        !showSuggestions
      ) {
        if (e.key === "Enter") {
          e.preventDefault();
          // Execute with the first smart suggestion - just execute normally, detectIntent will handle it
          handleExecute();
          return;
        } else if (e.key === "Escape") {
          e.preventDefault();
          setShowSmartSuggestions(false);
          setSmartSuggestions([]);
          return;
        }
      }

      if (
        e.key === "Enter" &&
        (!showSuggestions || suggestions.length === 0) &&
        (!showSmartSuggestions || smartSuggestions.length === 0)
      ) {
        e.preventDefault();
        handleExecute();
      }
    },
    [
      showSuggestions,
      suggestions,
      selectedSuggestionIndex,
      showSmartSuggestions,
      smartSuggestions,
      handleExecute,
    ]
  );

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await fetch("http://localhost:3000/health");
        if (response.ok) {
          console.log("✓ Backend is ready");
        }
      } catch (error) {
        console.warn("Backend not ready yet:", error);
        setTimeout(checkBackend, 2000);
      }
    };
    setTimeout(checkBackend, 1000);
  }, []);

  // Listen for window mode changes and focus input events
  useEffect(() => {
    if (window.electronAPI?.onWindowModeChanged) {
      window.electronAPI.onWindowModeChanged((mode) => {
        setWindowMode(mode);
      });
    }

    if (window.electronAPI?.onFocusInput) {
      window.electronAPI.onFocusInput(() => {
        inputRef.current?.focus();
      });
    }

    // Get initial window mode
    if (window.electronAPI?.getWindowMode) {
      window.electronAPI.getWindowMode().then((mode) => {
        setWindowMode(mode);
      });
    }
  }, []);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Handle confirmation response
  const handleConfirmation = async (confirmed: boolean) => {
    if (!confirmationData) return;

    try {
      setIsLoading(true);
      const response = await fetch("http://localhost:3000/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirmationId: confirmationData.confirmationId,
          confirmed: confirmed,
          path: confirmationData.path,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setOutput(data.message || "Operation confirmed and executed");
        setHistory([
          ...history,
          {
            prompt: history[history.length - 1]?.prompt || "",
            output: data.message || "Operation confirmed",
          },
        ]);
      } else if (data.cancelled) {
        setOutput("Operation cancelled by user");
      } else {
        setOutput(data.error || "Confirmation failed");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to send confirmation";
      setOutput(`Error: ${errorMessage}`);
    } finally {
      setIsLoading(false);
      setConfirmationData(null);
    }
  };

  // Get recent commands from history
  const recentCommands = history
    .slice(-5)
    .map((item) => `> ${item.prompt}`)
    .reverse();

  return (
    <div
      className={`app-container ${
        windowMode === "minimal" ? "minimal-mode" : ""
      }`}
      onClick={(e) => {
        // Only hide suggestions if clicking outside the input container
        if (
          !(e.target as HTMLElement).closest(".top-bar-input-container") &&
          !(e.target as HTMLElement).closest(".suggestions-container")
        ) {
          setShowSuggestions(false);
          setShowSmartSuggestions(false);
        }
      }}
    >
      {/* Left Sidebar - Hidden in minimal mode */}
      {windowMode === "full" && (
        <div className="sidebar">
          <div className="sidebar-logo">
            <div className="logo-circle">
              <img src={naviLogo} alt="Navi" className="navi-logo-img" />
            </div>
          </div>
          <nav className="sidebar-nav">
            <button
              className={`nav-item ${
                activeView === "prompt" ? "nav-item-active" : ""
              }`}
              onClick={() => setActiveView("prompt")}
              title="Prompt"
            >
              <svg
                className="nav-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>
            {/* Tools section hidden for first release */}
            {/* <button
              className={`nav-item ${
                activeView === "tools" ? "nav-item-active" : ""
              }`}
              onClick={() => setActiveView("tools")}
              title="Tools"
            >
              <svg
                className="nav-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
            </button> */}
            {/* <button
              className={`nav-item ${
                activeView === "logs" ? "nav-item-active" : ""
              }`}
              onClick={() => setActiveView("logs")}
              title="Logs"
            >
              <svg
                className="nav-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </button> */}
            <button
              className={`nav-item ${
                activeView === "settings" ? "nav-item-active" : ""
              }`}
              onClick={() => setActiveView("settings")}
              title="Settings"
            >
              <svg
                className="nav-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24" />
              </svg>
            </button>
          </nav>
        </div>
      )}

      {/* Main Content */}
      <div className="main-content">
        {/* Top Bar */}
        <div
          className={`top-bar ${
            windowMode === "minimal" ? "minimal-top-bar" : ""
          }`}
        >
          <div className="top-bar-input-container" ref={inputContainerRef}>
            <div className="input-icon-wrapper">
              <img
                src={naviLogoMinimal}
                alt="Navi"
                className="input-icon-logo"
              />
            </div>
            <input
              ref={inputRef}
              className="top-bar-input"
              type="text"
              placeholder="Hey! Listen!"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
            />
            <button
              className="send-button-top"
              onClick={() => handleExecute()}
              disabled={!prompt.trim() || isLoading}
            >
              <svg
                className="send-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>

            {/* Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div
                className="suggestions-container"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div
                  ref={suggestionsScrollRef}
                  className="suggestions-list"
                  onWheel={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      className={`suggestion-item ${
                        index === selectedSuggestionIndex
                          ? "suggestion-item-selected"
                          : ""
                      }`}
                      onClick={() => handleExecute(suggestion)}
                      onMouseEnter={() => {
                        setSelectedSuggestionIndex(index);
                      }}
                    >
                      <span
                        className={`suggestion-text ${
                          index === selectedSuggestionIndex
                            ? "suggestion-text-selected"
                            : ""
                        }`}
                        title={suggestion.path || suggestion.name}
                      >
                        {highlightMatch(suggestion.name, prompt.trim())}
                      </span>
                      {index === selectedSuggestionIndex && (
                        <span className="suggestion-hint">Press Enter</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Smart Suggestions Dropdown */}
            {showSmartSuggestions &&
              smartSuggestions.length > 0 &&
              !showSuggestions && (
                <div
                  className="suggestions-container smart-suggestions"
                  style={
                    windowMode === "minimal" && suggestionsPosition
                      ? {
                          top: `${suggestionsPosition.top}px`,
                          left: `${suggestionsPosition.left}px`,
                          width: `${suggestionsPosition.width}px`,
                        }
                      : undefined
                  }
                >
                  <div className="suggestions-list">
                    {smartSuggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        className="suggestion-item smart-suggestion-item"
                        onClick={() => {
                          setPrompt(suggestion.text);
                          setShowSmartSuggestions(false);
                          // Execute immediately
                          setTimeout(() => {
                            handleExecute();
                          }, 0);
                        }}
                      >
                        <div className="smart-suggestion-content">
                          <span className="suggestion-text">
                            {suggestion.text}
                          </span>
                          <span className="suggestion-description">
                            {suggestion.description}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
          </div>
          {windowMode === "full" && (
            <div className="top-bar-status">
              <div className="status-indicator">
                <div className="status-dot"></div>
                <span className="status-text">Online</span>
              </div>
            </div>
          )}
        </div>

        {/* Content Area - Hidden in minimal mode */}
        {windowMode === "full" && (
          <div className="content-wrapper">
            <div className="content-area">
              {activeView === "prompt" && (
                <div className="content-scroll">
                  {history.length === 0 && !output && !isLoading && (
                    <div className="empty-state">
                      <p>
                        No output yet. Enter a command below to get started.
                      </p>
                    </div>
                  )}

                  {history.map((item, index) => (
                    <div key={index} className="response-group">
                      {item.prompt && (
                        <div className="response-card terminal-card">
                          <div className="card-header">
                            <div className="card-header-left">
                              <svg
                                className="card-icon"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                              >
                                <polyline points="4 17 10 11 4 5" />
                                <line x1="12" y1="19" x2="20" y2="19" />
                              </svg>
                              <span className="card-title">{`> ${item.prompt}`}</span>
                            </div>
                            <button
                              className="copy-button"
                              onClick={() => handleCopy(item.prompt, index * 2)}
                            >
                              {copiedIndex === index * 2 ? (
                                <>
                                  <svg
                                    className="copy-icon"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                  >
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <svg
                                    className="copy-icon"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                  >
                                    <rect
                                      x="9"
                                      y="9"
                                      width="13"
                                      height="13"
                                      rx="2"
                                      ry="2"
                                    />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                  </svg>
                                  <span>copy</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                      {item.output && (
                        <div className="response-card ai-card">
                          <div className="card-header">
                            <div className="card-header-left">
                              <svg
                                className="card-icon"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                              >
                                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83m11.32 11.32l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83m11.32-11.32l2.83-2.83" />
                              </svg>
                              <span className="card-title">AI Response</span>
                            </div>
                            <button
                              className="copy-button"
                              onClick={() =>
                                handleCopy(item.output, index * 2 + 1)
                              }
                            >
                              {copiedIndex === index * 2 + 1 ? (
                                <>
                                  <svg
                                    className="copy-icon"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                  >
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <svg
                                    className="copy-icon"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                  >
                                    <rect
                                      x="9"
                                      y="9"
                                      width="13"
                                      height="13"
                                      rx="2"
                                      ry="2"
                                    />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                  </svg>
                                  <span>copy</span>
                                </>
                              )}
                            </button>
                          </div>
                          <div className="card-content">
                            <pre className="card-text">{item.output}</pre>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {output && history.length === 0 && (
                    <div className="response-card ai-card">
                      <div className="card-header">
                        <div className="card-header-left">
                          <svg
                            className="card-icon"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                          >
                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83m11.32 11.32l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83m11.32-11.32l2.83-2.83" />
                          </svg>
                          <span className="card-title">AI Response</span>
                        </div>
                        <button
                          className="copy-button"
                          onClick={() => handleCopy(output, -1)}
                        >
                          {copiedIndex === -1 ? (
                            <>
                              <svg
                                className="copy-icon"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                              >
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <svg
                                className="copy-icon"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                              >
                                <rect
                                  x="9"
                                  y="9"
                                  width="13"
                                  height="13"
                                  rx="2"
                                  ry="2"
                                />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                              <span>copy</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div className="card-content">
                        <pre className="card-text">{output}</pre>
                      </div>
                    </div>
                  )}

                  {isLoading && (
                    <div className="loading-container">
                      <div className="loading-spinner"></div>
                      <div className="loading-text">Processing...</div>
                    </div>
                  )}
                </div>
              )}

              {activeView === "settings" && (
                <div className="settings-container">
                  <div className="settings-scroll">
                    <h2 className="settings-title">Preferences</h2>

                    <div className="setting-section">
                      <div className="setting-label">
                        Preferred IDE / Text Editor
                      </div>
                      <div className="setting-description">
                        The IDE to open when launching dev environments
                      </div>
                      <input
                        className="setting-input"
                        type="text"
                        placeholder="e.g., code, cursor, webstorm"
                        value={preferences.ide}
                        onChange={(e) =>
                          setPreferences({
                            ...preferences,
                            ide: e.target.value,
                          })
                        }
                        onBlur={() => savePreferences(preferences)}
                      />
                    </div>

                    <div className="setting-section">
                      <div className="setting-label">
                        Default Dev Server Port
                      </div>
                      <div className="setting-description">
                        Default port to open in browser (e.g., 3000, 5173, 8080)
                      </div>
                      <input
                        className="setting-input"
                        type="text"
                        placeholder="3000"
                        value={preferences.defaultPort}
                        onChange={(e) =>
                          setPreferences({
                            ...preferences,
                            defaultPort: e.target.value,
                          })
                        }
                        onBlur={() => savePreferences(preferences)}
                      />
                    </div>

                    <div className="setting-section">
                      <div className="setting-label">Projects</div>
                      <div className="setting-description">
                        Configure projects with nicknames. When you reference a
                        project nickname, Navi will open the terminal, start the
                        dev server, open it in the browser, and open the
                        directory in your IDE.
                      </div>
                      <div className="path-nicknames-container">
                        {preferences.projects.map((item, index) => (
                          <div key={index} className="path-nickname-row">
                            <input
                              className="setting-input path-nickname-input"
                              type="text"
                              placeholder="Nickname (e.g., wotc)"
                              value={item.nickname}
                              onChange={(e) => {
                                const updated = [...preferences.projects];
                                updated[index] = {
                                  ...updated[index],
                                  nickname: e.target.value.toLowerCase(),
                                };
                                setPreferences({
                                  ...preferences,
                                  projects: updated,
                                });
                              }}
                            />
                            <input
                              className="setting-input path-nickname-input"
                              type="text"
                              placeholder="Filepath (e.g., C:\Users\Klaus\noah-game)"
                              value={item.filepath}
                              onChange={(e) => {
                                const updated = [...preferences.projects];
                                updated[index] = {
                                  ...updated[index],
                                  filepath: e.target.value,
                                };
                                setPreferences({
                                  ...preferences,
                                  projects: updated,
                                });
                              }}
                            />
                            <input
                              className="setting-input path-nickname-input"
                              type="text"
                              placeholder="Start command (e.g., npm run dev)"
                              value={item.startCommand}
                              onChange={(e) => {
                                const updated = [...preferences.projects];
                                updated[index] = {
                                  ...updated[index],
                                  startCommand: e.target.value,
                                };
                                setPreferences({
                                  ...preferences,
                                  projects: updated,
                                });
                              }}
                            />
                            <input
                              className="setting-input path-nickname-input"
                              type="text"
                              placeholder="Port (e.g., 3000, 5173) - optional"
                              value={item.port || ""}
                              onChange={(e) => {
                                const updated = [...preferences.projects];
                                updated[index] = {
                                  ...updated[index],
                                  port: e.target.value || undefined,
                                };
                                setPreferences({
                                  ...preferences,
                                  projects: updated,
                                });
                              }}
                            />
                            <button
                              className="delete-button"
                              onClick={() => {
                                const updated = preferences.projects.filter(
                                  (_, i) => i !== index
                                );
                                const newPrefs = {
                                  ...preferences,
                                  projects: updated,
                                };
                                setPreferences(newPrefs);
                                savePreferences(newPrefs, true, true);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                        <button
                          className="add-button"
                          onClick={() => {
                            const updated = [
                              ...preferences.projects,
                              {
                                nickname: "",
                                filepath: "",
                                startCommand: "",
                                port: undefined,
                              },
                            ];
                            setPreferences({
                              ...preferences,
                              projects: updated,
                            });
                          }}
                        >
                          + Add Project
                        </button>
                        <div className="save-hint">
                          Changes are saved when you click "Save Preferences"
                          below
                        </div>
                      </div>
                    </div>

                    <button
                      className="save-button"
                      onClick={() => savePreferences(preferences, true, true)}
                    >
                      Save Preferences
                    </button>
                  </div>
                </div>
              )}

              {/* Tools and Logs sections hidden for first release */}
              {/* {(activeView === "tools" || activeView === "logs") && (
                <div className="empty-view">
                  <p>View under construction...</p>
        </div>
              )} */}
            </div>

            {/* Right Sidebar - Insights Panel */}
            <div className="insights-panel">
              <div className="insights-content">
                <h3 className="insights-header">TOOLS & INSIGHTS</h3>

                <div className="insights-section">
                  <div className="insights-section-header">
                    <svg
                      className="insights-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                    <h4 className="insights-section-title">No code ref</h4>
                  </div>
                  <div className="insights-items">
                    {["No code ref", "No tool used"].map((item, index) => (
                      <div key={index} className="insights-item">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="insights-section">
                  <div className="insights-section-header">
                    <svg
                      className="insights-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                    >
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    <h4 className="insights-section-title">File Explorer</h4>
                  </div>
                  <div className="insights-items">
                    {recentCommands.length > 0 ? (
                      recentCommands.map((cmd, index) => (
                        <div key={index} className="insights-item file-item">
                          <div className="file-dot"></div>
                          <div className="file-info">
                            <div className="file-name">{cmd}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="insights-item">No recent commands</div>
                    )}
                  </div>
                </div>

                <div className="insights-section">
                  <div className="insights-section-header">
                    <svg
                      className="insights-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                    >
                      <polyline points="4 17 10 11 4 5" />
                      <line x1="12" y1="19" x2="20" y2="19" />
                    </svg>
                    <h4 className="insights-section-title">Command Palette</h4>
                  </div>
                  <div className="insights-items">
                    {recentCommands.length > 0 ? (
                      recentCommands.map((cmd, index) => (
                        <button
                          key={index}
                          className="insights-item command-item"
                          onClick={() => {
                            setPrompt(cmd.replace("> ", ""));
                            setActiveView("prompt");
                          }}
                        >
                          <svg
                            className="command-icon"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                          >
                            <polyline points="4 17 10 11 4 5" />
                            <line x1="12" y1="19" x2="20" y2="19" />
                          </svg>
                          <span className="command-text">{cmd}</span>
                        </button>
                      ))
                    ) : (
                      <div className="insights-item">No recent commands</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmationData && (
        <div
          className="modal-overlay"
          onClick={() => handleConfirmation(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Confirm Action</h3>
            </div>
            <div className="modal-body">
              <p className="modal-message">{confirmationData.message}</p>
              <div className="modal-path">
                <strong>Path:</strong> {confirmationData.path}
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="modal-button modal-button-cancel"
                onClick={() => handleConfirmation(false)}
              >
                Cancel
              </button>
              <button
                className="modal-button modal-button-confirm"
                onClick={() => handleConfirmation(true)}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
