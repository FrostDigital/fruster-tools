const serviceReg = require("../service-registry");
const path = require("path");
const utils = require("../utils");
const YAML = require("yamljs");
const log = require("../log");
const handlebars = require("handlebars");
const fs = require("fs");

const serviceDocFilename = "service.yaml";

module.exports = {
	generate: generate
};

function generate(serviceRegistryPath, destPath) {
	return serviceReg.create(serviceRegistryPath).then(serviceRegistry => {		
		new ServicDocumentation(serviceRegistry, destPath).build(destPath);
	});
}

class ServicDocumentation {

	constructor(serviceRegistry) {		
		this.serviceRegistry = serviceRegistry;
		this.serviceDocs = this.parseServiceYamls();
	}

	parseServiceYamls() {
		return this.serviceRegistry.services.map(service => {

			let serviceDocFilePath = path.join(service.workDir, serviceDocFilename);
			let fileContent = utils.readFile(serviceDocFilePath);

			if(fileContent) {	
				try {
					return YAML.parse(fileContent);			
				} catch(e) {
					log.error(`Invalid yaml in file ${serviceDocFilePath}`, e);
				}
				
			} else {
				log.warn(`${service.name} is missing ${serviceDocFilename} (looked in ${serviceDocFilePath})`);
			}		
			
		}).filter(o => !!o)
	}

	build(destPath = "./docs") {	
		// Read file to memory
		let layoutTemplate = utils.readFile(path.join(__dirname, "templates", "layout.hbs"));
		let serviceTemplateContent = utils.readFile(path.join(__dirname, "templates", "service.hbs"));
		
		// Register partials to (before compile templates)
		handlebars.registerPartial("layout", layoutTemplate);

		// Compile templates
		let serviceTemplate = handlebars.compile(serviceTemplateContent);

		// Make sure dest dir exists		
		if(!utils.hasDir(destPath, true)) {
			fs.mkdirSync(destPath);
		}
		
		this.serviceDocs.forEach(service => {			
			let filename = (service.serviceName.toLowerCase() + ".html").split(" ").join("-");
			let filePath = path.join(destPath, filename);
			
			let html = serviceTemplate({
				title: utils.capitalize(this.serviceRegistry.name + " Documentation") + ": " + service.name,
				service: service
			});

			fs.writeFileSync(filePath, html);
		});

	}

}
