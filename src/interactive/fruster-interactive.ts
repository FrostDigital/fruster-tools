import chalk from "chalk";
import enquirer from "enquirer";
import { advanced } from "./advanced";
import { apps } from "./apps";
import { createApp } from "./create-app";
import { pushScreen, separator } from "./engine";
import { registries } from "./registries";

export async function start() {
	pushScreen({
		escAction: "exit",
		render: renderMainMenu,
		name: "start",
	});
}

async function renderMainMenu() {
	console.log(chalk.magenta(`\n Fruster interactive CLI\n`));

	// TODO: REMOVE!

	// pushScreen({
	// 	render: createApp,
	// });

	const { item } = await enquirer.prompt<{ item: string }>([
		{
			type: "select",
			name: "item",
			message: `Main menu`,
			choices: [
				separator,
				{ message: "Apps", name: "apps" },
				{ message: "Registries", name: "registries" },
				{ message: "Advanced", name: "advanced" },
				separator,
				{ message: chalk.grey("⏎ Exit"), name: "exit" },
			],
		},
	]);

	switch (item) {
		case "apps":
			pushScreen({
				escAction: "back",
				render: apps,
				name: "apps",
			});
			break;
		case "registries":
			pushScreen({
				escAction: "back",
				render: registries,
				name: "registries",
			});
			break;
		case "advanced":
			pushScreen({
				escAction: "back",
				render: advanced,
				name: "registries",
			});
			break;
		case "exit":
			process.exit(0);
	}
}
