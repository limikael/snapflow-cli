import Workflow from "./Workflow.js";
import {urlGetArgs, netTry} from "../utils/js-util.js";
import {Table} from "console-table-printer";
import {QuickminApi} from "quickmin-api";
import {createQuickRpcProxy} from "fullstack-utils/quick-rpc";
import {HTTPException} from "hono/http-exception";
import urlJoin from "url-join";
import chalk from "chalk";

export default class SnapflowProject {
	constructor({workflows, prefix, name, url, token, client}) {
		if (url!="https://snapflow.com.au")
			console.log("Using non-default url: "+url);

		let headers={};
		if (token) {
			headers=new Headers({
				authorization: "Bearer "+token
			});
		}

		else  {
			console.log("Not logged in, functionality is limited.");
		}

		this.client=client;
		this.url=url;
		this.token=token;
		this.name=name;
		this.prefix=prefix;
		this.qm=new QuickminApi({
			url: urlJoin(url,"admin"),
			fetch: fetch.bind(globalThis),
			headers: headers
		});

		this.rpc=createQuickRpcProxy({
			url: urlJoin(url,"quickrpc"),
			headers: headers
		});

		this.workflows=[];
		for (let workflowSpec of workflows)
			this.addWorkflow(new Workflow(workflowSpec));
	}

	addWorkflow(workflow) {
		workflow.setProject(this);
		this.workflows.push(workflow);
	}

	async getLogs() {
		return await this.qm.findMany("logs",{project: this.name});
	}

	async getUser() {
		if (!this.user) {
			this.user=await this.rpc.getUserInfo();
			if (!this.user)
				throw new Error("Unable to get user info.");

			if (!this.user.cloudflare_api_token)
				throw new Error("Cloudflare API token not set for your user.");

			if (!this.user.cloudflare_account_id)
				throw new Error("Cloudflare Account ID not set for your user.");
		}

		return this.user;
	}

	async getWorkerUrl() {
        let user=await this.getUser();

        let u=`https://api.cloudflare.com/client/v4/accounts/${user.cloudflare_account_id}/workers/subdomain`;
        let subdomainResponse=await fetch(u,{
        	headers: {
        		"authorization": "Bearer "+user.cloudflare_api_token,
        		"content-type": "application/json"
        	}
        });

        if (subdomainResponse.status<200 || subdomainResponse.status>=300)
        	throw new Error("Cloudflare api response: "+subdomainResponse.status+" "+await subdomainResponse.text());

        let subdomainResult=await subdomainResponse.json();
        return "https://"+this.name+"."+subdomainResult.result.subdomain+".workers.dev";
	}

	async getScriptInfo() {
        let user=await this.getUser();

        let u=`https://api.cloudflare.com/client/v4/accounts/${user.cloudflare_account_id}/workers/scripts`;
        let scriptsResponse=await fetch(u,{
        	headers: {
        		"authorization": "Bearer "+user.cloudflare_api_token,
        		"content-type": "application/json"
        	}
        });

        if (scriptsResponse.status<200 || scriptsResponse.status>=300)
        	throw new Error("Cloudflare api response: "+scriptsResponse.status+" "+await scriptsResponse.text());

        let scriptsResult=await scriptsResponse.json();
        let scriptsById=Object.fromEntries(scriptsResult.result.map(r=>[r.id,r]));

        return scriptsById[this.name];
	}

	async printInfo() {
		let t=new Table({
			columns: [
				{name: "key", alignment: "left", color: "white_bold", title: chalk.white("name") },
				{name: "value", alignment: "left", title: chalk.reset.dim(this.name) },
			]
		});

        let user=await this.rpc.getUserInfo();

		t.addRow({key: "client", value: this.client});
		t.addRow({key: "user", value: user.name});
		t.addRow({key: "worker url", value: await this.getWorkerUrl()});

		let scriptInfo=await this.getScriptInfo();
		let deployedString;
		if (scriptInfo)
			deployedString=scriptInfo.modified_on;

		else
			deployedString="no";

		t.addRow({key: "deployed", value: deployedString});

		let logs=await this.getLogs();
		t.addRow({key: "invocations", value: logs.length});
		t.addRow({key: "errors", value: logs.filter(l=>l.status!="success").length});

		t.printTable();
	}

	async printWorkflowList() {
		let logs=await this.getLogs();

		let t=new Table({
			columns: [
				{name: "workflow", alignment: "left" },
				{name: "schedule", alignment: "left" },
				{name: "invocations", alignment: "left" },
				{name: "errors", alignment: "left" },
			]
		});

		let infoTable=[];
		for (let workflow of this.workflows)
			t.addRow({
				workflow: workflow.name,
				schedule: workflow.module.SCHEDULE,
				invocations: logs.filter(l=>l.workflow==workflow.name).length,
				errors: logs.filter(l=>(l.workflow==workflow.name && l.status!="success")).length
			})

		t.printTable();
	}

	async printWorkflowTriggers() {
		let t=new Table({
			columns: [
				{name: "trigger", alignment: "left" },
			]
		});

		let workerUrl=await this.getWorkerUrl();

		let infoTable=[];
		for (let workflow of this.workflows)
			t.addRow({
				trigger: urlJoin(workerUrl,workflow.name)
			})

		t.printTable();
	}

	getWorkflow(workflowName) {
		for (let workflow of this.workflows)
			if (workflow.name==workflowName)
				return workflow;
	}

	getCrons() {
		let crons=[];
		for (let workflow of this.workflows) {
			let schedule=workflow.getSchedule();
			if (schedule && !crons.includes(schedule))
				crons.push(schedule);
		}

		return crons;
	}

	async triggerCron(cron, env, ctx) {
		for (let workflow of this.workflows)
			if (cron==workflow.getSchedule()) {
				try {
					await workflow.run({trigger: "schedule",env,ctx});
				}

				catch (e) {
					console.log("Caught error during cron...");
					console.error(e);
				}
			}
	}

	handleHonoRequest=async (c)=>{
		let query;
		if (c.req.headers.get("content-type")=="application/json")
			query=await c.req.json();

		else 
			query=await c.req.parseBody();

		if (c.req.method!="POST")
			throw new HTTPException(400,{message:"Need post."});

		let argv=urlGetArgs(c.req.raw.url);
		if (argv.length!=1)
			throw new HTTPException(404,{message:"Expected workflow name in the url."});

		let workflow=this.getWorkflow(argv[0]);
		if (!workflow)
			throw new HTTPException(404,{message:"Undefined workflow."});

		let ctx;
		if (c.get("runtime")=="cf")
			ctx=c.executionCtx;

		let context=await workflow.run({
			trigger: "hook", 
			query: query, 
			request: c.req.raw,
			env: c.env,
			ctx: ctx
		});

		return context.getResponse();
	}
}