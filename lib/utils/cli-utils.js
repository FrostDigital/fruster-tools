const log = require("../log");
const { table, getBorderCharacters } = require("table");

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

/**
 *
 * @param {string[][]} rows
 */
function printTable(rows) {
	console.log(
		table(rows, {
			border: getBorderCharacters(`void`),
			drawHorizontalLine: () => {
				return false;
			},
			columnDefault: {
				paddingLeft: 0,
				paddingRight: 3
			}
		})
	);
}

module.exports = {
	validateRequiredArg,
	printTable
};
