const cmd = require("../cmd");
const request = require("request-promise");
//const path = require("path");

let deis = {};

module.exports = deis;

deis.apps = (pattern) => { 
  const command = commandWithFilter("deis apps", pattern);

  return cmd(command, true)
    .then(output => {
      let rows = output.split("\n")
        .map(row => {
          return row.trim();
        })
        .filter(row => {
          // Remove "decoraction" from deis cli output
          return row !== "" && !row.startsWith("=== Apps");
        });
            
      return rows;
    })    
    .catch(err => {
      console.error(err);
      throw err;
    });
};

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

  var options = {
    method: "POST",
    uri: deisControllerUrl + "/v2/auth/login/",
    json: {
      username: username,
      password: password
    } 
  };

  return request(options)
  .then(resp => {
    // resp.token
    // 
    // {"username":"joel","ssl_verify":true,"controller":"http://deis.c1.fruster.se","token":"c27c165b5a059b196624648437ba66753ecec646","response_limit":0}%        ~/projects/fruster-tools  

    let profile = {
      username: username,
      ssl_verify: true,
      controller: deisControllerUrl,
      token: resp.token,
      response_limit: 0
    };



  })
  .catch(err => {
    console.error(err.message);
    throw err;
  });
  /*
  T 2016/11/24 20:07:21.507552 192.168.1.72:51392 -> 52.213.81.145:80 [AP]
POST /v2/auth/login/ HTTP/1.1.
Host: deis.c1.fruster.se.
User-Agent: Deis Client v2.8.0.
Content-Length: 36.
Content-Type: application/json.
Accept-Encoding: gzip.
Connection: close.
.
{"username":"joel","password":"fff"}
   */
};

function commandWithFilter(command, pattern) {

  if(pattern) {  
    // No wildcard in beginning means we should tell grep to match from beginning of string
    if(pattern.charAt(0) != "*") {
      pattern = "^" + pattern;
    }
    return `${command} |grep ${pattern}`;
  }
  return command;
}


// git.init = (dir) => {
//   return cmd(`git -C ${dir} config --get remote.origin.url`)
//     .then(repoUrl => new GitRepo(repoUrl, dir))
//     .then(repo => setCurrentBranch(repo))
//     .catch(err => {
//       throw new Error("Missing or invalid git repo in dir:", dir)
//     });    
// };

// git.checkout = (repo, branch, createBranch) => {   
//   if(!repo || !repo instanceof GitRepo) {
//     return Promise.reject("Missing or invalid repo");
//   }

//   if(!branch) {
//     return Promise.reject("Missing branch name");
//   }

//   return cmd(`git -C ${repo.dir} checkout ${createBranch ? "-b" : ""} ${branch}`)
//     .then(console.log)
//     .then(() => setCurrentBranch(repo))
//     .catch(console.error);
// };

// function setCurrentBranch(repo) {
//   return cmd(`git -C ${repo.dir} branch | grep  ^*|cut -d" " -f2`).then(branch => {
//     repo.branch = branch.trim();
//     return repo;
//   });
// }

// function alignRepoName(repoUrl) {
//   // Add full github url if just `org/repo` is passed in
//   if(!repoUrl.includes("git@github.com") && !repoUrl.includes("http://")) {
//     return "git@github.com:" + repoUrl + ".git";
//   } else {
//     return repoUrl;    
//   }
// }



