export function netTry(res, fn) {
	fn().catch(e=>{
		res.statusCode=500;
		res.end(e.message);
	});
}

export function splitPath(pathname) {
	if (pathname===undefined)
		throw new Error("Undefined pathname");

	return pathname.split("/").filter(s=>s.length>0);
}

export function urlGetArgs(url) {
	return splitPath(new URL(url).pathname);
}

export function urlGetParams(url) {
	let u=new URL(url);
	return Object.fromEntries(u.searchParams);
}

export function isPlainObject(value) {
	if (typeof value!=='object' || value===null)
		return false;

	return Object.getPrototypeOf(value)===Object.getPrototypeOf({})
}
