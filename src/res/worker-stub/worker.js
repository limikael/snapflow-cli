import {SnapflowProject, Hono} from "snapflow-cli";

let projectSpec={
	workflows: [$$WORKFLOW_LIST$$],
	...$$PROJECT_SPEC$$
};

let app=new Hono();

app.post("*",async (c)=>{
	let project=new SnapflowProject(projectSpec);
	return await project.handleHonoRequest(c);
});

export default {
	async fetch(req, env, ctx) {
		return await app.fetch(req, env, ctx);
	},

	async scheduled(evt, env, ctx) {
		console.log("Running scheduled, cron="+evt.cron);

		let project=new SnapflowProject(projectSpec);
		await project.triggerCron(evt.cron);
	}
};