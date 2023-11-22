import {fetchEx} from "snapflow-cli";

// Tokens needed by the workflow.
// E.g., to use hubspot credentials, add "hubspot" to this array:
// export const TOKENS=["hubspot"];
export const TOKENS=[];

// Cron expression for scheduling the workflow.
// E.g., to schedule the workflo to run every minute, do:
// export const SCHEDULE="* * * * *";
export const SCHEDULE="";

// This function is the actual workflow.
// The context parameter will contain all tokens defined above. 
// E.g. to get all deals from hubspot, you would do:
// let response=await fetch("https://api.hubapi.com/crm/v3/objects/deals",{
//     headers: {
//         authorization: "Bearer "+await context.getClientToken("hubspot")
//     }
// });
// let deals=await response.json();
export default async function(context) {
	console.log("hello, I'm the workflow...");

	return "hello world";
}