import { terminal } from "terminal-kit";

export const debug = (msg: string) => {
	if (process.env.DEBUG) {
		console.log(msg);
	}
};

export const info = (msg: string) => {
	terminal(`${msg}${msg.endsWith("\n") ? "" : "\n"}`);
};

export const warn = (msg: string) => {
	terminal.brightYellow("WARNING: " + msg + "\n");
};

export const error = (msg: string) => {
	terminal.red("ERROR: " + msg + "\n");
};

export const success = (msg: string) => {
	terminal.green(msg + "\n");
};
