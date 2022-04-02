import chalk from "chalk";
import { Command } from "commander";
import enquirer from "enquirer";
import inquirer from "inquirer";
import readline from "readline";
import { getBorderCharacters, table } from "table";
import username from "username";
import { maskStr } from "./string-utils";
import { getNamespaceForApp, getNamespaces } from "../kube/kube-client";
import * as log from "../log";
import childProcess from "child_process";
import fs from "fs";
import tmp from "tmp";

// @ts-ignore: Missing typdefs
const { Form, Password } = enquirer;

export const EDIT_GLOBAL_CONFIG_WARNING =
	"#\n# WARNING: Changing global config will potentially affect all apps in same namespace.\n";

export const EDIT_GLOBAL_SECRECTS_WARNING =
	"#\n# WARNING: Changing global secrets will potentially affect all apps in same namespace.\n# Masked values will remain as-is.\n#";

export function validateRequiredArg(argument: string | number, program: Command, errorMsg: string) {
	if (!argument) {
		log.error(errorMsg);
		program.outputHelp();
		process.exit(1);
	}
}

export function printTable(rows: string[][], header?: string[], border?: boolean) {
	if (header) {
		rows = [header, ...rows];
	}

	if (!rows.length) {
		// console.log("n/a");
		return;
	}

	console.log(
		table(rows, {
			border: getBorderCharacters(border ? "norc" : "void"),
			drawHorizontalLine: (i) => {
				if (header && border) {
					return i <= 1 || i === rows.length;
				}

				return border ? i === 0 || i === rows.length : false;
			},
			columns: [
				{
					width: 50,
				},
				{
					width: 150,
				},
			],
			columnDefault: {
				paddingLeft: 0,
				paddingRight: 3,
				wrapWord: false,
			},
		})
	);
}

export async function getOrSelectNamespaceForApp(appName: string) {
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
				pageSize: 20,
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

/**
 * Renders a list where user can select namespace.
 * @returns
 */
export async function selectNamespace({
	message,
	frusterNamespace = false,
}: {
	message: string;
	frusterNamespace?: boolean;
}) {
	let allNamespaces = await getNamespaces();

	if (frusterNamespace) {
		allNamespaces = allNamespaces.filter((ns) => !!(ns.metadata.labels || {})["fruster"]);
	}

	const { namespace } = await inquirer.prompt([
		{
			type: "list",
			name: "namespace",
			pageSize: 20,
			choices: allNamespaces.map((ns) => {
				return {
					value: ns.metadata.name,
				};
			}),
			message,
		},
	]);

	return namespace;
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
	align = "left",
}: {
	message: string;
	hint?: string;
	align?: string;
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
		align,
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

export async function secretInput({ name, message }: { name: string; message: string }) {
	const prompt = new Password({
		name,
		message,
	}).run();

	return prompt;
}

export async function confirmPrompt(message: string, initial = false) {
	const answer = await enquirer.prompt<{ confirm: boolean }>({
		type: "confirm",
		name: "confirm",
		initial,
		message: message,
	});

	return answer.confirm;
}

export function isMasked(str: string) {
	return /^\*{2,}$/.test(str);
}

const COMMENT_REGEXP = /^#.*$/gm;
// const EMPTY_LINE_REGEXP = /^\s*$/gm;

export async function openEditor({
	initialContent = "",
	guidance = "",
}: {
	initialContent: string;
	guidance?: string;
}) {
	// TODO: I have never tried this on windows
	const isWin = process.platform === "win32";
	const editor = isWin ? "edit" : "vi";

	const tmpobj = tmp.fileSync();

	fs.writeFileSync(tmpobj.name, (guidance ? guidance + "\n" : "") + initialContent);

	const child = childProcess.spawn(editor, [tmpobj.name], {
		stdio: "inherit",
	});

	return new Promise<string>((resolve, reject) => {
		child.on("exit", (code) => {
			if (code !== 0) {
				return reject();
			}
			const data = fs.readFileSync(tmpobj.name, "utf8") as string;
			tmpobj.removeCallback();

			resolve(data.replace(COMMENT_REGEXP, ""));
		});
	});
}

/**
 * Opens config in system editor and returns promise when closed.
 */
export async function editConfigInEditor(config: { [x: string]: string }, additionalGuidance?: string) {
	const configString = Object.keys(config)
		.map((k) => `${k}=${config[k]}`)
		.join("\n");

	const guidance = "# Make changes (if any) and save and exit the editor to return.\n# One config per row!";

	const res = await openEditor({
		initialContent: configString,
		guidance: additionalGuidance ? [guidance, additionalGuidance].join("\n") : guidance,
	});

	// Convert string to config object again, any invalid rows will be omitted

	const configRowSplits = res.split("\n").map((row) => row.split("="));

	const updatedConfig: { [x: string]: string } = {};

	for (const split of configRowSplits) {
		const [key, ...values] = split;
		const value = values.join("=");

		if (key && value) {
			updatedConfig[key] = value;
		}
	}

	return updatedConfig;
}

/**
 * Prints diff of config changes.
 */
export function printConfigChanges(
	oldConfig: { [x: string]: string },
	newConfig: { [x: string]: string },
	maskValues?: boolean
) {
	const updatedConfigKeys = Object.keys(newConfig);
	const oldConfigKeys = Object.keys(oldConfig);

	console.log();
	console.log("Updated config:");
	console.log();

	printTable(
		updatedConfigKeys.map((k) => {
			const oldValue = oldConfig[k];
			const newValue = newConfig[k];

			let value = newValue;

			if (!oldValue) {
				value = chalk.blue(newValue + chalk.bold(" (new)"));
			} else if (oldValue !== newValue) {
				value = chalk.dim(oldValue + " -> ") + chalk.magenta(newValue);
			} else {
				value = chalk.dim(maskValues ? maskStr(newValue) : newValue);
			}

			return [k, value];
		})
	);

	const removedKeys = oldConfigKeys.filter((oldKey) => !updatedConfigKeys.includes(oldKey));

	if (removedKeys.length) {
		console.log(chalk.red("Removed: " + removedKeys.join(", ")));
		console.log();
	}
}

export function maskConfig(config?: { [x: string]: string }) {
	const out: { [x: string]: string } = {};

	Object.keys(config || {}).forEach((k) => {
		out[k] = maskStr(config![k]);
	});

	return out;
}
