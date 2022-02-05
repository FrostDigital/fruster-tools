import chalk from "chalk";
import { Command } from "commander";
import readline from "readline";
import { getBorderCharacters, table } from "table";
import { getNamespaceForApp } from "../kube/kube-client";
import * as log from "../log";
import inquirer from "inquirer";
import username from "username";
import enquirer from "enquirer";

// @ts-ignore: Missing typdefs
const { Form } = enquirer;

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

export function clearScreen() {
	if (!process.stdout.isTTY) return;
	process.stdout.write("\x1bc");
}

export async function pressEnterToContinue() {
	return new Promise<string>((resolve) => {
		const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

		rl.question(chalk.dim("\nPress enter to continue"), (a) => {
			resolve(a);
			rl.close();
		});
	});
}

export async function formPrompt<T>({
	message,
	choices,
	hint,
}: {
	message: string;
	hint?: string;
	choices: {
		name: string;
		message: string;
		initial?: string;
		validate?: (value: string) => boolean | string;
	}[];
}): Promise<T> {
	const form = await new Form({
		name: message,
		hint,
		message,
		align: "left",
		validate: async (answers: any, form: any) => {
			let msgs: string[] = [];

			for (const c of form.choices) {
				if (!c.validate) continue;

				const res = c.validate(answers[c.name]);

				if (typeof res === "string") {
					msgs.push(res);
				}
			}

			return msgs.length > 0 ? ["Format contains errors:\n", ...msgs].join("\n 💥 ") + "\n\n" : true;
		},
		choices,
	}).run();

	return form;
}
