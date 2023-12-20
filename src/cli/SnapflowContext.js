import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import {isPlainObject, loggableResponse} from "../utils/js-util.js";
import {captureConsole} from "../utils/capture-console.js";

dayjs.extend(utc);

export default class SnapflowContext {
	constructor({workflow, trigger, query, request, env, ctx}) {
		this.workflow=workflow;
		this.project=this.workflow.project;
		this.request=request;
		this.qm=this.project.qm;
		this.rpc=this.project.rpc;
		this.trigger=trigger;
		this.query=query;
		if (!this.query)
			this.query={};

		this.env=env;
		if (!this.env)
			this.env={};

		this.ctx=ctx;

		this.logLines=[];
		this.tokens={};

		this.dummyWaitUntils=[];
	}

	async initialize() {
		this.user=await this.qm.findOne("users",{name: this.project.client});
		if (!this.user)
			throw new Error("Unable to find client user: "+this.project.client);

		let tokens=await this.qm.findMany("tokens",{user: this.user.id});
		let tokensByProvider=Object.fromEntries(tokens.map(t=>[t.provider,t]));

		for (let name of this.workflow.getRequiredTokens())
			this.tokens[name]=await this.rpc.getClientToken(this.user.id,name);

		let values=await this.qm.findMany("values",{user: this.user.id});
		this.values=Object.fromEntries(values.map(v=>[v.name,v.value]));
	}

	async getClientToken(name) {
		if (!this.tokens[name]) {
			this.tokens[name]=await this.rpc.getClientToken(this.user.id,name);
		}

		return this.tokens[name];
	}

	async getClientValue(name) {
		return this.values[name]
	}

	async setClientValue(name, value) {
		this.values[name]=value;
		let valueItem=await this.qm.findOne("values",{user: this.user.id, name: name});
		if (valueItem) {
			await this.qm.update("values",valueItem.id,{
				value: value
			});
		}

		else {
			await this.qm.insert("values",{
				user: this.user.id,
				name: name,
				value: value
			});
		}
	}

	waitUntil(promise) {
		if (this.ctx) {
			//console.log("real wait until!");
			this.ctx.waitUntil(promise);
		}

		else {
			//console.log("dummy wait until...");
			this.dummyWaitUntils.push(promise);
		}
	}

	async run() {
		this.logLines=[];
		await captureConsole(this.logLines,async ()=>{
			try {
				await this.initialize();
				let response=await this.workflow.module.default(this);

				if (!response)
					response=new Response();

				else if (isPlainObject(response) || typeof response=="string")
					response=Response.json(response);

				this.response=response;
				this.success=true;
			}

			catch (e) {
				console.log(e.stack);
				this.response=new Response(String(e),{status: 500});
			}
		})

		this.waitUntil(this.saveLog());

		await Promise.all(this.dummyWaitUntils);
	}

	getResponse() {
		return this.response;
	}

	async saveLog() {
		let logEntry={
			project: this.project.name,
			workflow: this.workflow.name,
			trigger: this.trigger,
			query: this.query,
			stamp: dayjs().utc().format("YYYY-MM-DD HH:mm:ss"),
			status: this.success?"success":"error",
			log: this.logLines.join("\n"),
		}

		if (this.response)
			logEntry.result=await loggableResponse(this.response);

		if (this.user)
			logEntry.user=this.user.id;

		await this.qm.insert("logs",logEntry);
	}
}