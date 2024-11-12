<div align="center">
  <img src="header.svg" alt="Yet Another Programming Assistant" />
</div>

A Node.js-based semi-autonomous coding assistant that helps you build and test software modules. Think of it as a very capable junior developer who can understand requirements, write code, and run extensive tests.

It's somewhat early in development, so it outputs debug info.

## ✨ What it can do

- Write complete software modules from your requirements
- Run comprehensive tests (might require prompting)
- Read online documentation for the task
- Handle some browser automation tasks
- Process files and execute system commands
- Merge and update existing code

## 🤖 How it works

1. Describe what you need:
```bash
"Create a module that processes CSV files and handles encoding errors"
```

2. The assistant:
- Breaks down the task
- Creates necessary files
- Writes the code
- Adds error handling
- Creates test cases
- Runs tests
- Shows you the results

3. You review and guide:
- Check test results
- Request changes
- Add features

## 🛠️ Getting Started

1. Clone and install:
```bash
git clone https://github.com/gagebt/autoprog.git
cd autoprog
npm install
```

2. Provide your API key in config.yaml:

2.1. If your AI provider is OpenAI: if you have env.OPENAI_API_KEY: do nothing, else: set apiKey

2.2. If it's OpenRouter: set apiKey and baseURL: https://openrouter.ai/api/v1. With OpenRouter, it's recommended that you choose model=cycle so the assistant alternates between GPT and Claude.

3. Run:
```bash
node assistant.js
```

4. Enter your project idea. Prefer non-GUI ones.

## ⚡ Quick Commands

| Command | Description |
|---------|-------------|
| `%opendir` | Open current project directory |
| `%reset` | Erase message history |
| `%model [name]` | Switch AI model |
| `%cd [dir_number]` | Change project directory (/files/[dir_number]/) |
| `%openconfig` | Edit settings |

## 🔧 Advanced Usage

To edit an existing project:
1. Run the assistant
2. Run %opendir in it
3. Place your files into the directory
4. Now you can ask the assistant to work with your files

## License

AGPL-3.0
Requires open source:
- when modifying/distributing this software or offering it as a service;
- but not when just using its outputs, like generated code
