import { EventEmitter } from "events";
import { clearScreen } from "../utils/cli-utils";
import chalk from "chalk";

let escLocked = false;

export function pushScreen(config: ScreenConfig) {
	events.emit("pushScreen", config);
}

export function popScreen() {
	events.emit("popScreen");
}

export function resetScreen() {
	events.emit("resetScreen");
}

export function lockEsc() {
	escLocked = true;
}

export async function renderScreen(config?: ScreenConfig) {
	if (config) {
		try {
			await config.render(config.props);
		} catch (err) {
			// clearScreen();
			if (err) {
				console.error("Unhandled error", err);
			}
		}
	}
}

export const separator = {
	message: chalk.dim("-------------"),
	name: "----",
	role: "separator",
};

export const backChoice = {
	message: chalk.grey("⏎ Go back"),
	value: "back",
	name: "back",
};

interface ScreenConfig {
	escAction?: "exit" | "back";
	enterAction?: "back";
	render: Function;
	props?: any;
	name?: string;
}

const events = new EventEmitter();

let stack: ScreenConfig[] = [];

events.on("escape", () => {
	const config = stack[stack.length - 1];

	if (escLocked) {
		return;
	}

	if (config.escAction === "exit") {
		process.exit(0);
	} else if (config.escAction === "back") {
		console.log("Pop from", stack);
		popScreen();
	}
});

events.on("pushScreen", (config: ScreenConfig) => {
	escLocked = false;
	clearScreen();
	stack.push(config);
	renderScreen(config);
});

events.on("popScreen", () => {
	escLocked = false;
	stack.pop();
	clearScreen();
	renderScreen(stack[stack.length - 1]);
});

events.on("resetScreen", () => {
	escLocked = false;
	clearScreen();
	renderScreen(stack[stack.length - 1]);
});

process.stdin.on("keypress", (s, key) => {
	if (key.name === "escape") {
		events.emit("escape");
	} else if (key.name === "enter") {
		events.emit("enter");
	}
});
