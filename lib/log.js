module.exports = {

	debug: () => {
		if(process.env.DEBUG) {
			console.log('yup');
	    	console.log.apply(console, arguments);			
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