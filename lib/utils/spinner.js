const term = require("terminal-kit").terminal;

const spinnerChars = ["-", "\\", "|", "/"];

class Spinner {

	constructor(opts) {
		this.text = opts.text;
		this.statusCb = opts.statusCb;
		this.pos = opts.pos || [1,1];
		this.status = "paused"; // paused | loading | done | failed
	}

	start(spinnerIndex = 0) {
		this.status = this.statusCb();
		let color = this.getColor();	

		if(this.isLoading()) {
			let spinnerChar = spinnerChars[spinnerIndex % spinnerChars.length];

			term.moveTo[color](this.pos[0], this.pos[1], `${this.text} ${spinnerChar}\n`);
			
			setTimeout(() => {
				this.start(++spinnerIndex);
			}, 200);	
		} else {
			term.moveTo[color](this.pos[0], this.pos[1], `${this.text} ${this.status.toUpperCase()}\n`);
		}

		return this;
	}

	isLoading() {
		return this.status == "loading";
	}

	getColor() {
		let color = "defaultColor";

		if(this.status == "done") {
			color = "green";
		} else if(this.status == "failed") {
			color = "red";
		}

		return color;
	}

}

module.exports = {
	create: (text, row, cb) => {
		return new Spinner({
			text: text,
			pos: [1, row],
			statusCb: cb
		});
	}
}