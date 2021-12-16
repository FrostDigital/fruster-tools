process.env.DEIS_HOME = require("path").join(__dirname, "support");

const config = require("../src/deis/deis-config");

describe("Deis config", () => {
	afterAll(() => {
		delete process.env.DEIS_HOME;
	});

	it("should get active deis config", () => {
		let deisConfig = config.activeConfig();
		expect(deisConfig.controller).toBeDefined();
	});
});
