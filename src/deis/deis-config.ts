import path from "path";
const utils = require("../utils");
const conf = require("../conf");

export const activeConfig = () => {
	let config = loadConfig("client.json");

	if (!config) {
		throw new Error("Failed to get deis config");
	}

	return config;
};

function loadConfig(filename: string) {
	return utils.readFile(path.join(conf.deisHome, filename), true);
}
