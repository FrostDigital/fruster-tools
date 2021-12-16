const cmd = require("../cmd");
const request = require("request-promise");
const deisConfig = require("./deis-config");
const utils = require("../utils");

export const apps = (pattern?: string): Promise<any[]> => {
	return doRequest("GET", "/v2/apps?limit=300").then((resp: { results: any[] }) => {
		if (pattern) {
			return resp.results.filter((app) => utils.matchPattern(app.id, pattern));
		} else {
			return resp.results;
		}
	});
};

export const createApp = (appName: string) => {
	return doRequest("POST", `/v2/apps/`, {
		id: appName,
	});
};

export const deleteApp = (appName: string) => {
	return doRequest("DELETE", `/v2/apps/${appName}`);
};

export const setConfigDeprecated = (app: string, config: any) => {
	return doRequest("POST", `/v2/apps/${app}/config`, {
		values: config,
	});
};

export const setConfig = (app: string, config: any) => {
	return doRequest("POST", `/v2/apps/${app}/config`, {
		values: config.values,
		healthcheck: config.healthcheck,
	});
};

/**
 * Get config for app.
 * Only env config values are returned.
 *
 * @deprecated use `getConfig` instead which provides all data
 */
export const getConfigDeprecated = (appName: string) => {
	return doRequest("GET", `/v2/apps/${appName}/config`).then((resp: any) => resp.values);
};

/**
 * Get all config for apps.
 */
export const getConfig = (appName: string) => {
	return doRequest("GET", `/v2/apps/${appName}/config`);
};

export const enableHealthcheck = (app: string) => {
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
						command: ["/bin/cat", ".health"],
					},
				},
			},
		},
	};

	return doRequest("POST", `/v2/apps/${app}/config`, healthCheckModel).catch((resp: any) => {
		if (resp.statusCode == 409) {
			return `\n=== ${app}\nNothing changed`;
		}
		throw resp;
	});
};

export const disableHealthcheck = (app: string) => {
	return cmd(`deis healthchecks:unset -a ${app} liveness`);
};

export const getHealthcheck = (app: string) => {
	return cmd(`deis healthchecks -a ${app}`);
};

export const login = (deisControllerUrl: string, username: string, password: string) => {
	const body = {
		username: username,
		password: password,
	};

	return doRequest("POST", "/v2/auth/login/", body, deisControllerUrl).then((resp: any) => {
		return {
			username: username,
			ssl_verify: true,
			controller: deisControllerUrl,
			token: resp.token,
			response_limit: 0,
		};
	});
};

function doRequest(
	method: string,
	path: string,
	body: any = true,
	deisControllerUrl = deisConfig.activeConfig().controller
) {
	let options = {
		method: method,
		uri: deisControllerUrl + path,
		json: body,
		headers: {},
	};

	if (path.indexOf("login") < 0) {
		options.headers = {
			authorization: `token ${deisConfig.activeConfig().token}`,
		};
	}

	return request(options).catch((err: any) => {
		console.error(err.message);
		throw err;
	});
}
