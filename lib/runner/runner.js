const term = require("terminal-kit").terminal;
const serviceReg = require("../service-registry");
const spinner = require("../utils/spinner");

module.exports = {
	start: function(serviceRegistryPath) {
		return new Runner(serviceRegistryPath).run();
	}
};

class Runner {
	constructor(serviceRegistryPath) {
		this.serviceRegistry = serviceReg.create(serviceRegistryPath);
		this.numServices = this.serviceRegistry.services.length;
		this.input = "";
	}

	run() {		
		return this.serviceRegistry.cloneOrUpdateServices()
			.then(() => this.buildServices())
			.then(() => {
				this.serviceRegistry.start();				
				this.handleInput();
				this.showSummary();
			})
			.catch(console.error);
	}

	buildServices() {
		term.clear.cyan(`Building ${this.numServices} instance(s)`);

		this.serviceRegistry.build();
		this.serviceRegistry.buildProcesses.forEach(createBuildSpinner);

		return this.serviceRegistry.whenAllBuilt()
			.then(() => delayPromise());
	}

	showSummary() {			
		this.removeLogStreams();

		term.clear.cyan(`Running ${this.numServices} instance(s)`);

		if (!this.startSpinners) {
			this.startSpinners = this.serviceRegistry.startedProcesses.map(createRunSpinner);
		} else {
			this.resumeSpinners();
		}

		term.moveTo(0, this.numServices + 2, `Choose service 1-${this.numServices} to view logs: `);
	}

	showService(serviceNum) {
		if (serviceNum > this.numServices) {
			return;
		}

		let selectedService = this.serviceRegistry.startedProcesses[serviceNum - 1];

		this.pauseSpinners();

		term.clear.cyan.moveTo(0, 0, `Showing ${selectedService.name} - press ESC to return`);

		selectedService.output.forEach(out => {
			term(out.data);
		});

		this.appendLogStream(selectedService);		
	}

	pauseSpinners() {
		this.startSpinners.forEach(s => s.pause());
	}

	resumeSpinners() {
		this.startSpinners.forEach(s => s.resume());
	}

	appendLogStream(serviceProcess) {
		serviceProcess.onData = (msg) => {
			term(msg.data);
		};
	}

	removeLogStreams() {
		this.serviceRegistry.startedProcesses.forEach(s => {
			s.onData = null;
		});
	}

	handleInput() {		
		term.grabInput();

		term.on("key", (name, matches, data) => {
			if (name == "CTRL_C") {
				this.serviceRegistry.killAll();
				process.exit(0);
			} else if (name == "ENTER" && this.input) {
				this.showService(Number.parseInt(this.input));
				this.input = "";
			} else if (name == "ESCAPE") {
				this.showSummary();
				this.input = "";
			} else if (name == "BACKSPACE") {
				this.input = this.input.substr(0, this.input.length - 1);
				term.backDelete();
			} else if (!isNaN(name)) {
				this.input += name;
				term(name);
			}
		});
	}
}

function createBuildSpinner(childProcess, index) {
	return spinner.create({
		text: `Building ${childProcess.name}...`,
		pos: [1, index + 2],
		statusCb: () => childProcess.exitCode
	});
}

function createRunSpinner(childProcess, index) {
	return spinner.create({
		text: `${index+1}) ${childProcess.name}`,
		pos: [1, index + 2],
		statusCb: () => childProcess.exitCode,
		statusStyle: {
			0: {
				msg: "EXITED",
				color: "red"
			}
		}
	});
}

function delayPromise() {
	return new Promise((resolve, reject) => setTimeout(resolve, 300));
}