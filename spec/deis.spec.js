const deis = require("../lib/deis");


process.env.DEBUG = true;

describe("Deis", () => {
  
  it("should list deis apps", done => {              
    deis.apps()
      .then(apps => {
        expect(apps.length).toBeGreaterThan(0);        
        done();
      })
      .catch(done.fail);
  });

  it("should list deis apps with pattern", done => {              
    deis.apps("pu-")
      .then(apps => {
        expect(apps.length).toBeGreaterThan(0);        
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
    deis.login("http://deis.c1.fruster.se", "joel", "vinglon2016")
      .then(() => {
        done();
      })
      .catch(done.fail);
  });

  it("should fail to login with invalid password", done => {              
    deis.login("http://deis.c1.fruster.se", "joel", "poooop")      
      .catch(done);
  });

});