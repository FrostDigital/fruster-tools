import * as log from "../log";
const { table, getBorderCharacters } = require("table");
import { getNamespaceForApp } from "../kube/kube-client";
const inquirer = require("inquirer");
const username = require("username");
import { Command } from "commander";

export function validateRequiredArg(argument: string | number, program: Command, errorMsg: string) {
	if (!argument) {
		log.error(errorMsg);
		program.outputHelp();
		process.exit(1);
	}
}

export function printTable(rows: string[][], header?: string[]) {
	if (header) {
		rows = [header, ...rows];
	}

	if (!rows.length) {
		// console.log("n/a");
		return;
	}

	console.log(
		table(rows, {
			border: getBorderCharacters(`void`),
			drawHorizontalLine: () => {
				return false;
			},
			columnDefault: {
				paddingLeft: 0,
				paddingRight: 3,
			},
		})
	);
}

export async function getOrSelectNamespace(appName: string) {
	const namespaces = await getNamespaceForApp(appName);

	if (!namespaces.length) {
		log.error("Could not find app " + appName + " - does the app exist?");
		return process.exit(1);
	}

	if (namespaces.length === 1) {
		return namespaces[0];
	} else {
		const { namespace } = await inquirer.prompt([
			{
				type: "list",
				name: "podName",
				choices: namespaces.map((namespace: string) => {
					return {
						value: namespace,
					};
				}),
				message: "App exists in multiple namespaces, select namespace",
			},
		]);

		return namespace;
	}
}

export function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getUsername() {
	return username();
}
