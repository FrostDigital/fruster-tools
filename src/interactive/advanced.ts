import enquirer from "enquirer";
import { backChoice, popScreen, pushScreen, separator } from "./engine";
import { installTokenRefresher } from "./install-token-refresher";

export async function advanced() {
	const { item } = await enquirer.prompt<{ item: string }>([
		{
			type: "select",
			name: "item",
			message: `Advanced`,
			choices: [
				separator,
				// { message: "Diagnose cluster", name: "diagnoseCluster" },
				{ message: "Install token refresher", name: "installTokenRefresher" },
				// { message: "Install router", name: "installRouter" },
				separator,
				backChoice,
			],
		},
	]);

	if (item === "installTokenRefresher") pushScreen({ render: installTokenRefresher });
	else if (item === "installRouter") pushScreen({ escAction: "back", render: installRouter });
	else if (item === "diagnoseCluster") pushScreen({ escAction: "back", render: diagnoseCluster });
	else if (item === "back") popScreen();
}

async function installRouter() {
	console.log();
	console.log(`This will install deis router onto the cluster`);
	console.log();
}

async function diagnoseCluster() {
	console.log();
	console.log(`Diagnosing cluster...`);
	console.log();
}
