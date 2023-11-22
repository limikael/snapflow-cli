import {AsyncLocalStorage} from 'node:async_hooks';
import util from "node:util";
import {isPlainObject} from "./js-util.js";

const asyncLocalStorage = new AsyncLocalStorage();
let captureConsoleInstalled=false;

function formatLogArgs(args) {
	return args.map(arg=>{
		if (typeof arg=="string")
			return arg;

		else
			return util.inspect(arg);
	}).join(" ");
}

function getDirOutput(label, val) {
	if (isPlainObject(val)) {
		let res=[];
		for (let k in val)
			res.push(...getDirOutput(label+"."+k,val[k]))

		return res;
	}

	else if (Array.isArray(val)) {
		let res=[];
		for (let i in val)
			res.push(...getDirOutput(label+"["+i+"]",val[i]))

		return res;
	}

	else {
		return [label+" = "+util.inspect(val)];
	}
}

export function installCaptureConsole() {
	if (captureConsoleInstalled)
		return;

	let originalConsoleLog=console.log;
	console.log=(...args)=>{
		let logLines=asyncLocalStorage.getStore();
		if (logLines)
			logLines.push(formatLogArgs(args));

		originalConsoleLog(...args);
	}

	console.dir=(arg)=>{
		console.log("Object:\n"+getDirOutput("    ",arg).join("\n"));
	}

	captureConsoleInstalled=true;
}

export function captureConsole(lines, fn) {
	installCaptureConsole();

	return new Promise((resolve, reject)=>{
		asyncLocalStorage.run(lines,async ()=>{
			try {
				let result=await fn();
				resolve(result);
			}

			catch (e) {
				lines.push(e.stack);
				reject(e);
			}
		});
	})
}