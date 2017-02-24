const path = require("path");
const utils = require("../utils");
const YAML = require("yamljs");
const log = require("../log");
const handlebars = require("handlebars");
const marked = require("marked");
const fs = require("fs-extra");

const serviceDocFilename = "service.yaml";

module.exports = class ServiceDocumentation {

	constructor(serviceRegistry) {		
		this.serviceRegistry = serviceRegistry;
		this.serviceDocs = this.parseServiceYamls();		
	}

	parseServiceYamls() {
		return this.serviceRegistry.services.map(service => {			
			let serviceDocFilePath = path.join(service.workDir, serviceDocFilename);
			let fileContent = utils.readFile(serviceDocFilePath);

			if(fileContent) {	
				log.info(`Found ${serviceDocFilePath}`);
				try {
					let serviceDocsAsJson = YAML.parse(fileContent);
					
					serviceDocsAsJson.file = this.getServiceHTMLFile(serviceDocsAsJson.serviceName);

					// Convert map/object to array and set subject (which is the key in YAML) to 
					// a property on the object for easy access in templates
					serviceDocsAsJson.exposing = Object.keys(serviceDocsAsJson.exposing).map(key => {
						serviceDocsAsJson.exposing[key].subject = key;
						return serviceDocsAsJson.exposing[key];
					}).sort();
				
					return serviceDocsAsJson;
				} catch(e) {					
					log.error(`Invalid yaml in file ${serviceDocFilePath}`, e);
				}
				
			} else {
				log.warn(`${service.name} is missing ${serviceDocFilename} (looked in ${serviceDocFilePath})`);
			}		
			
		}).filter(o => !!o);
	}

	build(destPath = "./docs") {		
		// Read file to memory
		let layoutTemplate = utils.readFile(path.join(__dirname, "templates", "layout.hbs"));
		let serviceTemplateContent = utils.readFile(path.join(__dirname, "templates", "service.hbs"));
		
		// Copy assets folder
		fs.copySync(path.join(__dirname, "templates", "assets"), path.join(destPath, "assets"));

		// Register partials to (before compile templates)
		handlebars.registerPartial("layout", layoutTemplate);

		handlebars.registerHelper("each", (context, options) => {
		  let ret = "";

		  for(let i = 0, j = context.length; i < j; i++) {
		    ret = ret + options.fn(context[i]);
		  }
		  return ret;
		});

		handlebars.registerHelper("markdown", function(text) {
		  return new handlebars.SafeString(marked(text, { breaks: true }));
		});

		// Compile templates
		let serviceTemplate = handlebars.compile(serviceTemplateContent);

		// Make sure dest dir exists		
		if(!utils.hasDir(destPath, true)) {
			fs.mkdirSync(destPath);
		}
		
		this.serviceDocs.forEach(service => {				
			fs.ensureDirSync(path.join(destPath, "service-docs"));		
			fs.ensureDirSync(path.join(destPath, "api-docs"));		
			
			let filePath = path.join(destPath, "service-docs", service.file);			
			
			let html = serviceTemplate({
				title: utils.capitalize(this.serviceRegistry.name + " Documentation") + ": " + service.serviceName,
				service: service,
				services: this.serviceDocs
			});
			
			log.debug(`Writing service docs file ${filePath}`);

			fs.writeFileSync(filePath, html);
		});

	}

	getServiceHTMLFile(serviceName) {
		return (serviceName.toLowerCase() + ".html").split(" ").join("-");	
	}

}
