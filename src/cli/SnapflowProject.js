import Workflow from "./Workflow.js";
import {urlGetArgs, netTry} from "../utils/js-util.js";
import {Table} from "console-table-printer";
import {QuickminApi} from "quickmin-api";
import {createQuickRpcProxy} from "fullstack-utils/quick-rpc";
import {HTTPException} from "hono/http-exception";
import urlJoin from "url-join";

export default class SnapflowProject {
	constructor({workflows, prefix, name, url, token}) {
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

	printInfo() {
		let t=new Table({
			columns: [
				{ name: "client", alignment: "left" },
				{ name: "workflow", alignment: "left" },
				{ name: "tokens", alignment: "left" },
				{ name: "schedule", alignment: "left" },
			]			
		});

		let infoTable=[];
		for (let workflow of this.workflows)
			t.addRow({
				client: workflow.client,
				workflow: workflow.name,
				tokens: workflow.module.TOKENS,
				schedule: workflow.module.SCHEDULE
			})

		t.printTable();
	}

	getWorkflow(client, workflowName) {
		for (let workflow of this.workflows)
			if (workflow.client==client && workflow.name==workflowName)
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

	async triggerCron(cron) {
		for (let workflow of this.workflows)
			if (cron==workflow.getSchedule()) {
				try {
					await workflow.run({trigger: "schedule"});
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
		if (argv.length!=2)
			throw new HTTPException(404,{message:"Should be client/workflow."});

		let workflow=this.getWorkflow(argv[0],argv[1]);
		if (!workflow)
			throw new HTTPException(404,{message:"Undefined workflow."});

		let result;
		try {
			result=await workflow.run({trigger: "hook", query: query});
		}

		catch (e) {
			throw new HTTPException(500,{message: e.message});
		}

		if (result===undefined)
			return new Response();

		return Response.json(result);
	}
}