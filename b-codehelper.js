const fs = require('fs');
const yaml = require('js-yaml');
const config = yaml.load(fs.readFileSync('config.yaml', 'utf8'));


let exportedVars = { 
  currentWorkingDirectoryForCode:null,
  DEBUG:0
};


function extractFunctionsAndCodeBlocks(text) {
  const extracted = [];
  const lines = text.split('\r\n').join('\n').split('\n');
  let currentFunction = null;
  let collectingArgs = false;
  let collectingCodeBlock = false;
  let argsBuffer = '';
  let code_blockBuffer = '';
  let language = '';

  lines.forEach(line => {
      //console.log(line)
      if(collectingArgs || collectingCodeBlock){
          // noop
      }else       if (line.startsWith('FUNCTION:')) {
        const functionNameMatch = line.match(/FUNCTION:\s*(\w+)\s*/);
        currentFunction = functionNameMatch[1];
        collectingArgs = true;
        argsBuffer = '';
        return;
      }else         if (line.startsWith('```')) {
        language = line.match(/```(\w*)/)[1];
        collectingCodeBlock = true;
        code_blockBuffer = [];
        return;
      }


    if (collectingArgs) {
      if (line.trim()=='FUNCTION_END') {
          argsBuffer+=""
          //console.log(argsBuffer)
        collectingArgs = false;
        if(exportedVars.DEBUG)console.log({argsBuffer})
        extracted.push({
            name: currentFunction,
            args: yaml.load(argsBuffer)
        });
      }
      argsBuffer += line+"\n";
    } else if (collectingCodeBlock) {
      if (line.trim()=='```') {
          collectingCodeBlock = false;
        extracted.push({
            code: code_blockBuffer.join('\n'),
            language
        });
      }else
        code_blockBuffer.push(line);
    }
  });


  return extracted;
}






const { OpenAI } = require('openai');
const openai = new OpenAI({ baseURL:config.baseURL, apiKey: config.apiKey||process.env.OPENAI_API_KEY });
async function callOpenAI(messages, attempt = 1, print = 0, modelOrModelIndex=0) {
  let model = typeof modelOrModelIndex === 'string'
   ? 
  modelOrModelIndex
   : 
  config.merge_code_models[
    modelOrModelIndex % config.merge_code_models.length
  ];
  // Copy messages, loop through them, only leave role and content
  messages = messages.map(message => ({
    role: message.role,
    content: message.content
  }));
  if (exportedVars.DEBUG) console.log(messages);
  console.log("New OpenAI call from coderunner. Model:",model);

  //this.isTerminating=0;
  let fullResponse = "";

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minutes timeout

    const stream = await openai.chat.completions.create({
      model: model,
      messages: messages,
      stream: true,
      temperature: config.temperature || 0,
      stop: null
    }, { signal: controller.signal });

    for await (const chunk of stream) {
      const response = chunk.choices[0]?.delta?.content || '';
      fullResponse += response;
      if(print) process.stdout.write("\x1b[90m" + response + "\x1b[0m");
    }

    clearTimeout(timeoutId); // Clear the timeout if the operation completes before the timeout
  } catch (error) {
    if (1||!this.isTerminating) {
      const delayTime = Math.min(1000 * (2 ** attempt), 300000); // Exponential backoff with a cap
      console.error(`An error occurred while processing the stream: ${error}. Retrying in ${delayTime / 1000}s`);
      await sleep(delayTime);
      return callOpenAI(messages, attempt + 1, print, modelOrModelIndex).catch(console.error);
    }
  }

  if(print) process.stdout.write('\n');
  return fullResponse;
}


const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const prepareCodeBlock=code=>code.split("\n").map(line => line.split("¦").pop() || "").join("\n");

let llmCallables={
  DELETE_LINES: (args, originalCodeArr)=>{
    let{from_line_inclusively, to_line_inclusively}=args;
    console.log("DELETE_LINES",{from_line_inclusively, to_line_inclusively})
    // Set the specified range of lines to null
    for (let i = from_line_inclusively-1; i <= to_line_inclusively-1; i++) {
      originalCodeArr[i] = null;
    }
    return originalCodeArr;
  }
  ,
  INSERT_NEXT_CODEBLOCK: (args, originalCodeArr)=>{
    let{at_line}=args;
    console.log("INSERT_NEXT_CODEBLOCK",{at_line})
    let ending = originalCodeArr[at_line - 1];
    if(ending === null || ending===undefined)ending = '';
    else ending="\n"+ending;

    let code=args.new_code_block;
    code = prepareCodeBlock(code);
    originalCodeArr[at_line - 1] = code+ending;
    return originalCodeArr;
  }
  ,

  REPLACE_LINES: (args, resultingCode)=>{
    let { replaced_original_code_block, new_code_block } = args;
    replaced_original_code_block = prepareCodeBlock(replaced_original_code_block);
    new_code_block = prepareCodeBlock(new_code_block);

    //console.log({replaced_original_code_block,len:replaced_original_code_block.length})

    // count occurences
    let occurrences = 0;  
    let startIndex = 0;
    let index;
    while ((index = resultingCode.indexOf(replaced_original_code_block, startIndex)) !== -1) {
      occurrences++;
      startIndex = index + 1//replaced_original_code_block.length;
    }

    if(new_code_block===undefined)
      throw new Error("Error merging: new_code_block===undefined");

    if(!replaced_original_code_block)
      throw new Error("Error merging: !replaced_original_code_block");


    if(occurrences==1)
      resultingCode=resultingCode.replace(replaced_original_code_block, new_code_block);
    else
      throw new Error("Error merging: multiple occurrences found or no matching code to replace. occurrences="+occurrences);

    console.log(`REPLACE_LINES`,{occurrences});

    return resultingCode;
  }
,







  REPLACE_LINES_WITH_NEXT_CODEBLOCK: (args, originalCodeArr)=>{ // unfinished
    args.replaced_original_code_block=prepareCodeBlock(args.replaced_original_code_block)
    args.new_code_block=prepareCodeBlock(args.new_code_block)

    // Find original code 
    let from_line_inclusively=-1, to_line_inclusively=-1, trackedNeedleLine=0;
    for (let i = 0; i < originalCodeArr.length; i++) {
      originalLine=originalCodeArr[i];
      if (originalLine === undefined) continue;
      
      for(let r=0;r<2;r++){ // to handle situations where search 
        if(originalLine!==args.replaced_original_code_block[trackedNeedleLine])trackedNeedleLine=0;
        else{

        }
      }
    }
    let originalCodeIndex = originalCodeArr.findIndex(line => line === args.replaced_original_code_block[0]);
    let originalCodeEndIndex = originalCodeIndex + args.replaced_original_code_block.length - 1;
    args.from_line_inclusively = originalCodeIndex + 1;
    args.to_line_inclusively = originalCodeEndIndex + 1;

    
    console.log("REPLACE_LINES_WITH_NEXT_CODEBLOCK")
    
    originalCodeArr=llmCallables.DELETE_LINES(args, originalCodeArr);
    originalCodeArr=llmCallables.INSERT_NEXT_CODEBLOCK(args, originalCodeArr);
    return originalCodeArr;
  }
}
llmCallables.INSERT_CODEBLOCK=llmCallables.INSERT_NEXT_CODEBLOCK;


async function callMergeCode(originalCode, mergeCode, attempt=1) {
  console.log("callMergeCode",{attempt})

  
  let originalCodeArr=originalCode.replace(/\r\n/g, "\n").split("\n");
  
  let originalCodeInput = originalCodeArr.map((a,i)=>`${i+1}¦${a}`).join("\n");
  if(exportedVars.DEBUG) 
    console.log(originalCodeInput)

  const messages = [
    {role: "system", content: config.merge_code_system_message},
    {role: "user", content: "Original code:\n```\n" + originalCodeInput + "\n```"},
    {role: "user", content: "Changes:\n```\n" + mergeCode + "\n```"}
  ];

  
  let llmAnswer = (await callOpenAI(messages, 1, 1, attempt-1)), resultingCode;


  try {
    let extracts = extractFunctionsAndCodeBlocks(llmAnswer);
    let callableFunctions = [];
  
    for(let i=0;i<extracts.length;i++){
      let extract = extracts[i];
      if(extract.name){
        let args=extract.args;
        args.code_block=extracts[i+1]&&extracts[i+1].code; // toggle between PREV / NE.XT code block here
        // Store callable function with its arguments without calling it immediately
        callableFunctions.push({ name: extract.name, args: args, i });
      }
    }
  
    // Sort callable functions, INSERT operations first
    callableFunctions.sort((a, b) => {
      if (a.name.startsWith("INSERT") && !b.name.startsWith("INSERT")) return -1;
      if (!a.name.startsWith("INSERT") && b.name.startsWith("INSERT")) return 1;
      return a.i-b.i;
    });
  
    // Execute the sorted callable functions
    callableFunctions.forEach(func => {
      if (func.name.startsWith("INSERT")) {
        originalCodeArr = llmCallables[func.name](func.args, originalCodeArr);
      }
    });

    resultingCode = originalCodeArr.filter(line => line !== null).join("\n");

    callableFunctions.forEach(func => {
      if (!func.name.startsWith("INSERT")) {
        resultingCode = llmCallables[func.name](func.args, resultingCode);
      }
    });
  
    fs.writeFileSync("files/debug.txt", yaml.dump({ originalCodeInput, mergeCode, llmAnswer, resultingCode }));
    return resultingCode;
  } catch (error) {
    fs.writeFileSync("files/debug.txt", yaml.dump({ originalCodeInput, mergeCode, llmAnswer, resultingCode }));
    console.error({ error })
    console.error("Error extracting code. Attempt:", attempt);
    if (attempt < 3) {
      return await callMergeCode(originalCode, mergeCode, attempt + 1);
    } else {
      throw new Error("Merge error. (Maximum extraction attempts exceeded.) "+error);
    }
  }
}

(async a=>{
  let fs = require('fs');
  let originalCode = fs.readFileSync('coderunner.py', 'utf8');
  let changesCode = fs.readFileSync('coderunner_test.py', 'utf8');
  let resultingCode=(await callMergeCode(originalCode, changesCode));
  console.log(resultingCode)
  console.log(`Length of original code: ${originalCode.length}`);
  console.log(`Length of changes: ${changesCode.length}`);
  console.log(`Length of resulting code: ${resultingCode.length}`);
})





module.exports={extractFunctionsAndCodeBlocks, callOpenAI, callMergeCode,
  exportedVars}