const path = require("path");

process.env.FRUSTER_DIR = path.join(__dirname, ".tmp-fruster-home");

const svcReg = require("../lib/service-registry");

jasmine.DEFAULT_TIMEOUT_INTERVAL = 30 * 1000;

describe("Service registry", () => {

	let paceup;

	beforeEach(() => {
		paceup = svcReg.create(path.join(__dirname, "support", "fruster-paceup.json"));
	})

	it("should be created from file", () => {
		expect(paceup.getServices().length).toBe(2);
	});

	it("should get filtered list of services", () => {
		expect(paceup.getServices("*api*").length).toBe(1);
	});


	describe("that is cloned or updated", () => {

		beforeEach(done => {
			paceup.cloneOrUpdateServices().then(done).catch(done.fail);
		});

		afterEach(() => {
			paceup.killAll();
		});

		it("should build services", done => {
			let batchBuild = paceup.build();

			expect(batchBuild.processes.length).toBe(2);

			batchBuild.processes.forEach(p => {
				expect(p.state).toBe("running");
				expect(["fruster-api-gateway", "fruster-auth-service"]).toContain(p.id);
			});

			batchBuild.whenAllDone().then(() => {
					batchBuild.processes.forEach(p => {
						expect(p.state).toBe("terminated");
						expect(p.exitCode).toBe(0);
					});
					done();
				})
				.catch(done.fail);
		});

		it("should start services (and probably fail to do so)", done => {
			let onDataCounter = 0;
			let batchStart = paceup.start((data) => {
				onDataCounter++;
			});

			expect(batchStart.processes.length).toBe(2);

			batchStart.processes.forEach(p => {
				expect(p.state).toBe("running");
				expect(["fruster-api-gateway", "fruster-auth-service"]).toContain(p.id);
			});

			// Note: Either stop test after 1 sec or end when exit promise is resolved
			setTimeout(() => batchStart.processes.forEach(expectRunningOrTerminatedProcess), 1000);

			batchStart.whenAllDone()
				.then(expectRunningOrTerminatedProcess)
				.catch(done.fail);
			
			function expectRunningOrTerminatedProcess(p) {
				expect(["running", "terminated"]).toMatch(p.state);
				expect(p.output.length).toBeGreaterThan(0);
				expect(onDataCounter).toBeGreaterThan(p.output.length);
				done();
			}
		});

	});

});