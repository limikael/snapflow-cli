import HookEvent from "./HookEvent.js";

export default class HookRunner {
	constructor() {
		this.listeners=[];
	}

	on(event, func, options={}) {
		if (!options.description)
			throw new Error("Hook registrations need description");

		options={...options, event, func};
		this.listeners.push(options);
	}

	getListenersByEvent() {
		let listenersByEvent={};
		for (let listener of this.listeners) {
			if (!listenersByEvent[listener.event])
				listenersByEvent[listener.event]=[];

			listenersByEvent[listener.event].push(listener);
		}

		return listenersByEvent;
	}

	getListenersForEvent(eventType) {
		let listenersByEvent=this.getListenersByEvent();
		let listeners=listenersByEvent[eventType];
		if (!listeners)
			listeners=[];

		return listeners;
	}

	async emit(event, eventOptions) {
		if (typeof event=="string")
			event=new HookEvent(event,eventOptions);

		else
			if (eventOptions)
				throw new Error("Event options only allowed if event is a string.");

		for (let listener of this.getListenersForEvent(event.type)) {
			await listener.func(event);
		}
	}
}