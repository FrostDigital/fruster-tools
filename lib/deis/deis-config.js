const path = require("path");
const os = require("os");
const utils = require("../utils");
const conf = require("../../conf");

module.exports = {

	activeConfig: () => {	  
	  let config = loadConfig("client.json");

	  if(!config) {    
	    throw new Error("Failed to get deis config");
	  }

	  return config;
	}

};


function loadConfig(filename) {
  return utils.readFile(path.join(conf.deisHome, filename), true);  
}
