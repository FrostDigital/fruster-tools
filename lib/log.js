const term = require("terminal-kit").terminal;

module.exports = {

	debug: (msg) => {
		if(process.env.DEBUG) {			
	    	console.log(msg);
		}
	},

	info: (msg) => {		
		term.cyan(msg + "\n");
	},

	warn: (msg) => {
		term.brightYellow("WARNING: " + msg + "\n");		
	},

	error: (msg) => {
		term.red("ERROR: " + msg + "\n");		
	}

}