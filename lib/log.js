module.exports = {

	debug: (msg) => {
		if(process.env.DEBUG) {
			// TODO: Fix this
	    	//console.log.apply(console, arguments)
	    	console.log(msg);
		}
	},

	info: (msg) => {
		console.log(msg);
	},

	warn: () => {
		console.log.apply(console, arguments);
	},

	error: (msg) => {
		//console.log.apply(console, arguments);
		console.error(msg);
	}

}