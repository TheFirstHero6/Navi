# Navi - Your AI Fairy Helper

<div align="center">

![Navi Logo](src/assets/logo.png)

**A powerful desktop AI assistant inspired by the fairy helper from Ocarina of Time**

[Features](#-features) • [Installation](#-installation) • [Usage](#-usage) • [Development](#-development) • [Building](#-building)

</div>

---

## ✨ Features

Navi is a desktop AI assistant that helps you work faster and smarter on Windows. Just press `Alt+Space` and start typing.

### Core Capabilities

- **🤖 AI-Powered Commands** - Natural language processing powered by Google Gemini AI
- **🚀 App Launcher** - Instantly search and launch any installed Windows application
- **💻 System Commands** - Quick access to system functions (restart, shutdown, sleep, lock)
- **📁 File & Folder Navigation** - Open files and folders with intelligent path detection
- **🌐 Web Search** - Search the web directly from Navi
- **📝 Recent Files** - Quick access to recently opened files and folders
- **🔗 URL Launcher** - Open URLs in your default browser
- **⚙️ Project Management** - Configure and launch development projects with custom commands
- **🎨 Window Modes** - Switch between minimal and full screen modes with smooth animations

### Smart Features

- **Intelligent Suggestions** - Context-aware suggestions based on your input
- **Command History** - Access your recent commands
- **Minimal & Full Modes** - Switch between compact and expanded views
- **Global Hotkey** - `Alt+Space` to show/hide Navi from anywhere
- **Transparent UI** - Beautiful, modern interface that doesn't get in your way

---

## 📦 Installation

### For End Users

1. **Download the latest release** from the [Releases](../../releases) page
2. **Run the installer** (`navi-1.0.0 Setup.exe` for Windows)
3. **Launch Navi** from the Start Menu or desktop shortcut
4. **Press `Alt+Space`** to open Navi

### First-Time Setup

1. **Get a Gemini API Key**:
   - Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Create a new API key
   - Copy the key

2. **Configure the API Key**:
   - Navigate to the Navi installation directory
   - Go to the `backend` folder
   - Open the `.env` file (it should already exist with `GEMINI_API_KEY=`)
   - Add your API key after the equals sign:
     ```
     GEMINI_API_KEY=your_actual_api_key_here
     ```
   - Save the file

3. **Restart Navi** if it's already running

4. **You're ready!** Start using Navi with natural language commands. *(Important: As of 1.0.0, this is necessary to perform system functions like sleep, lock, etc)*

---

## 🚀 Usage

### Basic Commands

- **Open an app**: Type the app name (e.g., "chrome", "code", "notepad")
- **Open a file/folder**: Type the path (e.g., "C:\Users\YourName\Documents")
- **Search the web**: Type "search" followed by your query
- **System commands**: Type "restart", "shutdown", "sleep", or "lock"
- **Open URL**: Type a URL (e.g., "https://github.com")

### AI Commands

Ask Navi to do complex tasks using natural language. **All AI commands must be prefaced with `/chat`**:

- `/chat Open my dev environment for my React project`
- `/chat Search for Electron best practices`
- `/chat Open VS Code in my Documents folder`

### Keyboard Shortcuts

- **`Alt+Space`** - Show/hide Navi
- **`Enter`** - Execute selected suggestion
- **`↑` / `↓`** - Navigate suggestions

### Window Modes

- **Minimal Mode** (default): Compact search bar at the top of your screen
- **Full Mode**: Expanded view with chat interface and detailed responses

Switch modes by clicking the expand icon or using the settings.

---

## 💻 Development

### Prerequisites

- **Node.js** ≥ v16.4.0
- **npm** or **yarn**
- **Git**

### Setup

1. **Clone the repository**:

   ```bash
   git clone https://github.com/yourusername/navi.git
   cd navi
   ```

2. **Install dependencies**:

   ```bash
   npm install
   cd backend
   npm install
   cd ..
   ```

3. **Configure environment**:
   - Create a `.env` file in the `backend` directory:
     ```
     GEMINI_API_KEY=your_api_key_here
     ```
   - Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)

4. **Run in development mode**:

   ```bash
   npm run electron:dev
   ```

   This will:
   - Compile TypeScript files
   - Start the backend server (port 3000)
   - Start the Vite dev server (port 5173)
   - Launch Electron with hot reload

### Development Scripts

| Command                  | Description                               |
| ------------------------ | ----------------------------------------- |
| `npm run dev`            | Start Vite dev server only                |
| `npm run electron:dev`   | Start dev server + Electron (recommended) |
| `npm run build`          | Build React app only                      |
| `npm run build:electron` | Build Electron main process + React app   |
| `npm start`              | Run built Electron app                    |
| `npm run package`        | Package the app (no installer)            |
| `npm run make`           | Create distributable installers           |

### Project Structure

```
navi/
├── electron/              # Electron main process
│   ├── main.ts           # Main process (window management, backend spawning)
│   └── preload.ts        # Preload script (secure IPC bridge)
├── backend/              # Backend server (Express + Gemini AI)
│   ├── index.js          # Express server with AI integration
│   ├── package.json      # Backend dependencies
│   └── .env              # API key configuration (create this)
├── src/                  # React frontend
│   ├── App.tsx           # Main React component
│   ├── App.css           # Styles
│   ├── main.tsx          # React entry point
│   └── assets/           # Images and icons
├── dist/                 # Built React app
├── dist-electron/        # Built Electron main process
├── out/                  # Packaged app output
├── forge.config.js       # Electron Forge configuration
└── package.json          # Root package.json
```

---

## 🔨 Building

### Create Distributables

To build installers for distribution:

```bash
npm run make
```

This will create platform-specific installers in the `out/make/` directory:

- **Windows**: `navi-1.0.0 Setup.exe` (Squirrel installer)
- **macOS**: `.zip` file
- **Linux**: `.deb` and `.rpm` packages

### Build Configuration

The app uses [Electron Forge](https://www.electronforge.io/) for packaging. Configuration is in `forge.config.js`.

**Note**: The backend server and all dependencies are automatically bundled with the app. No separate Node.js installation is required for end users.

---

## ⚙️ Configuration

### Settings

Access settings by clicking the ⚙️ icon or typing "settings" in Navi.

**Available Settings**:

- **Default IDE** - Preferred code editor (e.g., "code" for VS Code)
- **Default Port** - Default port for development servers
- **Projects** - Configure project shortcuts with:
  - Nickname (e.g., "myproject")
  - File path
  - Start command (e.g., "npm run dev")
  - Port (optional)

**Note**: The Gemini API key is configured via the `.env` file in the `backend` directory (see [First-Time Setup](#first-time-setup) above).

### Project Configuration Example

Add a project in Settings:

```
Nickname: example_nickname
File Path: C:\Users\YourName\Projects\example_nickname
Start Command: npm run dev
Port: 5173
```

Then you can say: `/chat Open my dev environment for example_nickname` and Navi will:

1. Open a terminal in the project directory
2. Run the start command
3. Open the browser to the correct port
4. Open your IDE with the project

---

## 🐛 Troubleshooting

### Backend Not Starting

If you see "Backend server is not responding":

1. **Check the Electron console**:
   - Open Navi
   - Press `Ctrl+Shift+I` (or View > Toggle Developer Tools)
   - Look for error messages in the console

2. **Verify API key**:
   - Check that the `.env` file exists in the `backend` directory
   - Ensure the file contains: `GEMINI_API_KEY=your_actual_key_here`
   - Make sure there are no extra spaces or quotes around the key
   - Restart Navi after making changes

3. **Check port 3000**:
   - Ensure port 3000 is not in use by another application
   - You can change the port in the backend code if needed

### App Won't Launch

1. **Check Windows compatibility**: Navi requires Windows 10 or later
2. **Reinstall**: Uninstall and reinstall from the latest release
3. **Check antivirus**: Some antivirus software may block Electron apps

### Global Hotkey Not Working

1. **Check for conflicts**: Another app may be using `Alt+Space`
2. **Restart Navi**: Close and reopen the application
3. **Run as administrator**: Try running Navi as administrator (if needed)

### Development Issues

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for detailed development troubleshooting.

---

## 🛠️ Technology Stack

- **Frontend**: React, TypeScript, Vite
- **Desktop**: Electron 
- **Backend**: Express, Node.js
- **AI**: Google Gemini AI
- **Packaging**: Electron Forge
- **Styling**: CSS3 with modern features

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 🙏 Acknowledgments

- Inspired by the memorable fairy Navi from _The Legend of Zelda: Ocarina of Time_
- Built with [Electron](https://www.electronjs.org/) and [Electron Forge](https://www.electronforge.io/)
- Powered by [Google Gemini AI](https://deepmind.google/technologies/gemini/)

---

## 📧 Support

For issues, questions, or suggestions:

- Open an issue on [GitHub](../../issues)
- Check the [Troubleshooting Guide](./TROUBLESHOOTING.md)

---

<div align="center">

**Made with ❤️ by Klaus Chamberlain**

_"Hey! Listen!"_ - Navi

</div>
