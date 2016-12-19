const exec = require("child_process").exec;

module.exports = (command, allowError) => {
  log(command);

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

function log(msg) {
  if(process.env.DEBUG) {
    console.log(msg);
  }
}
