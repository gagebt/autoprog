# Yet Another Programming Assistant

A Node.js-based semi-autonomous coding assistant that helps you build and test software modules. Think of it as a very capable junior developer who can understand requirements, write code, and run extensive tests.
It's somewhat early in development, so it outputs debug info.

## What it can do

- Write complete software modules from your requirements
- Run comprehensive tests (might require prompting)
- Read online documentation for the task
- Handle some browser automation tasks
- Process files and execute system commands
- Merge and update existing code

## How it works

1. You describe what you need:
   "Create a module that processes CSV files and handles encoding errors"

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
   - Improve performance

## Getting Started

1. Clone and install:
   ```
   git clone https://github.com/gagebt/autoprog.git
   cd autoprog
   npm install
   ```

2. Provide your API key in config.yaml:
2.1. If OpenAI: if you have env.OPENAI_API_KEY: do nothing, else: set apiKey
2.2. If OpenRouter: set apiKey and baseURL: https://openrouter.ai/api/v1. Here, it's recommended that you choose model=cycle so the assistant alternates between GPT and Claude.

3. Run:
   ```
   node assistant.js
   ```

4. Enter your project idea. Prefer non-GUI ones.

## Quick Commands

- %opendir - Open current project directory
- %reset - Erase message history
- %model [name] - Switch AI model
- %cd [dir_number] - Change project directory (/files/<dir_number>/)
- %openconfig - Edit settings

## Advanced usage

To edit an existing project:
- Run the assistant
- Run %opendir in it
- Place your files into the directory
- Now you can ask the assistant to work with your files

## License

MIT