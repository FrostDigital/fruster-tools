const cmd = require("../cmd");
const request = require("request-promise");
const deisConfig = require("./deis-config");
const utils = require("../utils");

let deis = {};

module.exports = deis;

deis.apps = (pattern) => {
  return doRequest("GET", "/v2/apps").then(resp => {
    return resp.results.filter(app => utils.matchPattern(app.id, pattern))
  });
}

deis.setConfig = (app, config) => {
  return cmd(`deis config:set ${config.join(" ")} -a ${app}`, true);
};

deis.getConfig = (app) => {
  return cmd(`deis config -a ${app}`, true);
};

deis.removeConfig = (app, config) => {
  return cmd(`deis config:unset ${config.join(" ")} -a ${app}`, true);
};

deis.whoami = () => {
  return cmd(`deis whoami`);
};

deis.enableHealthcheck = (app) => {
  return cmd(`deis healthchecks:set -a ${app} liveness exec -- /bin/cat .health`)
    .catch(err => {
      if(err.message.match("changed nothing")) {
        return `\n=== ${app}\nNothing changed`;
      } 
      throw err;
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