import enquirer from "enquirer";
import { syncApps } from "../actions/sync-apps";
import { pressEnterToContinue, selectNamespace } from "../utils/cli-utils";
import { popScreen } from "./engine";

export async function importApps() {
	const { path } = await enquirer.prompt<{ path: string }>({
		message: "Enter service registry path",
		name: "path",
		type: "input",
		initial: process.cwd(),
	});

	const namespace = await selectNamespace({
		message: "Select namespace app(s) should be created in",
		fctlAppNamespace: true,
	});

	await syncApps(namespace, path);
	await pressEnterToContinue();
	popScreen();
}
