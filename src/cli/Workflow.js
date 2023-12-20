import SnapflowContext from "./SnapflowContext.js";
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

	async run({trigger, query, request, ctx, env}) {
		console.log("Running workflow: "+this.name);
		//console.log("project: ",this.project);

		let context=new SnapflowContext({workflow: this, trigger, query, request, ctx, env});
		await context.run();

		return context;
	}
}