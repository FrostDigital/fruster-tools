const log = require("../log");
const { table, getBorderCharacters } = require("table");
const { getNamespaceForApp } = require("../kube/kube-client");
const inquirer = require("inquirer");
const username = require("username");

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
 * @param {string[]|null} header
 */
function printTable(rows, header = null) {
	if (header) {
		rows = [header, ...rows];
	}

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

/**
 *
 * @param {string} appName
 */
async function getOrSelectNamespace(appName) {
	const namespaces = await getNamespaceForApp(appName);

	if (!namespaces.length) {
		log.error("Could not find app " + appName + " - does the app exist?");
		return process.exit(1);
	}

	if (namespaces.length === 1) {
		return namespaces;
	} else {
		const { namespace } = await inquirer.prompt([
			{
				type: "list",
				name: "podName",
				choices: namespaces.map(namespace => {
					return {
						value: namespace
					};
				}),
				message: "App existists in multiple namespaces, select namespace"
			}
		]);

		return namespace;
	}
}

async function getUsername() {
	return username();
}

module.exports = {
	validateRequiredArg,
	printTable,
	getOrSelectNamespace,
	getUsername
};
