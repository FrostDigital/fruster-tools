const term = require("terminal-kit").terminal;

export const debug = (msg: string) => {
	if (process.env.DEBUG) {
		console.log(msg);
	}
};

export const info = (msg: string) => {
	term(`${msg}${msg.endsWith("\n") ? "" : "\n"}`);
};

export const warn = (msg: string) => {
	term.brightYellow("WARNING: " + msg + "\n");
};

export const error = (msg: string) => {
	term.red("ERROR: " + msg + "\n");
};

export const success = (msg: string) => {
	term.green(msg + "\n");
};
