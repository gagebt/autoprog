// (07.02.2024)
// This file defines a system for running code blocks in various programming languages.
// It includes classes for managing code execution sessions and handling the output.
// Supported languages include JavaScript, Python, Shell, and Cmd.
// Features include:
// - Running code with a timeout to prevent infinite loops.
// - Preprocessing code to include termination signals.
// - Extracting code blocks from strings and optionally running or saving them.
// - Handling user-initiated aborts of code execution.
// - Saving code blocks to files.
// - Getting user and system information.


let browserW=768, browserH=2000, browser, browserPid;


const { processImage } = require('./b-process_image');
const { spawn } = require('child_process');
const { exec, execSync } = require('child_process');
const readline = require('readline');
const lr=a=>{console.log(a);return a+"\n";}

const os = require('os');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const config = yaml.load(fs.readFileSync('config.yaml', 'utf8'));

const outputLimit = config.consoleCommandOutputMaxLength;
let { visibleFileSizeLimitKB, visibleAllFilesSizeLimitKB } = config;


const 
{extractFunctionsAndCodeBlocks, callOpenAI, callMergeCode,
  exportedVars} 
= require('./b-codehelper.js')








function cropOutputToLimit(output, limit) {
  output+='';
  if (output.length > limit) {
    const start = output.substring(0, limit / 2);
    const end = output.substring(output.length - limit / 2);
    return `${start}\n\n\n\n[CAUTION: MIDDLE OF OUTPUT OMITTED DUE TO THE SIZE LIMIT OF ${limit} CHARS]\n\n\n\n${end}`;
  }
  return output;
}

function setGlobalVariable(varName, newValue) {
  exportedVars[varName]=newValue;
  return newValue;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

try {
  fs.mkdirSync(`${process.cwd()}/files`);
} catch (err) {
  if (err.code !== 'EEXIST') throw err;
}
let i = 0;
do {
  exportedVars.currentWorkingDirectoryForCode = `${process.cwd()}/files/${i}`;
  i++;
} while (fs.existsSync(exportedVars.currentWorkingDirectoryForCode));
fs.mkdirSync(exportedVars.currentWorkingDirectoryForCode);
console.log(`Directory created at: ${exportedVars.currentWorkingDirectoryForCode}`);


function getUserInfoString() {
  const username = os.userInfo().username;
  const operatingSystem = os.type();
  const defaultShell = process.env.SHELL || 'Not available';
  const currentDateTime = new Date().toLocaleString('de-DE', { timeZoneName: 'short' });
  
  return `\n[User Info]\n` +
         `OS: ${operatingSystem}\n` +
         `DateTime: ${currentDateTime}\n`;
}

let terminaterunCodeBlocksFromAnswer=0;
function terminaterunCodeBlocksFromAnswerF(){
  terminaterunCodeBlocksFromAnswer=1;
}

function moveOrCopyBetweenDirs(sourceDir = "./files", destinationDir = "./files_old", shouldCopy = false) {
  try {
    // Ensure the destination directory exists
    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true });
    }

    // Fetch all entries from the source directory
    const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
    //lr(entries)

    // Iterate over each entry to move or copy
    for (const entry of entries) {
      const sourcePath = path.join(sourceDir, entry.name);
      const destinationPath = path.join(destinationDir, entry.name);

      // If the entry is a directory, recursively call this function
      //console.log({entry},entry.isDirectory())
      if (entry.isDirectory()) {
        moveOrCopyBetweenDirs(sourcePath, destinationPath, shouldCopy);
        if (!shouldCopy) {
          fs.rmSync(sourcePath, { recursive: true, force: true });
        }
      } else {
         {
          if (!fs.existsSync(destinationPath)) {
            fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
          }
          fs.copyFileSync(sourcePath, destinationPath);
          if (!shouldCopy)fs.rmSync(sourcePath);
        } 
      }
    }

    console.log(`${shouldCopy ? 'Copied' : 'Moved'} all entries from ${sourceDir} to ${destinationDir}`);
  } catch (error) {
    console.error("Error processing files: ", error);
  }
}





const programmingLangExtensions = [
  '.js', '.py', '.java', '.cpp', '.cs', '.ts', 
  '.html', '.css', '.rb', '.php', '.swift', 
  '.go', '.rs', '.kt', '.lua', '.perl', 
  '.scala', '.sh', '.bat', '.sql', '.md'
  //'.xml', '.json', '.yaml', '.yml', 
];

async function getProjectFileTree_helperNoLimit(argdict) {
  let {
    dir = exportedVars.currentWorkingDirectoryForCode, 
    includeLangFilesOnly = false, 
    maxDepth = Infinity, 
    currentDepth = 0
  } = argdict;
  let dirPath = dir;  
  const fs = require('fs').promises;
  const path = require('path');
  const yaml = require('js-yaml');

  let tree = { files: [], directories: {} };

  async function getDirectorySize(dir) {
    let totalSize = 0;
  
    async function getSize(filePath) {
      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        return getDirectorySize(filePath);
      } else {
        return stats.size;
      }
    }
  
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const sizes = await Promise.all(entries.map(entry => getSize(path.join(dir, entry.name))));
    totalSize = sizes.reduce((acc, size) => acc + size, 0);
  
    return totalSize;
  }
  
  const readDir = async (currentPath, depth) => {
    if (depth > maxDepth) return;
    const contents = await fs.readdir(currentPath, { withFileTypes: true });
    let node = { path: currentPath, files: [], directories: {} };

    for (const dirent of contents) {
      const fullPath = path.join(currentPath, dirent.name);
      if (dirent.isDirectory()) { 
        if (depth >= maxDepth) {
          const size = await getDirectorySize(fullPath);
          //const entries = await fs.readdir(fullPath, { withFileTypes: true });
          //const fileCount = entries.filter(entry => entry.isFile()).length;
          //const dirCount = entries.filter(entry => entry.isDirectory()).length;
          node.directories[dirent.name] = `(${(size / 1024).toFixed(2)} KB)`;//${size} bytes, files: ${fileCount}, directories: ${dirCount}>`;
        } else {
          node.directories[dirent.name] = await readDir(fullPath, depth + 1);
        }
      } else {
        const stat = await fs.stat(fullPath);
        node.files.push(`${dirent.name} (${(stat.size / 1024).toFixed(2)} KB)`);
      }
    }

    node.files = node.files.join(", ");
    return node;
  };

  tree = await readDir(dirPath, currentDepth);
  return "" + yaml.dump(tree);
}


async function getProjectFileTree(argdict) {
  if(!argdict.outputLimit)argdict.outputLimit = 1000;

  let output;
  do {
    output = await getProjectFileTree_helperNoLimit(argdict);
    if (output.length <= argdict.outputLimit || argdict.maxDepth<=0) return output;
    if(typeof argdict.maxDepth !== 'number' || argdict.maxDepth > 3) argdict.maxDepth = 3;
    argdict.maxDepth -= 1; // Reduce the recursion depth if output exceeds limit
  } while (1);
}




/*function getCodeFilesInProjectDir(directoryPath=exportedVars.currentWorkingDirectoryForCode) { //old version, unused
  const fs = require('fs');
  const path = require('path');
  let codeFiles = [];

  const excludedDirectories = [
    '__pycache__', 
    'node_modules', 
    'site-packages'
  ];
  
  function readDirectory(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        if (!excludedDirectories.includes(file) || file[0] == '.') { // Check if the directory is not in the excluded list
          readDirectory(filePath);
        }
      } else if (stat.isFile() && programmingLangExtensions.includes(path.extname(file))) {
        let relativePath = path.relative(directoryPath, filePath);
        let contents = fs.readFileSync(filePath, { encoding: 'utf8' });

        codeFiles.push(`[CODEBASE]\n[Up-to-date FILE CONTENTS of ${relativePath} with length ${contents.length} bytes]\n\`\`\`\n${contents}\n\`\`\``);

        const maxlen=visibleFileSizeLimitKB*1024;
        if (contents.length > maxlen) {
          const halfMaxlen = maxlen / 2;
          const firstPart = contents.substring(0, halfMaxlen);
          const lastPart = contents.substring(contents.length - halfMaxlen, contents.length);
          contents = firstPart + "\n\n\n\n...[CAUTION: MIDDLE OF FILE CONTENT OMITTED DUE TO A SIZE LIMIT "+visibleFileSizeLimitKB+" KB]...\n\n\n\n" + lastPart;
        }
        //file path \n \`\`\`\n code \n\`\`\`
      }
    });
  }

  readDirectory(directoryPath);
  if(codeFiles.length==0)  
    codeFiles.push(`[CODEBASE]\nCurrently empty`);
  return codeFiles.map(a=>{return {role: "system", expire: 1, content: a}});
}*/





function getVisibleFiles(directoryPath=exportedVars.currentWorkingDirectoryForCode, STATE) {
  const fs = require('fs');
  const path = require('path');
  let codeFiles = [];

  const excludedDirectories = ['__pycache__', 'node_modules']; // Add any other directories you want to exclude
  
  function readDirectory(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        if (!excludedDirectories.includes(file) || file[0] == '.') { // Check if the directory is not in the excluded list
          readDirectory(filePath);
        }
      } else if (stat.isFile() && programmingLangExtensions.includes(path.extname(file))) {
        let relativePath = path.relative(directoryPath, filePath);
        codeFiles.push(`[CODEBASE]\n[Up-to-date file contents of ${relativePath}]\n\`\`\`\n${fs.readFileSync(filePath)}\n\`\`\``);
        //file path \n \`\`\`\n code \n\`\`\`
      }
    });
  }

  readDirectory(directoryPath);
  if(codeFiles.length==0)  
    codeFiles.push(`[CODEBASE]\nCurrently empty`);
  return codeFiles.map(a=>{return {role: "system", expire: 1, content: a}});
}














class CodeRunner {
  constructor(file_extension, name, start_cmd) {
    this.file_extension = file_extension;
    this.name = name;
    this.start_cmd = start_cmd;
    this.abort=0;
    //this.start_cmd = ['powershell', '-Command', 'node -i'];
    this.child = spawn(this.start_cmd[0], this.start_cmd.slice(1), {shell:true});

    if(0&&  this.name=="javascript"){
      this.child.stdin.write('const window={};\n');    
      this.child.stdout.on('data', (data) => {
        // do nothing
      });
    }  
  }

  preprocess(code){return code}

  async abortF() {
    console.log("aborting code execution",this.name)
    this.abort=1;
    //this.child.kill('SIGINT');
  }

  async kill() {
    try {
      console.log("Killing", this.child.pid);
      this.child.kill('SIGKILL');
      process.kill(this.child.pid,'SIGKILL');
    } catch (error) {
      //console.error('Error killing the process:', error);
    }
  }

  async execute_code(code, timeout = 180000) {
    this.abort=0;
    code = this.preprocess(code)
    let output = '';

    //await new Promise(resolve => setTimeout(resolve, 300)); // Pause for 300ms
    let timeoutHandle; // Declare a variable to hold the timeout handle
    return Promise.race([
      new Promise((resolve, reject) => {

        this.child.stdout.removeAllListeners('data');
        this.child.stderr.removeAllListeners('data');


        let onout=(data) => {
          if (data.includes("##skip##")) return;
          //if (data=="... ") return;
          if (data.includes("##end_of_execution##")) {
              clearInterval(abortInterval);
              clearTimeout(timeoutHandle); // Cancel the timeout on successful execution
              return resolve(output);
          }
          output += `${data}\n`;
          console.log(data + "")
        };
        this.child.stdout.on('data', (data) => {
          data.toString().split('\n').forEach(line => {
            onout(line);
          });
        });
        this.child.stderr.on('data', (data) => {
          data.toString().split('\n').forEach(line => {
            onout(line);
          });
        });
        this.child.on('close', (code, signal) => {
          console.log(`Child process exited with code ${code} and signal ${signal}`);
          clearInterval(abortInterval);
          clearTimeout(timeoutHandle); // Cancel the timeout on process exit
          if (this.abort) {
            resolve(output + '\n\n[[Execution terminated by user]]');
          } else if (code !== 0) {
            resolve(output + '\n\n[[Execution terminated with non-zero exit code]]');
          } else {
            resolve(output); // Resolve with the current output
          }
        });
        let abortInterval = setInterval(() => {
          if(this.abort) {
            //this.kill();
            clearInterval(abortInterval);
            clearTimeout(timeoutHandle); // Also cancel the timeout if execution is aborted
            resolve(output+'\n\n[[Waiting for the command execution was aborted by user. The command is still running in the background.]]');
          }
        }, 100);

        if(exportedVars.DEBUG)console.log("[[write]]",code + '\n',"[[end write]]")
        this.child.stdin.write(code + '\n');
      }),
      new Promise((resolve, reject) => {
        timeoutHandle = setTimeout(() => { // Assign the timeout to the variable
          try {
            this.child.kill('SIGINT');
          } catch (error) {
            console.error('Error trying to signal the child process:', error);
          }
          setTimeout(() => {
            let message='\n\n[[Execution timed out after ' + timeout/1000 + ' sec. The command is still running in the background.]]\n';
            console.log(message);
            output += message;
            //this.kill(this.child.pid)
            resolve(output);
          }, 100);
        }, timeout);
      }) 
      // Timeout promise
    ]);
  }
}






/*class javascript extends CodeRunner {
  constructor() {
    super("js", "javascript", ["node", "-i"], 10000);
  }
  preprocess(code){
    const cwdCommand = `process.chdir("${exportedVars.currentWorkingDirectoryForCode.replace(/\\/g, '\\\\')}");`;

    return cwdCommand+"\n"+code+"\nconsole.log('##end_of_execution##')";

    return (`(async () => {
try{
${cwdCommand}
${code}
}catch(e){console.log(e)}
await new Promise((resolve) => setTimeout(resolve, 10));
console.log("##end_"+"of_execution##");
})();'##skip##'`)
  }
}

class python extends CodeRunner {
  constructor() {
    super("py", "Python", ["python", "-i"]);
  }
  preprocess(code){
    const cwdCommand = `import os\nos.chdir(r"${exportedVars.currentWorkingDirectoryForCode}")`;
    return `${cwdCommand}\n${code}\nprint ("##end_of_execution##")`;
  }
}*/

class shell extends CodeRunner {
  constructor() {
    super("sh", "Shell", ["bash", "-i"]);
  }
  preprocess(code){
    this.child = spawn(this.start_cmd[0], this.start_cmd.slice(1), {shell:true});

    const cwdCommand = `cd "${exportedVars.currentWorkingDirectoryForCode}"`;
    return `${cwdCommand}\n${code}\necho "##end_of_execution##"`;
  }
}

class cmd extends CodeRunner {
  constructor() {
    super("cmd", "Cmd", ["cmd", "/K"]);
  }
  preprocess(code){
    this.child = spawn(this.start_cmd[0], this.start_cmd.slice(1), {shell:true});

    const cwdCommand = `cd /d "${exportedVars.currentWorkingDirectoryForCode}"`;
    return `@echo off\n${cwdCommand}\n${code}\necho ##end_of_execution##`;
  }
}

class CodeSession {
  constructor() {
    this.sessions = {};
  }

  async abort(language){
    if(this.sessions[language])this.sessions[language].abortF();
  }

  async execute_code(language, code) {
    language = language.toLowerCase();
    const languageMapping = {
      //'javascript': javascript,
      //'python': python,
      'shell': shell,
      'sh': shell,
      'cmd': cmd
    };

    try {
      if (!this.sessions[language]) {
        if (!languageMapping[language]) {
          throw new Error(`Unsupported language: ${language}. Available languages: ` + Object.keys(languageMapping).join(', ')+`. Use the WRITE_FILE and MERGE_FILE commands to save your code to a file, then use RUN_SHELL_COMMAND to run the file.`);
        }
        this.sessions[language] = new languageMapping[language]();
      }
      else if (language=='shell'||language=='cmd'){ 
        //if(this.sessions[language])this.sessions[language].kill();
        this.sessions[language] = new languageMapping[language]();
      }

      return await this.sessions[language].execute_code(code);
    } catch (error) {
      let message="[[Error while executing code. Resetting code session. Make sure to rerun the code.]] \n\n"+error;
      console.log(message)
      this.sessions[language] = new CodeSession();
      return message;
    }
  }
}














let cursorPosition = { x: 0, y: 0 };
const updateCursorPosition = (x, y) => {
    cursorPosition.x = x;
    cursorPosition.y = y;
};

const extractCodeBlocksAndMessages = async (LLMMsg, STATE) => { // returns an array of up to both {language, code, filename}s and of {message}s
  let pieces = ("\n"+LLMMsg).split("\n\`\`\`");
  if (pieces.length % 2 == 0) {
    console.log("Error: non-odd pieces count", { pieces });
    return [];
  }
  const codeBlocks = [];

  async function AWAIT_BROWSER(){
    let pages,page;
    /*await Promise.race([
      page.waitForNavigation({ waitUntil: 'load' }),
      page.evaluate(() => {
        if (document.readyState === 'complete') return;
      })
    ]);*/

    // Check if the page is still loading. Using a dirty hack
    let attempt = 0;
    while (1) {
      try {
        pages = await browser.pages();
        page = pages[pages.length - 1]; // Get the current (most recently opened) page
        if(await page.evaluate(() => document.readyState === 'complete'))break;
      } catch (error) {
        // If the execution context was destroyed, wait a bit and then retry
        if (error.message.includes('Execution context was destroyed') && attempt++<3) {
          console.log(`Attempt ${attempt}: Execution context was destroyed, retrying...`);
        } else {
          // If it's a different error, rethrow it
          throw error;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second before checking again
    }

    return page;
  }

  async function LOOK_AT_BROWSER(adding_coords=0){
    //sleep(2222);console.log("sleep 20")
    
    try {
      let page = await AWAIT_BROWSER();
      
      
      const datetime = new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour12: false ,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      
      const pageUrl = page.url();
      let screenshotBuffer = await page.screenshot();
      const sharp = require('sharp');

      async function drawCursor(screenshotBuffer){
        const cursorIcon = await sharp('cursor.png')
          .resize({ width: 32, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .toBuffer();

        screenshotBuffer = await sharp(screenshotBuffer)
          .composite([{
            input: cursorIcon,
            top: Math.round(cursorPosition.y),
            left: Math.round(cursorPosition.x)
          }])
          .toBuffer();

          return screenshotBuffer;
      }

      async function drawCoords(){ //REPLACED
        const every = 100;

        const metadata = await sharp(screenshotBuffer).metadata();
        const imageWidth = metadata.width;
        const imageHeight = metadata.height;
        const lineColor1 = { r: 255, g: 0, b: 0 };
        const lineColor2 = { r: 0, g: 255, b: 0 };
        const lineWidth = 4;
        const fontSize = 20;
        //const textColor = { r: 255, g: 255, b: 255, alpha: 0.75 };
        const font = `${fontSize}px Arial`;

        // Draw horizontal lines every every pixels
        if(1)for (let y = 0; y <= imageHeight; y += every) {
          screenshotBuffer = await sharp(screenshotBuffer)
            .composite([{
              input: await sharp({
                create: {
                  width: imageWidth,
                  height: lineWidth,
                  channels: 3,
                  background: lineColor1
                }
              }).png().toBuffer(),
              top: y,
              left: 0
            }])
            .png().toBuffer();
        }


        // Draw vertical lines every every pixels
        if(1)for (let x = 0; x <= imageWidth; x += every) {
          screenshotBuffer = await sharp(screenshotBuffer)
            .composite([{
              input: await sharp({
                create: {
                  width: lineWidth,
                  height: imageHeight,
                  channels: 3,
                  background: lineColor2
                }
              }).png().toBuffer(),
              top: 0,
              left: x
            }])
            .png().toBuffer();
        }

                
        for (let y = 0; y <= imageHeight; y += every) {
          for (let x = 0; x <= imageWidth; x += every) {
            // Draw text at the intersection
            const text = `x=${x}`;
            const text2 = `y=${y}`;
            const textBuffer = await sharp({
              create: {
                width: 100,
                height: fontSize * 2 + 20, // Adjust height to accommodate two lines
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 0 }
              }
            })
            .composite([{
              input: Buffer.from(`<svg width="70" height="${fontSize * 2 + 10}">
                <rect width="100%" height="100%" fill="lightgrey"/>
                <text x="2" y="${fontSize + 2}" font-family="${font}" font-size="${fontSize}" fill="black">${text}</text>
                <text x="2" y="${fontSize * 2 + 2}" font-family="${font}" font-size="${fontSize}" fill="black">${text2}</text>
              </svg>`),
              top: 0,
              left: 0
            }])
            .png()
            .toBuffer();

            // Composite the text onto the main image
            screenshotBuffer = await sharp(screenshotBuffer)
              .composite([{
                input: textBuffer,
                top: y - fontSize / 2, // Adjust this value as needed to center the text
                left: x - 50 // Adjust this value as needed to center the text
              }])
              .png()
              .toBuffer();
          }
        }
      }
      
      let expire=5;
      let text="[Here's the screenshot of your browser at "+datetime+". Page URL: "+pageUrl+". \n\nDescribe important task-relevant details in this image, if any, before using them.\n\nCaution: as you're an LLM, your vision sometimes hallucinates text. So, e.g. if you have problems interacting with the page by text, try using only a part of that text.\n\nRemember to scroll the page via JS if you're nearing the end of the page (or if you're too low).]"  //  \n\nIf you see your cursor on this image (its point is at its x,y coordinates), you can use your last coordinates and current cursor placement to find out better cursor coordinates

      // disable?: drawing grid and cursor
      if(!adding_coords){
        await LOOK_AT_BROWSER(1); 
      }
      else
      {
        screenshotBuffer = await processImage(screenshotBuffer);
        //sleep(2222);console.log("sleep 202")
        let expire=5;
        text = "[Here's the same screenshot of your browser at "+datetime+" but with points inpainted (red center, green border), each has its coordinates written nearby (below). You can use this for cursor positioning, but *generally don't use mouse* unless other ways fail; prefer running JS. If you do, keep in mind that your sense of coordinates is imprecise, and use your last coordinates and current cursor placement to find out better cursor coordinates.]" // Use them to position mouse cursor by executing the following algorithm: {Say which page item you want to click on; If your cursor is visible and nearby, say its coordinates you used before; Say the closest inpainted coordinates + approximate x and y differences from the center of required area (Estimate the differences **independently** for each point to get kind of wisdom of crowds effect - so that estimation errors would be averaged out later. Don't look at estimations to different points); Use all those to calculate exact coordinates for your interaction}. Attention: The inpainted coordinates are NOT at the point they describe; the nearby gridlike white-black points are instead. Caution: Completely ignore coordinates in previous answers, because they likely did not work; don't get 'anchored' on them!.
      }

      try {
        screenshotBuffer = await drawCursor(screenshotBuffer);
      } catch (error) {
        console.error(`Non-fatal error:\n\nFailed to draw cursor: ${error.stack}`);
      }

      screenshotBuffer = await sharp(screenshotBuffer)
        .resize(browserW, browserH)
        .png({
          quality: 80, // Adjust the quality from 0 to 100
          compressionLevel: 9, // Compression level from 0 (fastest, no compression) to 9 (slowest, best compression)
          adaptiveFiltering: true
        })
        .toBuffer();
      fs.writeFileSync('files/t'+adding_coords+'.png', screenshotBuffer);
      const screenshotBase64 = screenshotBuffer.toString('base64');
      const screenshotOutput = `data:image/png;base64,${screenshotBase64}`;



      codeBlocks.push({ role: "user", content: [
          {
            type: "text",
            text,
          },{
            "type": "image_url",
            "image_url": {
                "url": screenshotOutput
            },
      }], perishable: 1, expire, image: 1 });

      //sleep(2222);console.log("sleep 21")
    } catch (error) {
      console.error(`${error.stack}`);
      console.error(`Failed to fetch page due to an error. Details: ${error.message}`);
      codeBlocks.push({ role: "system", content: `[Error fetching page: ${error.message}. Stack:\n${error.stack}]`, perishable: 1 });
    }
  }
  let LOOK_AT_BROWSER_FLAG=0;


  //for (let i = 1; i < pieces.length; i += 2) {
  for (let i = 0; i < pieces.length; i += 2) {
    let textPiece = "\n"+pieces[i]+"\n";
    let codePiece = pieces[i+1]||"";
    let codePiece2 = pieces[i+3]||"";

    const processCodeBlock = async () => {
      const codeBlocks = [];
      const language = codePiece.split('\n')[0];
      const code = codePiece.split('\n').slice(1).join('\n'); // not slice(1, -1) because pieces are weird: they include beginning newline but not ending one.
      const code2 = codePiece2.split('\n').slice(1).join('\n');
    
      // Match any function name within double square brackets, capturing the function name and arguments
      const actionRegex = /\n\s?\[\[([^\]]+?)(?:\s+(.*?))?\]\]/g;
      let match;
      //console.log(textPiece)
      while ((match = actionRegex.exec(textPiece)) !== null) {
        const functionName = match[1].trim();
        const argument = match[2] ? match[2].trim() : null;
        const args = argument?argument.split(";"):[];
        const filename = args[0];
        //console.log(`Detected function: ${functionName}`, argument ? `Argument: ${argument}` : 'No argument');

        //const matchResult = textPiece && ("\n"+textPiece+"\n").match(match);
        try {
          //if(exportedVars.DEBUG)console.log({matchResult})
          //const argument = matchResult[1] ? matchResult[1].trim() : null;
          console.log(`FUNCTION ${functionName}:`, argument ? `Argument: ${argument}` : 'No argument');
    
          if (functionName === 'RUN_SHELL_COMMAND') {


            const os = require('os');
            const platform = os.platform();
            let language;
            if (platform === 'win32') {
              language = 'cmd';
            } else if (platform === 'darwin') {
              language = 'sh';
            } else {
              language = 'sh';
            }
            codeBlocks.push({ language, code, filename });


          } else if (['WRITE_FILE', 'MERGE_FILE', 'APPEND_FILE'].includes(functionName)) {

            const fullPath = path.isAbsolute(filename) ? filename : path.join(exportedVars.currentWorkingDirectoryForCode, filename);
            const dirName = path.dirname(fullPath);
            let message = '[Running function: '+functionName+']';
    
            try {
              if (!fs.existsSync(dirName)) {
                fs.mkdirSync(dirName, { recursive: true });
                console.log(`Directory ${dirName} created.`);
              }
    
              if (functionName === 'WRITE_FILE') {

                fs.writeFileSync(fullPath, code);
                message = `File written to ${filename}.`;

              } else if (functionName === 'APPEND_FILE') {
                
                fs.appendFileSync(fullPath, code);
                message = `Appended to file ${filename}.`;

              } else if (functionName === 'MERGE_FILE') {
                const originalCode = fs.readFileSync(fullPath, 'utf8');
                
                const occurrences = originalCode.split(code).length - 1;
                //console.log({originalCode,code,code2,occurrences})
                if (occurrences === 1) {
                  let extractedCode = originalCode.replace(code, code2);
                  message = `Code merged to ${filename}:\n- Original code length: ${originalCode.length} \n- Updated code length: ${extractedCode.length}.\n\n`;
                  fs.writeFileSync(fullPath, extractedCode);
                } else {
                  message = `Error in MERGE_FILE: The code block to be replaced was found ${occurrences} times in the file but should be unique.`;
                }
                //const changesCode = code;
                //const extractedCode = await callMergeCode(originalCode, changesCode);
                //message = `Code merged to ${filename}:\n- Original code length: ${originalCode.length}\n- Changes code block length: ${changesCode.length}, \n- Updated code length: ${extractedCode.length}.\n\n`;
              }
            } catch (error) {
              message = `Error in executing ${functionName} (file=${filename}):\n${error}`;
            }
            console.log(message);
            codeBlocks.push({ role: "system", content: message, perishable: 1 });


          } else if (functionName=='BROWSER_OPEN_PAGE') {


            

            if(!browser || !browser.isConnected()){
              // Possible TODO: replace with Playwright for a simpler API
              const puppeteer = require('puppeteer');
              /*try {
                browser = await puppeteer.connect({browserWSEndpoint: `ws://localhost:3000`});
              } catch (error) {*/
                console.log('Starting a new browser instance.');
                browser = await puppeteer.launch({
                  headless: 0,
                  args: ['--no-sandbox', '--disable-setuid-sandbox', `--window-title=${windowTitle}`],
                  userDataDir: exportedVars.currentWorkingDirectoryForCode+'/b-puppeteer-session' // Specify the directory path to store session data
                  
                });
                browserPid = browser.process().pid; // Store the PID
                await sleep(1000);
              //}
            }

            const url = argument;
            //const { parseHtml } = require('./b-parseHtml.js');
            let header=`[Result from opening page ${url}. Note all important details for future reference - **access to the page contents will be LOST** after you finish the current reply.]`;

            console.log(`Browsing: "${url}"`);
            {


              const page = await browser.newPage();
              
              const pages = await browser.pages();
              await Promise.all(pages.slice(0, -1).map(page => page.close()));

              await page.setViewport({ width: browserW, height: browserH });
              //await page.setViewport({ width: browserW*1.5, height: browserH*1.5 });
              await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
              
              await page.goto(url, { waitUntil: ['load'], timeout: 60000 }); // Wait until the network is idle (no more than 0 connections for at least 500 ms).
              //console.log("sleeping 4"); await sleep(1000);
              const html = await page.content(); // Get the HTML content of the page.



              // await browser.close();
              // Note: Browser is not closed to reuse for future requests
              
              //const parsedHtml = parseHtml(html);
              //console.log(`Parsed HTML: ${parsedHtml}`);
              //codeBlocks.push({ role: "system", content: `[Successfully opened page ${url}. Make sure LOOK_AT_BROWSER is called so you can see page contents.]`, perishable: 1 });
              //codeBlocks.push({ role: "user", content: `${header}\n\n--------\n\n${parsedHtml}\n\n--------\n\n${header}`, expire: 1 });

              
              LOOK_AT_BROWSER_FLAG=1;

            }


          } else if (functionName=='LOOK_AT_BROWSER') {
            
            await LOOK_AT_BROWSER();


          } else if (functionName=='BROWSER_INTERACT_WITH_PAGE_HUMANLIKE') {
            
            let page = await AWAIT_BROWSER();

            if(0)args = args.map(arg => {
              let parsedInt = parseInt(arg);
              return isNaN(parsedInt) ? arg : parsedInt;
            });
            console.log('BROWSER_INTERACT_WITH_PAGE_HUMANLIKE',{args})
            async function moveMouseHumanlike(page, startX, startY, endX, endY, steps = 20) {
                for (let i = 1; i <= steps; i++) {
                    const x = startX + (endX - startX) * (i / steps) + Math.sin((Math.PI * i) / steps) * 10;
                    const y = startY + (endY - startY) * (i / steps) + Math.cos((Math.PI * i) / steps) * 10;
                    await page.mouse.move(x, y);
                    updateCursorPosition(x, y);
                    await sleep(Math.random() * 10 + i * 10 / steps);
                }
            }

            switch(args[0]){
              case "mouse.click":
                await moveMouseHumanlike(page, cursorPosition.x, cursorPosition.y, args[1], args[2]);
                await sleep(Math.random()*1100);
                await page.mouse.down();
                await sleep(Math.random()*300);
                await page.mouse.up();
                break;

                case "mouse.move":
                  await moveMouseHumanlike(page, cursorPosition.x, cursorPosition.y, args[1], args[2]);
                  break;

                case "mouse.down":
                  await sleep(Math.random(30)+30);
                  await page.mouse.down();
                  await sleep(Math.random(30)+30);
                  break;

                case "mouse.up":
                  await sleep(Math.random(30)+30);
                  await page.mouse.up();
                  await sleep(Math.random(30)+30);
                  break;
              
                case "keyboard.type":
                  await sleep(Math.random(30)+30);
                  await page.keyboard.type(args[1]);
                  await sleep(Math.random(30)+30);
                  break;
                
                case "keyboard.down":
                  await sleep(Math.random(30)+30);
                  await page.keyboard.press(args[1]);
                  await sleep(Math.random(30)+30);
                  break;
            
                case "keyboard.up":
                  await sleep(Math.random(30)+30);
                  await page.keyboard.up(args[1]);
                  await sleep(Math.random(30)+30);
                  break;
            }
            
            LOOK_AT_BROWSER_FLAG=1;


          } else if (functionName=='BROWSER_INTERACT_WITH_PAGE_JS') {
            let page = await AWAIT_BROWSER();


            const scriptToRun = `
            function _getElementsByPartialText(text, maxElements = 3){
              try {
                const tags = [...document.querySelectorAll('*')].filter(element => element.textContent.includes(text));
                const sortedTags = tags.sort((a, b) => a.outerHTML.length - b.outerHTML.length);
                return sortedTags.slice(0, maxElements);
              } catch (error) {
                console.error("Error in _getElementsByText: " + error.message);
                return [];
              }
            }

            function getDeepestElementByPartialText(text){
              let smallestTag;
              try {
                const tags = [...document.querySelectorAll('*')].filter(element => element.textContent.includes(text));
                smallestTag = tags.reduce((smallest, tag) => 
                  tag && tag.outerHTML && tag.outerHTML.length < smallest.outerHTML.length ? tag : smallest
                );
              } catch (error) {
                console.error("getDeepestElementByPartialText error. Failed to find the smallest tag due to an error: "+error.message);
                smallestTag = null; // or any fallback logic
              }
              if(!smallestTag) console.error("getDeepestElementByPartialText error. Tag not found. Try rerunning this function with less text as the argument to reduce the chance of mistakes.");
              else console.error("getDeepestElementByPartialText found a tag. (You need to check whether the desired action was completed.)");
              return smallestTag;
            }

            `+code;
            console.log(`Running JS on current page (in addition to Always Included Code): ${code}`);
            {
              let result = "";

              // Initialize an array to hold console messages
              let consoleMessages = [];
              // Define a function to handle console messages and add them to the array
              const handleConsoleMessage = msg => consoleMessages.push(msg.text());
              // Temporarily attach the console listener
              page.on('console', handleConsoleMessage);

              try {
                result = await Promise.race([
                  page.evaluate(scriptToRun),
                  new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout after 60 seconds")), 60000))
                ]);
              } catch (error) {
                result = `Timeout or error occurred: ${error.message}`;
              }

              // Detach the console listener after script execution
              page.off('console', handleConsoleMessage);

              // Combine all console messages into a single string
              let consoleOutput = consoleMessages.join('\n');

              result = cropOutputToLimit(result, outputLimit);
              consoleOutput = cropOutputToLimit(consoleOutput, outputLimit);
              let content=`[JS code executed. Return length: ${result.length}. (Make sure it's not too short - it may indicate an error.) Returned value below.]\n${result}`
              +
              `\n----\n\n\n\n[Console output length: ${consoleOutput.length}. (Make sure it's not too short - it may indicate an error.) Console output below.]\n${consoleOutput}`;
              console.log(content);
              codeBlocks.push({ role: "user", content, perishable: 1 });

              await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second

              LOOK_AT_BROWSER_FLAG=1;
              
            }


          
          }

        
                
        } catch (error) {
          console.error(`${error.stack}`);
          console.error(`Error running [[${functionName}]]. Details: ${error.message}`);
          codeBlocks.push({ role: "system", content: `[Error running [[${functionName}]]: ${error.message}]\n${error.stack}\n`, perishable: 1 });
        }
      }


    
      return codeBlocks;
    };


    
    try {
      codeBlocks.push(...await processCodeBlock());
    } catch (error) {
      let content=`[Error processing a code block: ${error.message}. Stack:\n${error.stack}\n]`;
      codeBlocks.push({ role: "system", content: content, perishable: 1 });
      console.error(content);
    }
  }

  if(LOOK_AT_BROWSER_FLAG)await LOOK_AT_BROWSER();
  //console.log(codeBlocks)

  if (
    (codeBlocks.length === 0)     &&
    !(
      LLMResponseCheckFinishedMarkers(LLMMsg)||
      terminaterunCodeBlocksFromAnswer
    )  ) {
    //if(LLMMsg.length<2000)codeBlocks.push({ role:"system", content: config.messageWasShort, expire: 3 });
    codeBlocks.push({ role:"user", content: config.noCodeMessage, expire: 2});
    codeBlocks.forEach(a=>console.log(a.content))
  }

  return codeBlocks;
};

function LLMResponseCheckFinishedMarkers(LLMMsg){
  return LLMMsg.trim().includes('[[FINISHED]]') 
  || LLMMsg.trim().includes('[[CALL_USER]]') 
  //||  LLMMsg.trim()=='';
}










let defsession = new CodeSession();
const runCodeBlocksFromAnswer = async (str, session, STATE) => {

  terminaterunCodeBlocksFromAnswer=0;
  session=session||defsession
  let codeBlocks;
  try {
    codeBlocks = await extractCodeBlocksAndMessages(str, STATE);
  } catch (error) {
    console.error(`Failed to extract code blocks: \n${error.message} \n${error.stack}`);
    codeBlocks = [{role:"user",content:"[[Error parsing the commands in your message, please try again]] \n"+`\n${error.message} \n${error.stack}`}]; // Fallback to an empty array in case of an error
  }
  const executionResults = [];
  for (let i = 0; i < codeBlocks.length; i++) {
    if(codeBlocks[i].content){
      executionResults.push(codeBlocks[i]);
      continue;
    }


    const { language, code } = codeBlocks[i];
    console.log(`Running code block #${i + 1} (${language} code):`);
    const startTime = Date.now();

    const intervalId = setInterval(() => {
      if(terminaterunCodeBlocksFromAnswer)session.abort(language);
    }, 100); // Set an interval to do nothing, just to keep the event loop busy
    let output = await session.execute_code(language, code);
    clearInterval(intervalId); // Clear the interval after the code execution
    
    const execTime = Date.now() - startTime;
    output=cropOutputToLimit(output, outputLimit);
    output = `[[Executed code block #${i + 1} (${language}) in ${execTime} ms]]\n\n"""\n` + output + `\n"""`;
    //console.log(output);
    executionResults.push({ role: 'user', content: output, perishable: 1 });
  }
  return executionResults;
};
// [[RUN_SHELL_COMMAND]]














const windowTitle = 'UniquePuppeteerWindowTitle_'+Math.random();
let browserVisible=0;
function browserVisibility(v=!browserVisible){
  browserVisible=v;
  let s=browserVisible?'show':'hide';
  console.log("Setting browser visibility to: "+s)
  controlWindowVisibility(s)
}


function controlWindowVisibility(command, titleSubstring=windowTitle) {
  const platform = os.platform();
  let cmd;

  if (platform === 'win32') {
      // Windows commands using PowerShell
      const actionCmd = command === 'show' ? 'Restore' : 'ShowMinNoActive';
      cmd = `powershell -Command "(Get-Process | Where-Object { $_.MainWindowTitle -like '*${titleSubstring}*' }).MainWindowHandle | ForEach-Object { [void] [WindowsApi.WindowShowStyle]::${actionCmd}.Invoke($_) }"`;
  } else if (platform === 'linux') {
      // Linux commands using xdotool
      const actionCmd = command === 'show' ? 'windowactivate' : 'windowminimize';
      cmd = `xdotool search --name "${titleSubstring}" ${actionCmd} %@`;
  } else if (platform === 'darwin') {
      // macOS commands using osascript
      const actionCmd = command === 'show' ? '1' : '0';
      cmd = `osascript -e 'tell application "System Events" to set visible of every process whose name contains "${titleSubstring}" to ${actionCmd}'`;
  } else {
      console.error(`Unsupported platform: ${platform}`);
      return;
  }

  exec(cmd, (error) => {
      if (error) {
          console.error(`Error controlling window visibility: ${error}`);
      }
  });
}


/**
 * Executes a shell command and returns the output as a promise.
 * @param {string} cmd The command to execute.
 * @returns {Promise<string>} The output of the command.
 */
function execShellCommand(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve(stdout ? stdout : stderr);
            }
        });
    });
}

/**
 * Checks if xdotool is installed on Linux and prompts for installation if not.
 */
async function ensureXdotoolInstalled() {
    try {
        execSync('xdotool --version', { stdio: 'ignore' });
        console.log('xdotool is installed.');
    } catch {
        console.log('xdotool is not installed. It is required for window control on Linux.');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.question('Would you like to install xdotool now? (y/n): ', async (answer) => {
            rl.close();
            if (answer.toLowerCase() === 'y') {
                console.log('Installing xdotool...');
                try {
                    await execShellCommand('sudo apt-get update && sudo apt-get install -y xdotool');
                    console.log('xdotool installed successfully.');
                } catch (error) {
                    console.error(`Failed to install xdotool: ${error}`);
                }
            } else {
                console.log('Please install xdotool manually to continue.');
            }
        });
    }
}

/**
 * Checks for osascript permissions on macOS.
 */
function checkOsascriptPermissions() {
    try {
        execSync('osascript -e \'tell application "System Events" to get name\'', { stdio: 'ignore' });
        console.log('osascript permissions are set.');
    } catch {
        console.log('osascript does not have the necessary permissions. Please ensure it has accessibility permissions in System Preferences > Security & Privacy > Privacy > Accessibility.');
    }
}

/**
 * Initializes the environment by checking for necessary tools and permissions.
 */
async function initializeEnvironment() {
    const platform = os.platform();
    if (platform === 'linux') {
        await ensureXdotoolInstalled();
    } else if (platform === 'darwin') {
        checkOsascriptPermissions();
    }
}

initializeEnvironment();







    const closeBrowser = async () => {
      if (browser) {
        console.log('Closing browser');
        await browser.close();
        browser=0;
      }
    };

    process.on('exit', closeBrowser);
    process.on('SIGINT', closeBrowser);
    process.on('SIGTERM', closeBrowser);

    if(0)process.on('uncaughtException', async (err) => {
      console.error(`Stack Trace: \n${err.stack}\n\n`)
      console.error(`Uncaught Exception: ${err.message}`);
      await closeBrowser();
      process.exit(1); // Exit the process after handling the exception
    });






module.exports = {shell, cmd, CodeSession, 
   getUserInfoString, getVisibleFiles,
   moveOrCopyBetweenDirs, getProjectFileTree, 
   runCodeBlocksFromAnswer, extractCodeBlocksAndMessages, terminaterunCodeBlocksFromAnswerF,
   exportedVars, setGlobalVariable, LLMResponseCheckFinishedMarkers, browserVisibility};

