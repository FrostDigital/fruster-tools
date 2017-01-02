const fs = require("fs");
const utils = require("../utils");
const git = require("../git");

module.exports =  {
	get: get,
	isValid: isValid
};

function get(path) {	
	//const serviceReg = utils.readFile(path, true);

	
	
	return serviceReg;
}

function isValid(path) {	
	return path.split("/").length == 2 || path.indexOf("git://") == 0;	
}