/*
(07.02.2024)
This JavaScript file implements a command-line interface (CLI) for interacting with an AI model via OpenAI's API. 
It includes functionality for:
- Reading and parsing configuration from a YAML file.
- Managing a conversation history with the AI, including compressing the history to manage size.
- Handling user input from the command line in real-time, including buffering input for processing.
- Making asynchronous calls to the OpenAI API to generate responses based on the input and conversation history.
- Handling retries with exponential backoff in case of API call failures.
- Terminating ongoing tasks and gracefully shutting down upon receiving a SIGINT (Ctrl+C).
*/

let DEBUG=0;

const fs = require('fs');
const yaml = require('js-yaml');
let config;
let loadConfig=() => {
  config = yaml.load(fs.readFileSync('config.yaml', 'utf8'));
};
loadConfig();
if (!fs.existsSync('files')) {
  fs.mkdirSync('files');
}



const projectFileTreeLengthLimit=config.projectFileTreeLengthLimit;



//setInterval(loadConfig, 1000); //uncommenting causes model to get reset
const coderunner = require('./b-coderunner');
const { OpenAI } = require('openai');
const openai = new OpenAI({ baseURL:config.baseURL, apiKey: config.apiKey||process.env.OPENAI_API_KEY });
const readline = require('readline');
const l = console.log;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let autonomousRuns = -1;
let doNotCallLLM=0;





class LLM {
  OBSERVE="[[OBSERVE]]";

  constructor(openai) {
    this.resetState();
    this.openai = openai;
    this.callCount=0;
    let systemMessageUnchangingPart = '';
    try {
      systemMessageUnchangingPart = config.system_message || '';
      systemMessageUnchangingPart+="\n\n"+coderunner.getUserInfoString();
    } catch (e) {
      console.error('Failed to obtain system message', e);
    }
    let systemMessage = systemMessageUnchangingPart;
    this.history = [
      { role: 'system', content: systemMessage }
    ];
    this.isTerminating = false;
  }

  resetState(){
    this.STATE={
    }
  }
  calculateHistoryLength(history, filterF) {
    if(filterF)history=history.filter(filterF);
    return history.reduce((acc, message) => {
      let contentLength = typeof message.content === 'string' ? message.content.length : message.content.reduce((total, item) => {
        if (item.type === 'image_url') {
          return total + 765; // Consider each image_url content as 765 length
        } else if (item.text) {
          return total + item.text.length;
        }
        return total;
      }, 0);
      return acc + contentLength + message.role.length;
    }, 0);
  }
  rewriteHistory(history) {
    let historyLength;
    while ((historyLength = this.calculateHistoryLength(history, message=>message.perishable)) > config.assistantMessagesLengthLimit) {
      const firstAssistantMessageIndex = history.findIndex(message => message.perishable);
      if (firstAssistantMessageIndex !== -1) {
        console.log("Dropping an perishable message with length",history[firstAssistantMessageIndex].content.length,"because perishable history part length is",historyLength)
        history.splice(firstAssistantMessageIndex, 1);
      } else {
        break; // No more messages to remove
      }
    }
    return history;
  }

  async compressHistoryTail() {//unfinished
    let historyLength = this.calculateHistoryLength(this.history, 'assistant');
    if (historyLength > config.assistantMessagesLengthLimit) {
      let halfLength = 0;
      let newHistory = [];
      for (let i = 0; i < this.history.length; i++) {
        if (this.history[i].role === 'assistant') {
          halfLength += this.history[i].content.length + this.history[i].role.length;
          if (halfLength < historyLength / 2) {
            newHistory.push(this.history[i]);
            this.history.splice(i, 1);
            i--; // Adjust index after removal
          } else {
            break;
          }
        }
      }
    }
  }

  async call(input) {
    if(!this.STATE)console.error({input},"LLM.call: this.STATE unavailable")
      
    let insert=[{ role: 'system', expire: 1, content: "[Below are the up-to-date contents of CODEBASE FILE TREE. CWD: "+coderunner.exportedVars.currentWorkingDirectoryForCode+"]\n" + 
    await coderunner.getProjectFileTree({maxDepth:3,outputLimit:projectFileTreeLengthLimit,includeLangFilesOnly:0}) }, 
    ...coderunner.getVisibleFiles(undefined, this.STATE)];
    if(0){
      this.history.push(...insert);
    }else{
      this.history.splice(1, 0, ...insert);
    }
    // codebase knowledge above
        //this.history.push({ role: 'system', expire: 1, content: "List surprising events, if any. Then, or if none, proceed with the task."});

    if (input) this.history.push({ role: 'user', content: input });
    this.history = this.rewriteHistory(this.history);


    // block to handle removal of excessive images
    let imageMessages = this.history.filter(msg => msg.image === 1); 
    const maxImages=3; // 2 normal + 1 with coords
    if (imageMessages.length > maxImages) {
      let messagesToDelete = imageMessages.length - maxImages;
      for (let i = 0; i < this.history.length && messagesToDelete > 0; i++) {
        if (this.history[i].image === 1) {
          this.history.splice(i, 1);
          i--; // Adjust index after removal
          messagesToDelete--;
        }
      }
    }

    const historyFilePath = coderunner.exportedVars.currentWorkingDirectoryForCode.replace(/[\/\\]$/, "")+".yaml";
    fs.writeFileSync(historyFilePath, yaml.dump({STATE:this.STATE,history:this.history}));


    
    if(this.isTerminating){
      console.log("Prevented LLM call")
      this.isTerminating=0;
      return;
    }
    let fullResponse = await this.callOpenAI(this.history, 1, 1);



    if(fullResponse){
      if(fullResponse.length>2){
        fullResponse+="\n"+this.OBSERVE;
        console.log(this.OBSERVE)
      }
      this.history.push({ role: 'assistant', content: fullResponse, perishable:1 });
    } 

    // block to handle expiration of messages
    for (let index = 0; index < this.history.length; index++) {
      const item = this.history[index];
      if (item.expire !== undefined) {
        item.expire--;
        if (item.expire <= 0) {
          this.history.splice(index, 1);
          index--; // Adjust index after removal to maintain correct iteration
        }
      }
    }



    this.callCount++;
    return fullResponse;
  }

  async callOpenAI(messages, attempt = 1, print = 0) {

    let model=config.model;
    if(model=="cycle")
      model = config.models_if_cycle[this.callCount%config.models_if_cycle.length];

    if(model=="gpt-4-turbo-preview")
      if(messages.some(message => message.image)){
        console.log("Switching model to gpt-4-vision-preview for image content.");
        model="gpt-4-vision-preview";
      }

    
    // Copy messages, loop through them, only leave role and content
    messages = messages.map(message => ({
      role: message.role,
      content: message.content
    }));
    //if (DEBUG) console.log(messages);

    console.log("\n\n\n\nNew OpenAI call. Model:",model,"Total context length:",this.calculateHistoryLength(messages));

    this.isTerminating=0;
    let fullResponse = "";
  
    try {
      const stream = await this.openai.chat.completions.create({
        model: model,
        messages: messages,
        stream: !model.startsWith('vis-'),
        temperature: config.temperature || 0,
        stop: this.OBSERVE,
        //request_timeout: 300
      });
  
      if (!stream[Symbol.asyncIterator]) {  // if 'stream' is just a response and not a stream
        fullResponse = stream.choices[stream.choices.length - 1].message.content;
        console.log(fullResponse);
        if (this.isTerminating) {
          this.isTerminating = 0;
        }
      }else
      for await (const chunk of stream) {
        const response = chunk.choices[0]?.delta?.content || '';
        fullResponse += response;
        if(print) process.stdout.write(response);
        if (this.isTerminating) {
          stream.controller.abort();
          this.isTerminating=0;
          break;
        }
      }


    } catch (error) {
      if (!this.isTerminating) {
        const delayTime = Math.min(1000 * (2 ** attempt), 300000); // Exponential backoff with a cap
        console.error(`An error occurred while processing the stream: ${error}. Retrying in ${delayTime / 1000}s`);
        await sleep(delayTime);
        return this.callOpenAI(messages, attempt + 1, print).catch(console.error);
      }
    }
  
    if(print) process.stdout.write('\n');
    return fullResponse;
  }


  terminate() {
    this.isTerminating = true;
  }
}





const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let task = null;
let inputQueue = [];
let llm = new LLM(openai);
let inputBuffer = []; // Buffer to hold lines of input
let inputTimer; // Timer for tracking input pause

const inputTimeout = 100; // 100ms timeout to wait for additional input

rl.on('line', (input) => {
  clearTimeout(inputTimer); // Clear existing timer on new input

  if(input[0] == "%") {
    const payload = input.substring(1).split(" ");
    const command = payload[0];
    const commands = {
      "openconfig": () => {
        const { exec } = require('child_process');
        const configPath = `${process.cwd()}/config.yaml`;
        exec(`start ${configPath.replace(/\//g, '\\')}`, (error) => {
          if (error) {
            console.error(`Could not open config: ${error}`);
          } else {
            console.log(`Config opened: ${configPath}`);
          }
        });
      },
      "reset": () => {llm.history = llm.history.slice(0, 1); llm.resetState()},
      "debug": () => {
        DEBUG=!DEBUG;
        coderunner.setGlobalVariable('DEBUG',DEBUG);
        console.log("debug mode",(DEBUG))
      },
      "outputstate": () => {
        console.log(llm.STATE)
      },
      "cd": () => {
        if (payload[1] && payload[1].trim()) {
          coderunner.exportedVars.currentWorkingDirectoryForCode = `${process.cwd()}/files/${payload[1]}`;
          console.log("CWD changed to:", coderunner.exportedVars.currentWorkingDirectoryForCode);
        } else {
          console.log("No directory specified.");
        }
      },
      "dir": () => {
        console.log("Current CWD:", coderunner.exportedVars.currentWorkingDirectoryForCode);
      },
      "clonedir": () => {
        if (payload[1] && payload[1].trim()) {
          const fromPath = `${process.cwd()}/files/${payload[1]}`;
          const clonePath = coderunner.exportedVars.currentWorkingDirectoryForCode;
          console.log("Cloning directory from:", fromPath,"to:",clonePath);
          coderunner.moveOrCopyBetweenDirs(fromPath,clonePath,1);
        } else {
          console.log("No target directory specified for cloning.");
        }
      },
      "opendir": () => {
        const { exec } = require('child_process');
        let dirPath = coderunner.exportedVars.currentWorkingDirectoryForCode;
        exec(`start ${dirPath.replace(/\//g, '\\')}`, (error) => {
          if (error) {
            console.error(`Could not open directory: ${error}`);
          } else {
            console.log(`Directory opened: ${dirPath}`);
          }
        });
      },


      "FLUSHALLDIRS": () => {coderunner.moveOrCopyBetweenDirs("./files","./files_old",0);process.exit()},
      //"browser": () => console.log(  coderunner.browserVisibility() ),


      "model": () => console.log(  (payload[1] && payload[1].trim())?config.model = payload[1]:"Model not specified"  ),
      "cycle": () => console.log(config.model = "cycle"),
      "gpt": () => console.log(config.model = "chatgpt-4o-latest"),
      "4l": () => console.log(config.model = "chatgpt-4o-latest"),
      "4o": () => console.log(config.model = "gpt-4o"),
      "4t": () => console.log(config.model = "gpt-4-turbo-preview"),
      "4": () => console.log(config.model = "gpt-4"),
      "3": () => console.log(config.model = "gpt-3.5-turbo"),
      "claude": () => console.log(config.model = "anthropic/claude-3.5-sonnet"),
      "s": () => console.log(config.model = "anthropic/claude-3.5-sonnet"),
      "opus": () => console.log(config.model = "anthropic/claude-3-opus"),
      "sonnet": () => console.log(config.model = "anthropic/claude-3.5-sonnet"),
      "gp": () => console.log(config.model = "google/gemini-pro"),
    };

    if (commands[command]) {
      return commands[command]();
    } else {
      return console.log(`Unknown command: ${command}. Available commands: ${Object.keys(commands).join(", ")}`);
    }

    input='';
  }else
  inputBuffer.push(input); // Add the current line to the buffer

  inputTimer = setTimeout(async () => {
    let combinedInput = inputBuffer.join('\n'); // Combine all buffered lines into a single input
    inputBuffer = []; // Clear the buffer for the next input
    autonomousRuns=0;
    if (!task) {
      doNotCallLLM=0;
      task = processInput(combinedInput, llm.STATE);
      //console.log(1,llm.STATE)
    } else {
      inputQueue.push(combinedInput);
    }
    rl.prompt();
  }, inputTimeout);
});

async function processInput(input, STATE) {
 if(!STATE)console.error({input},"processInput: STATE unavailable")

    
  console.log("\n",'-'.repeat(process.stdout.columns-2),"\n");

  let response = await llm.call(input);

  console.log("\n",'-'.repeat(process.stdout.columns-2),"\n");

  if(!task)return;

  let historyBlocks = await coderunner.runCodeBlocksFromAnswer(response, undefined, STATE);
  llm.history.push(...historyBlocks);

  let breakLoop// = response.trim().endsWith("[[CALL_USER]]") || response.trim().endsWith("[[FINISHED]]")
  breakLoop = coderunner.LLMResponseCheckFinishedMarkers(response);

  //historyBlocks.length>0 && 
  if(!breakLoop) {
    console.log("\n",'-'.repeat(process.stdout.columns-2),"\n");

    autonomousRuns++;
    if (autonomousRuns >= config.autonomousRunningLimit) {
      console.log("[Lengths of messages in history]")
      llm.history.forEach(item => {
        console.log(`${item.role}: ${item.content.length}`);
      });
      console.log("Autonomous run limit reached. Please provide new input.");
    }else if (doNotCallLLM){
      console.log("Avoided LLM call.");
      doNotCallLLM=0;
    }else       return processInput(undefined, STATE);
  }
  task = null;
  if (inputQueue.length > 0) {
    let nextInput = inputQueue.shift();
    task = processInput(nextInput, STATE);
  }
}

rl.on('SIGINT', () => {
  clearTimeout(inputTimer); // Ensure to clear the timer on SIGINT
  if (task) {
    inputQueue=[];
    llm.terminate();
    coderunner.terminaterunCodeBlocksFromAnswerF();
    doNotCallLLM=1;
    console.log("")
    console.log("Terminating task...")
    console.log("")
    task=null;
  } else {
    process.exit();
  }
});

rl.prompt();


if (process.argv[2]) {
    rl.emit('line', process.argv[2].split("<newline>").join("\n"));
}
if (process.argv[3]) {
    rl.emit('line', fs.readFileSync(process.argv[3], 'utf8'));
}