import SnapflowContext from "./SnapflowContext.js";
import {captureConsole} from "../utils/capture-console.js";
import {loggableResponse, isPlainObject} from "../utils/js-util.js";

export default class Workflow {
	constructor({name, module}) {
		this.name=name;
		this.module=module;
	}

	setProject(project) {
		this.project=project;
	}

	getRequiredTokens() {
		if (!this.module.TOKENS)
			return [];

		return this.module.TOKENS;
	}

	getSchedule() {
		let schedule=this.module.SCHEDULE;
		if (!schedule)
			schedule="";

		return schedule;
	}

	async run({trigger, query, request}) {
		console.log("Running workflow: "+this.name);
		//console.log("project: ",this.project);

		let context=new SnapflowContext({workflow: this, trigger, query, request});
		await context.initLogEntry();

		let result;
		let logLines=[];
		try {
			await captureConsole(logLines,async()=>{
				await context.initialize();
				result=await this.module.default(context);

				if (!result)
					result=new Response();

				else if (isPlainObject(result) || typeof result=="string")
					result=Response.json(result);

				await context.finalizeLogEntry({
					status: "success", 
					result: await loggableResponse(result), 
					log: logLines.join("\n")
				});
			});
		}

		catch (e) {
			await context.finalizeLogEntry({
				status: "error",
				log: logLines.join("\n")
			});
			throw e;
		}

		return result;
	}
}