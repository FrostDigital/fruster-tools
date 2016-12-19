const cmd = require("../cmd");
const request = require("request-promise");
const deisConfig = require("./deis-config").activeConfig();

let deis = {};

module.exports = deis;

deis.apps = (pattern) => {
  return doRequest("GET", "/v2/apps").then(resp => {    
    return resp.results.filter(app => matchWildcardPattern(app.id, pattern))    
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

deis.login = (deisControllerUrl, username, password) => {

  const body = {
    username: username,
    password: password
  };

  return doRequest("POST", "/v2/auth/login/", body, deisControllerUrl)
  .then(resp => {    
    let profile = {
      username: username,
      ssl_verify: true,
      controller: deisControllerUrl,
      token: resp.token,
      response_limit: 0
    };
  });
};

function doRequest(method, path, body = true, deisControllerUrl = deisConfig.controller) {
  var options = {
    method: method,
    uri: deisControllerUrl + path,
    headers: {
      authorization: `token ${deisConfig.token}`
    },
    json: body
  };

  return request(options)
    .catch(err => {
      console.error(err.message);
      throw err;
    });
}

// function commandWithFilter(command, pattern) {

//   if (pattern) {
//     // No wildcard in beginning means we should tell grep to match from beginning of string
//     if (pattern.charAt(0) != "*") {
//       pattern = "^" + pattern;
//     }
//     return `${command} |grep ${pattern}`;
//   }
//   return command;
// }


function matchWildcardPattern(str, pattern = "*") {
  return new RegExp("^" + pattern.split("*").join(".*") + "$").test(str);
}