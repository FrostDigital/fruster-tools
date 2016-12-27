process.env.FRUSTER_DIR = require("path").join(__dirname, "support");

const config = require("../lib/config");

process.env.DEBUG = true;

describe("Config", () => {
    
  it("should read frusters.json", () => {              
    let frusterConfig = config.getFrusterConfig("agada");        
    expect(frusterConfig.env).toBeDefined();        
    expect(frusterConfig.services).toBeDefined();          
    expect(frusterConfig.services[0].name).toBe("ag-fruster-user-service");          
  });

  it("should read fruster-{frusterName}.json", () => {              
    let frusterConfig = config.getFrusterConfig("paceup");        
    expect(frusterConfig.env).toBeDefined();        
    expect(frusterConfig.services).toBeDefined();          
    expect(frusterConfig.services[0].name).toBe("fruster-api-gateway");          
  });
 
});