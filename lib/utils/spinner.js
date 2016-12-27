const term = require("terminal-kit").terminal;

const spinnerChars = ["-", "\\", "|", "/"];

const statusEnum = {
	LOADING: null,
	SUCCESS: 0,
	FAILURE: 1
};

const defaulStatusStyle = {
	0: {
		msg: "DONE",
		color: "green"
	},
	1: {
		msg: "FAILURE",
		color: "red"
	}
};

class Spinner {

	constructor(opts) {
		this.text = opts.text;
		this.statusCb = opts.statusCb;
		this.pos = opts.pos || [1, 1];
		this.status = statusEnum.LOADING;
		this.statusStyle = Object.assign({}, defaulStatusStyle, opts.statusStyle);
		this.paused = false;
		this.start();
	}

	start(spinnerIndex = 0) {
		if(this.paused) {
			return;
		}
		
		this.status = this.statusCb();
		let style = this.getStatusStyle();
		
		term.saveCursor();
		
		if (this.status == statusEnum.LOADING) {
			let spinnerChar = spinnerChars[spinnerIndex % spinnerChars.length];

			term.moveTo[style.color](this.pos[0], this.pos[1], `${this.text} ${spinnerChar}\n`);

			setTimeout(() => {
				this.start(++spinnerIndex);
			}, 200);
		} else {			
			term.moveTo[style.color](this.pos[0], this.pos[1], `${this.text} ${style.msg || ""}\n`);
		}

		term.restoreCursor();

		return this;
	}

	pause() {
		this.paused = true;;
	}

	resume() {
		this.paused = false;
		this.start();
	}

	getStatusStyle() {
		let style = this.statusStyle[this.status];
		
		if(!style) {
			style = {
				color: "defaultColor"
			};
		}

		return style;
	}
}

module.exports = {
	create: (opts) => new Spinner(opts)
}