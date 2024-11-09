<div align="center">
  <img src="header.svg" alt="Yet Another Programming Assistant" />
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
  [![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=flat&logo=openai&logoColor=white)](https://openai.com/)
</div>

<p align="center">A powerful Node.js-based semi-autonomous coding assistant that helps you build and test software modules. Think of it as a very capable junior developer who can understand requirements, write code, and run extensive tests. 🚀</p>

---

## ✨ Features

- 📝 Write complete software modules from your requirements
- 🧪 Run comprehensive tests (might require prompting)
- 📚 Read online documentation for the task
- 🌐 Handle browser automation tasks
- 📂 Process files and execute system commands
- 🔄 Merge and update existing code

## 🚀 How it works

### 1️⃣ Describe Your Needs
Simply tell the assistant what you need:
```bash
"Create a module that processes CSV files and handles encoding errors"
```

### 2️⃣ Let the Assistant Work
The assistant will:
- 📋 Break down the task
- 📁 Create necessary files
- 💻 Write the code
- 🛡️ Add error handling
- 🧪 Create test cases
- ▶️ Run tests
- 📊 Show you the results

### 3️⃣ Review and Guide
You can:
- ✅ Check test results
- 🔄 Request changes
- ⭐ Add features
- ⚡ Improve performance

## 🛠️ Getting Started

### 1. Clone and Install

```bash
git clone https://github.com/gagebt/autoprog.git
cd autoprog
npm install
```

### 2. Configure API Key

#### 2.1 For OpenAI
- If you have `env.OPENAI_API_KEY`: No action needed
- Otherwise: Set `apiKey` in config.yaml

#### 2.2 For OpenRouter
- Set `apiKey` and `baseURL: https://openrouter.ai/api/v1`
- Recommended: Set `model=cycle` to alternate between GPT and Claude

### 3. Run the Assistant

```bash
node assistant.js
```

Then enter your project idea (non-GUI projects recommended).

## ⚡ Quick Commands

| Command | Description |
|---------|-------------|
| `%opendir` | Open current project directory |
| `%reset` | Erase message history |
| `%model [name]` | Switch AI model |
| `%cd [dir_number]` | Change project directory (/files/<dir_number>/) |
| `%openconfig` | Edit settings |

## 🔧 Advanced Usage

To work with an existing project:
1. Run the assistant
2. Execute `%opendir`
3. Place your files in the opened directory
4. Start working with your files through the assistant

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">
  <sub>Built with ❤️ by the community</sub>
</div>