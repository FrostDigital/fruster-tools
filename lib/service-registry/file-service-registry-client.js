const fs = require("fs");
const utils = require("../utils");

module.exports =  {
	get: get,
	isValid: isValid
};

function get(path) {	
	const serviceReg = utils.readFile(path, true);

	if(!serviceReg) {		
		throw new Error("Invalid or missing service registry (is JSON valid?)");
	}
	
	return Promise.resolve(serviceReg);
}

function isValid(path) {	
	try {
		const stat = fs.lstatSync(path);
		return stat.isFile() || stat.isSymbolicLink();
	} catch(ex) {
		return false;
	}
}