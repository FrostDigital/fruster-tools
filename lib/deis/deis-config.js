const path = require("path");
const fs = require("fs");
const os = require("os");

const deisHome = process.env.DEIS_HOME || path.join(os.homedir(), ".deis");

let conf = {};
module.exports = conf;

conf.activeConfig = () => {
  
  let config = loadConfig("client.json");

  if(!config) {    
    throw new Error("Failed to get deis config");
  }

  return config;
};

function loadConfig(filename) {
  const filePath = path.join(deisHome, filename);
  try {
    if(fs.lstatSync(filePath).isFile() || fs.lstatSync(filePath).isSymbolicLink()) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }        
  } catch(ex) {    
    return null;
  }
}
