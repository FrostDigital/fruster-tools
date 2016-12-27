const fs = require("fs");

module.exports =  {
	get: get,
	isValid: isValid
};

function get(path) {
	const registry = fs.readFileSync(path);

	try {
		return JSON.parse(registry)		
	} catch(ex) {
		console.error("Invalid service registry (is JSON valid?)");
		throw ex;
	}

}

function isValid(path) {	
	try {
		const stat = fs.lstatSync(path);
		return stat.isFile() || stat.isSymbolicLink();
	} catch(ex) {
		return false;
	}
}