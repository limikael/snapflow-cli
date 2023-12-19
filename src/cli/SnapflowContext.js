import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import {isPlainObject} from "../utils/js-util.js";

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

	async initLogEntry() {
		let logItem=await this.qm.insert("logs",{
			workflow: this.workflow.name,
			trigger: this.trigger,
			query: this.query,
			stamp: dayjs().utc().format("YYYY-MM-DD HH:mm:ss")
		});
		this.logId=logItem.id;
	}

	log(...args) {
		console.log(...args);
	}

	async finalizeLogEntry({status, result, log}) {
		let data={
			status: status,
			result: result,
			log: log
		};

		if (this.user)
			data.user=this.user.id;

		await this.qm.update("logs",this.logId,data);
	}
}