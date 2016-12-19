const deis = require("../lib/deis");

process.env.DEBUG = true;

if(!process.env.DEIS_INTEGRATION_TEST) {
  return;
}

const deisUser = process.env.DEIS_USERNAME;
const deisPassword = process.env.DEIS_PASSWORD;

describe("Deis", () => {
  
  it("should list deis apps", done => {              
    deis.apps()
      .then(apps => {
        expect(apps.length).toBeGreaterThan(0);        
        done();
      })
      .catch(done.fail);
  });

  it("should list deis apps by prefix", done => {              
    deis.apps("pu-")
      .then(apps => {
        expect(apps.length).toBeGreaterThan(0);        
        done();
      })
      .catch(done.fail);
  });

  it("should get single app", done => {              
    deis.apps("pu-api-gateway")
      .then(apps => {
        expect(apps.length).toBe(1);        
        done();
      })
      .catch(done.fail);
  });

  it("should not fail in case if no matches", done => {              
    deis.apps("NOMATCHTHATSRIGHTNOMATCH")
      .then(apps => {
        expect(apps.length).toBe(0);        
        done();
      })
      .catch(done.fail);
  });
  
  it("should login", done => {              

    if(deisUser && deisPassword) {
      deis.login("http://deis.c1.fruster.se", deisUser, deisPassword)
        .then(() => {
          done();
        })
        .catch(done.fail);      
    } else {
      console.log("WARN: Skipping");
      done();
    }

  });

  it("should fail to login with invalid password", done => {              
    deis.login("http://deis.c1.fruster.se", "joel", "poooop")      
      .catch(done);
  });

});