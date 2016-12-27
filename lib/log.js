module.exports = {

	debug: (msg) => {
		if(process.env.DEBUG) {
			// TODO: Fix this
	    	//console.log.apply(console, arguments)
	    	console.log(msg);
		}
	},

	info: () => {
		console.log.apply(console, arguments);
	},

	warn: () => {
		console.log.apply(console, arguments);
	},

	error: () => {
		console.log.apply(console, arguments);
	}

}