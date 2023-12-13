import SnapflowContext from "./SnapflowContext.js";
import {captureConsole} from "../utils/capture-console.js";

export default class Workflow {
	constructor({client, name, module}) {
		this.client=client;
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
		console.log("Running workflow: "+this.client+"/"+this.name);

		let context=new SnapflowContext({workflow: this, trigger, query, request});
		await context.initLogEntry();

		let result;
		let logLines=[];
		try {
			await captureConsole(logLines,async()=>{
				await context.initialize();
				result=await this.module.default(context);
				await context.finalizeLogEntry({
					status: "success", 
					result: result, 
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