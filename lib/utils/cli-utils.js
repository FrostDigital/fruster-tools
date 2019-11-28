const log = require("../log");

/**
 *
 * @param {any} argument
 * @param {*} program
 * @param {string} errorMsg
 */
function validateRequiredArg(argument, program, errorMsg) {
	if (!argument) {
		log.error(errorMsg);
		program.outputHelp();
		process.exit(1);
	}
}

module.exports = {
	validateRequiredArg
};
