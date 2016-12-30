//const cmd = require("../cmd");
const path = require("path");
const fs = require("fs");

const frusterHome = process.env.FRUSTER_HOME || path.join(os.homedir(), ".fruster");


let conf = {};
module.exports = conf;

conf.getFrusterConfig = (name) => {

  // First check if fruster-{name}.json exists
  let config = loadConfig(`fruster-${name.toLowerCase()}.json`);

  if(!config) {
    // Fallback to frusters.json
    let configs = loadConfig(`frusters.json`);
    
    if(configs) {
      config = configs[name];
    }
  }

  if(!config) {
    console.log("ERROR: Failed to read config for fruster", name);
    throw new Error("Failed to get config");
  }

  return config;
};


function loadConfig(filename) {
  const filePath = path.join(frusterHome, filename);

  try {
    if(fs.lstatSync(filePath).isFile()) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }    
  } catch(ex) {
    return null;
  }
}
