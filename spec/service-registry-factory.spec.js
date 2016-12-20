const path = require("path");

process.env.FRUSTER_DIR = path.join(__dirname, ".tmp-fruster-home");

const svcReg = require("../lib/service-registry");


describe("Service registry", () => {

	let paceup;

	beforeEach(() => {
		paceup = svcReg.create("paceup", path.join(__dirname, "support", "fruster-paceup.json"));
	})

	it("should be created from file", () => {
		expect(paceup.getServices().length).toBe(2);
	});

	it("should get filtered list of services", () => {
		expect(paceup.getServices("*api*").length).toBe(1);
	});

	it("should clone or update services", done => {

		paceup.cloneOrUpdateServices()
			.then(repos => {
				done();
			})
			.catch(done.fail);
	});

	// it("should start all services", done => {

	// 	paceup.start()
	// 		.then(repos => {
	// 			done();
	// 		})
	// 		.catch(done.fail);
	// });

});