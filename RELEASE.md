# Navi v1.0.0 - Initial Release

**A powerful desktop AI assistant inspired by the fairy helper from Ocarina of Time**

## What's New

This is the initial release of Navi, a desktop AI assistant for Windows.

### Features

- **Global Hotkey** - Press `Alt+Space` from anywhere to open Navi
- **AI-Powered Commands** - Natural language processing with Google Gemini AI (use `/chat` prefix)
- **App Launcher** - Search and launch any installed Windows application
- **System Commands** - Quick access to restart, shutdown, sleep, and lock
- **File & Folder Navigation** - Open files and folders with intelligent path detection
- **Web Search** - Search the web directly from Navi
- **URL Launcher** - Open URLs in your default browser
- **Project Management** - Configure and launch development projects with custom commands
- **Window Modes** - Switch between minimal and full screen modes

## Installation

1. Download `navi-1.0.0 Setup.exe` from the assets below
2. Run the installer and follow the setup wizard
3. Launch Navi from the Start Menu
4. Press `Alt+Space` to open Navi

## First-Time Setup

1. Get a Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Navigate to the Navi installation directory → `backend` folder
3. Open the `.env` file and add your API key:
   ```
   GEMINI_API_KEY=your_actual_api_key_here
   ```
4. Restart Navi if it's already running

## Quick Start

- **Open an app**: Type the app name (e.g., "chrome", "code")
- **AI commands**: Type `/chat` followed by your request (e.g., `/chat Open my dev environment`)
- **System commands**: Type "restart", "shutdown", "sleep", or "lock"
- **Open URL**: Type a URL (e.g., "https://github.com")

## Requirements

- Windows 10 or later
- Gemini API Key (free from [Google AI Studio](https://makersuite.google.com/app/apikey))

---

**Made with ❤️ by Klaus Chamberlain**

_"Hey! Listen!"_ - Navi
