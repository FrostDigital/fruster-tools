const kube = require("../kube");
const deis = require("../deis");
const conf = require("../../conf");
const term = require("terminal-kit").terminal;
const serviceReg = require("../service-registry");
const spinner = require("../utils/spinner");

module.exports = {
	start: start
};

let serviceRegInstance;
let startSpinners;

function start(serviceRegPath) {

	serviceRegInstance = serviceReg.create(serviceRegPath);

	return serviceRegInstance.cloneOrUpdateServices()
		.then(() => {
			term.clear();

			term.cyan(`Building ${serviceRegInstance.services.length} instance(s)`);

			// Start build
			let batchBuild = serviceRegInstance.build();

			// Create spinners
			batchBuild.processes.forEach(createBuildSpinner);

			// Continue when all builds completed
			return batchBuild.whenAllDone()
				.then(delayPromise);
		})
		.then(() => serviceRegInstance.start())
		.then(() => handleInput())
		.then(() => showSummaryView());

	process.on("exit", serviceRegInstance.killAll);
}

function showSummaryView() {
	const numServices = serviceRegInstance.services.length;

	term.clear.cyan(`Running ${numServices} instance(s)`);

	if(!startSpinners) {
		startSpinners = serviceRegInstance.startProcesses.map(createRunSpinner);
	} else {
		startSpinners.forEach(s => s.resume());
	}
	
	term.moveTo(0, numServices+2, `Choose service 1-${numServices} to view logs: `);
}

function showServiceLogs(serviceNum) {
	if(serviceNum > serviceRegInstance.startProcesses.length) {		
		return;
	}

	let selectedService = serviceRegInstance.startProcesses[serviceNum-1];	

	startSpinners.forEach(s => s.pause());
	
	term.clear.cyan.moveTo(0, 0, `Showing ${selectedService.name} - press ESC to return`);	

	selectedService.output.forEach(out => {
		term(out.data);
	});
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


function handleInput() {
	let input = "";
	
	term.grabInput();

	term.on("key", function(name, matches, data) {
		if(name == "CTRL_C") {
			serviceRegInstance.killAll();
			process.exit(0);	
		} else if(name == "ENTER" && input) {
			showServiceLogs(Number.parseInt(input));
			input = "";
		} else if(name == "ESCAPE") {
			showSummaryView();
			input = "";
		} else if(name == "BACKSPACE") {
			input = input.substr(0, input.length-1);
			term.backDelete();
		} else if(!isNaN(name)) {
			input += name;
			term(name);
		}
	});
}
