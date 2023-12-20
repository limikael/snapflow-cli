import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import {isPlainObject} from "../utils/js-util.js";
import {captureConsole} from "../utils/capture-console.js";

dayjs.extend(utc);

export default class SnapflowContext {
	constructor({workflow, trigger, query, request}) {
		this.workflow=workflow;
		this.project=this.workflow.project;
		this.request=request;
		this.qm=this.project.qm;
		this.rpc=this.project.rpc;
		this.trigger=trigger;
		this.query=query;
		if (!this.query)
			this.query={};

		this.logLines=[];
		this.tokens={};
	}

	async initialize() {
		console.log("getting user: "+this.project.client);

		try {
			this.user=await this.qm.findOne("users",{name: this.project.client});
			console.log("got user: ",this.user);
		}

		catch (e) {
			console.log("caught...");
			console.log(e);
			console.log(e.stack);
			throw e;
		}


		if (!this.user)
			throw new Error("Unable to find client user: "+this.project.client);

		console.log("getting tokens");

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

	async run() {
		console.log("running...");

		this.logLines=[];
		await captureConsole(this.logLines,async ()=>{
			try {
				console.log("initializing...");

				await this.initialize();
				console.log("done initializing...");

				let response=await this.workflow.module.default(this);

				console.log("did run workflow...");

				if (!response)
					response=new Response();

				else if (isPlainObject(response) || typeof response=="string")
					response=Response.json(response);

				this.response=response;
			}

			catch (e) {
				console.log(e.stack);
				this.response=new Response(String(e),{status: 500});
			}
		})
	}

	getResponse() {
		return this.response;
	}
}