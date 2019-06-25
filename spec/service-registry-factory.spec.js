const path = require("path");

process.env.FRUSTER_HOME = path.join(__dirname, ".tmp-fruster-home");

const svcReg = require("../lib/service-registry");

jasmine.DEFAULT_TIMEOUT_INTERVAL = 30 * 1000;

describe("Service registry", () => {
	let paceup;

	beforeEach(done => {
		process.env.AN_ENV_VAR = "12";

		svcReg
			.create(path.join(__dirname, "support", "fruster-paceup.json"))
			.then(serviceRegistry => {
				paceup = serviceRegistry;
				done();
			})
			.catch(done.fail);
	});

	afterEach(() => {
		delete process.env.AN_ENV_VAR;
	});

	it("should be created from file", async () => {
		const serviceRegistry = await svcReg.create(path.join(__dirname, "support", "fruster-paceup.json"));

		expect(serviceRegistry).toBeDefined();
		expect(serviceRegistry.services.length).toBe(2);
		expect(serviceRegistry.services[0].env.LOG_LEVEL).toBe("DEBUG");
		expect(serviceRegistry.services[0].env.FOO).toBe("12");
	});

	it("should get filtered list of services", () => {
		expect(paceup.getServices("*api*").length).toBe(1);
	});

	describe("with inheritance", () => {
		let serviceRegistry;

		beforeEach(async () => {
			serviceRegistry = await svcReg.create(
				path.join(__dirname, "support", "service-registry-inheritance", "extends.json")
			);
		});

		it("should inherit from extended service registry", () => {
			expect(serviceRegistry.services.length).toBe(3);
			expect(serviceRegistry.services[0].env.HELLO_FROM_SUPER).toBe("true");
			expect(serviceRegistry.services[0].env.FOO).toBe("BAR");
			expect(serviceRegistry.services[1].env.HELLO_FROM_SUPER).toBe("true");
			expect(serviceRegistry.name).toBe("test");

			let apiGateway = serviceRegistry.services.find(s => s.name === "fruster-api-gateway");
			expect(apiGateway.env.GLOBAL_ENV_VAR).toBe("overridden global env var");
			expect(apiGateway.env.NULL).toBeUndefined();
		});

		it("should get a flat representation when invoking toJSON()", () => {
			const json = serviceRegistry.toJSON();

			expect(json.services.length).toBe(3);
			expect(json.services[0].env.HELLO_FROM_SUPER).toBe("true");
			expect(json.services[0].env.FOO).toBe("BAR");
			expect(json.services[1].env.HELLO_FROM_SUPER).toBe("true");
			expect(json.name).toBe("test");
		});

		it("should extend service by name", () => {
			const json = serviceRegistry.toJSON();
			const serviceNames = json.services.map(s => s.name);

			expect(json.services.length).toBe(3);
			expect(serviceNames).toContain("fruster-api-gateway");
			expect(serviceNames).toContain("fruster-auth-service");
			expect(serviceNames).toContain("fruster-auth-service-2");

			const frusterAuthService2 = json.services.find(service => service.name === "fruster-auth-service-2");

			expect(frusterAuthService2.env.BAZ).toBe("BAZ");
			expect(frusterAuthService2.env.GLOBAL_ENV_VAR).toBe("global env var");
			expect(frusterAuthService2.repo).toBe("http://github.com/frostdigital/fruster-auth-service");
		});

		it("should interpolate env", () => {
			const json = serviceRegistry.toJSON();
			const frusterAuthService2 = json.services.find(service => service.name === "fruster-auth-service-2");
			expect(frusterAuthService2.env.INTERPOLATED_VALUE).toBe("INTERPOLATED!");
		});
	});
});
