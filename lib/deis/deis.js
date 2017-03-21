const cmd = require("../cmd");
const request = require("request-promise");
const deisConfig = require("./deis-config");
const utils = require("../utils");

let deis = {};

module.exports = deis;

deis.apps = (pattern) => {
  return doRequest("GET", "/v2/apps").then(resp => {    
    if(pattern) {
      return resp.results.filter(app => utils.matchPattern(app.id, pattern));      
    } else {
      return resp.results;
    }
  });
};

deis.createApp = (appName) => {
  if(appName.length > 24) {    
    return Promise.reject("App name cannot be more than 24 chars");
  }
  return doRequest("POST", `/v2/apps/`, { id: appName });
};

deis.setConfig = (app, config) => {
  return doRequest("POST", `/v2/apps/${app}/config`, { values: config });  
};

deis.getConfig = (appName) => {
  return doRequest("GET", `/v2/apps/${appName}/config`)
      .then(resp => resp.values);
};

deis.removeConfig = (app, config) => {
  // Deprecated, use setConfig with null values instead
  return cmd(`deis config:unset ${config.join(" ")} -a ${app}`, true);
};

deis.whoami = () => {
  return cmd(`deis whoami`);
};

deis.enableHealthcheck = (app) => {
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
            command: [
            "/bin/cat",
            ".health"
            ]
          }
        }
      }
    }
  }

  return doRequest("POST", `/v2/apps/${app}/config`, healthCheckModel)
    .catch(resp => {        
        if(resp.statusCode == 409) {
          return `\n=== ${app}\nNothing changed`;
        } 
        throw resp;
      });
};

deis.disableHealthcheck = (app) => {
  return cmd(`deis healthchecks:unset -a ${app} liveness`);
};

deis.getHealthcheck = (app) => {
  return cmd(`deis healthchecks -a ${app}`);
};

deis.login = (deisControllerUrl, username, password) => {

  const body = {
    username: username,
    password: password
  };

  return doRequest("POST", "/v2/auth/login/", body, deisControllerUrl)
    .then(resp => {      
      return {
        username: username,
        ssl_verify: true,
        controller: deisControllerUrl,
        token: resp.token,
        response_limit: 0
      };
    });
};

function doRequest(method, path, body = true, deisControllerUrl = deisConfig.activeConfig().controller) {
  var options = {
    method: method,
    uri: deisControllerUrl + path,
    json: body
  };

  if(path.indexOf("login") < 0) {    
    options.headers = {
      authorization: `token ${deisConfig.activeConfig().token}`
    };
  }

  return request(options)
    .catch(err => {
      console.error(err.message);
      throw err;
    });
}