# ScriptureGlide 📖✨

**ScriptureGlide** is a professional, dual-monitor scripture presentation system designed for churches, study groups, and speakers. It features a modern React-based control interface and a high-performance Tauri/Rust backend for seamless multi-display management.

![ScriptureGlide Banner](https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6)

## 🌟 Key Features

- **Dual-Monitor Excellence:** Dedicated control dashboard for the operator and a clean, distraction-free presentation window for the audience.
- **Live Markup System:** Highlight, underline, and colorize text in real-time. Your changes sync instantly to the presentation screen.
- **Real-Time Syncing:** Powered by a robust backend to ensure zero-latency updates between the controller and the display.
- **Customizable Aesthetics:** Control fonts, themes (Dark/Light), and layout settings (e.g., one verse per line) to match your environment.
- **Study Management:** Save and load your marked-up passages for future use.
- **Interactive Controls:** Smooth scrolling, acrostic displays, and quick-search capabilities.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (Latest LTS recommended)
- [Rust](https://www.rust-lang.org/) (For Tauri backend)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/scriptureglide.git
   cd scriptureglide
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   Create a `.env.local` file and add your Gemini API key (if using AI features):
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```

## 🛠️ Development

Run the application in development mode:

```bash
npm run tauri:dev
```

This will launch both the Vite development server and the Tauri desktop application with hot-reloading enabled.

## 🏗️ Building for Production

To create a production-ready installer for your platform:

```bash
npm run tauri:build
```

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

*Developed with ❤️ for the global church.*
