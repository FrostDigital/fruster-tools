const exec = require("child_process").exec;
const log = require("./log");

module.exports = (command, allowError) => {
  log.debug(command);

  return new Promise((resolve, reject) => {
    exec(command, {maxBuffer: 1024 * 2000}, (err, stdout, stderr) => {   
      if(err && !allowError) {       
        reject(err);
      } else {
        resolve(stdout);            
      }
    });
  });
  
};

