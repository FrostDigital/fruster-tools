const path = require("path");
const utils = require("../lib/utils");

process.env.FRUSTER_HOME = path.join(__dirname, ".tmp-fruster-home");

const svcReg = require("../lib/service-registry");
const ServiceDocumentation = require("../lib/doc-generator/service-documentation");

xdescribe("Document generator", () => {
	
	let paceupServiceReg;
	let paceupServiceDocs;

	const testDocDir = path.join(__dirname, "..", ".tmp-docs");

	beforeEach(done => {
		svcReg.create(path.join(__dirname, "support", "fruster-paceup.json"))
		.then(serviceRegistry => {
			paceupServiceReg = serviceRegistry;
			paceupServiceDocs = new ServiceDocumentation(paceupServiceReg);
			done();
		})
		.catch(done.fail);
	});

	
	it("should parse service.yaml files", () => {
		let authServiceDocs = paceupServiceDocs.serviceDocs[0];

		expect(authServiceDocs.serviceName).toBe("Fruster auth service");
		expect(authServiceDocs.file).toBe("fruster-auth-service.html");
		expect(authServiceDocs.exposing.length).toBeGreaterThan(0);
		expect(authServiceDocs.errors.length).toBeGreaterThan(0);
		
	});

	it("should build documentation", () => {

		paceupServiceDocs.build(testDocDir);
		
		let authServiceDocsModel = paceupServiceDocs.serviceDocs[0];
		let authServiceHtml = utils.readFile(path.join(testDocDir, "service-docs", authServiceDocsModel.file));

		console.log(authServiceDocsModel.exposing);
		
		expect(authServiceHtml).toMatch(`href="${authServiceDocsModel.file}"`);
		expect(authServiceHtml).toMatch(`<title>Test documentation: ${authServiceDocsModel.serviceName}</title>`);
		expect(authServiceHtml).toMatch(`<h1>${authServiceDocsModel.serviceName}</h1>`);
	});
});