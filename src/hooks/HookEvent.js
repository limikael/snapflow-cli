export default class HookEvent {
	constructor(type, options={}) {
		Object.assign(this,options);
		this.type=type;
	}
}