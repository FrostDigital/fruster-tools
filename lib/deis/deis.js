const cmd = require("../cmd");
const request = require("request-promise");
const deisConfig = require("./deis-config");
const utils = require("../utils");

const DEFAULT_MEMORY_LIMIT = {
	cmd: "128M/256M"
};

let deis = {};

module.exports = deis;

deis.apps = async pattern => {
	const resp = await doRequest({ method: "GET", path: "/v2/apps?limit=300" });
	if (pattern) {
		return resp.results.filter(app => utils.matchPattern(app.id, pattern));
	} else {
		return resp.results;
	}
};

deis.createApp = async ({
	appName
	// createHealthCheck = false,
	// setDefaultLimits = false
}) => {
	const resp = await doRequest({
		method: "POST",
		path: "/v2/apps/",
		body: {
			id: appName
		}
	});

	// TODO: Create health checks by default?

	return resp;
};

deis.deleteApp = appName => {
	return doRequest({ method: "DELETE", path: `/v2/apps/${appName}` });
};

deis.setConfig = (app, config) => {
	return doRequest({
		method: "POST",
		path: `/v2/apps/${app}/config`,
		body: {
			values: config
		}
	});
};

deis.getConfig = async appName => {
	const resp = await doRequest({
		method: "GET",
		path: `/v2/apps/${appName}/config`
	});
	return resp.values;
};

deis.removeConfig = (app, config) => {
	// Deprecated, use setConfig with null values instead
	return cmd(`deis config:unset ${config.join(" ")} -a ${app}`, true);
};

deis.whoami = () => {
	return cmd(`deis whoami`);
};

deis.setLimit = (app, { cpu, memory }) => {
	return doRequest({
		method: "POST",
		path: `/v2/apps/${app}/config`,
		body: {
			cpu,
			memory
		}
	});
};

deis.enableHealthcheck = async app => {
	const healthCheckModel = {
		healthcheck: {
			"web/cmd": {
				livenessProbe: {
					initialDelaySeconds: 50,
					timeoutSeconds: 50,
					periodSeconds: 10,
					successThreshold: 1,
					failureThreshold: 3,
					exec: {
						command: ["/bin/cat", ".health"]
					}
				}
			}
		}
	};

	try {
		await doRequest({
			method: "POST",
			path: `/v2/apps/${app}/config`,
			body: healthCheckModel
		});
	} catch (err) {
		if (err.statusCode == 409) {
			return `\n=== ${app}\nNothing changed`;
		} else {
			throw err;
		}
	}
};

deis.disableHealthcheck = app => {
	return cmd(`deis healthchecks:unset -a ${app} liveness`);
};

deis.getHealthcheck = app => {
	return cmd(`deis healthchecks -a ${app}`);
};

deis.login = async (deisControllerUrl, username, password) => {
	const body = {
		username: username,
		password: password
	};

	const resp = await doRequest({
		method: "POST",
		path: "/v2/auth/login/",
		body,
		deisControllerUrl
	});

	return {
		username: username,
		ssl_verify: true,
		controller: deisControllerUrl,
		token: resp.token,
		response_limit: 0
	};
};

/**
 *
 * @param {Object} opts
 * @param {String} opts.method
 * @param {String} opts.path
 * @param {Object|Boolean=} opts.body
 * @param {String=} opts.deisControllerUrl
 */
function doRequest({
	method,
	path,
	body = true,
	deisControllerUrl = deisConfig.activeConfig().controller
}) {
	const options = {
		method: method,
		uri: deisControllerUrl + path,
		json: body
	};

	if (!path.includes("login")) {
		options.headers = {
			authorization: `token ${deisConfig.activeConfig().token}`
		};
	}

	return request(options).catch(err => {
		console.error(err.message);
		throw err;
	});
}
